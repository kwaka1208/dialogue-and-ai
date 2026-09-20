/**
 * 部屋の履歴からリクエストを組み立て、AIの応答を部屋の全員に流す。
 *
 * 応答は「空のメッセージを1件つくる → 差分を流す → 本文を確定させる」の順で進む。
 * 途中で入室した子にも同じものが見えるよう、進行中の本文は ai-runs が持つ。
 *
 * 部屋のモード (会話 / 意見) で変わるのは、組み立てるリクエストと、
 * 失敗したときに部屋へ出す文言だけ。流し方そのものは同じ。
 */
import {
  forRoom,
  insertMessage,
  listMessages,
  updateMessageBody,
  deleteMessage,
} from '../repos/messages.js';
import { AiEngineError, streamChatCompletion } from '../lib/ai-client.js';
import { AI_HISTORY_LIMIT, buildChatMessages, stripSpeakerPrefix } from '../lib/prompt.js';
import { createPlainTextFilter } from '../lib/plain-text.js';
import { startRun, endRun, type AiRun } from '../lib/ai-runs.js';
import { publish } from '../lib/room-hub.js';
import { resolveAiSettings } from '../lib/ai-settings.js';
import { buildAttachmentPayloads } from './attachment-context.js';
import type { AiMode, Message, Room } from '../types.js';

/**
 * AIを動かせなかった理由。フロントで子ども向けの文言に直す。
 * no_messages は意見モードだけで起きる (まだ誰も話しておらず、意見の材料が無い)。
 */
export type AiSkipReason =
  | 'busy'
  | 'unavailable'
  | 'turn_limit'
  | 'rate_limited'
  | 'filtered'
  | 'no_messages';

/**
 * 応答を開始する。開始できたら true。
 * 生成そのものは待たずに進むので、呼び出し側は POST の応答をすぐ返せる。
 */
export function startAiResponse(room: Room, mode: AiMode = room.aiMode): boolean {
  const roomId = room.id;
  // 履歴は空のプレースホルダを作る前に読む。自分自身を履歴に含めないため
  const history = listMessages(roomId, AI_HISTORY_LIMIT);
  const placeholder = insertMessage({ roomId, kind: 'ai', body: '' });

  const run = startRun(roomId, placeholder.id);
  if (!run) {
    deleteMessage(placeholder.id);
    return false;
  }

  publish(roomId, { type: 'ai_start', messageId: run.messageId });
  void generate(room, run, history, mode);
  return true;
}

/** 先頭が「なまえ:」かどうかを決めるために溜めておく文字数。名前は最大16文字まで見る */
const LEAD_BUFFER = 24;

async function generate(room: Room, run: AiRun, history: Message[], mode: AiMode): Promise<void> {
  const roomId = room.id;
  // 先頭の「なまえ:」を落とすため、最初だけ少し溜めてから流しはじめる
  let lead = '';
  let leadFlushed = false;
  // Markdown の飾りを落とす。判定待ちのぶんは filter が抱えるので最後に flush する
  const plain = createPlainTextFilter();

  const publishDelta = (text: string): void => {
    if (text === '') return;
    run.body += text;
    publish(roomId, { type: 'ai_delta', messageId: run.messageId, delta: text });
  };

  const emit = (text: string): void => {
    publishDelta(plain.push(text));
  };

  // 溜めたぶんを、接頭辞を落としてから流す。何度呼んでも1回しか効かない
  const flushLead = (): void => {
    if (leadFlushed) return;
    leadFlushed = true;
    emit(stripSpeakerPrefix(lead, history));
    lead = '';
  };

  // 流しきる。接頭辞の判定待ちと、飾りの判定待ちの両方を吐き出す
  const flushAll = (): void => {
    flushLead();
    publishDelta(plain.flush());
  };

  try {
    // 添付の読み込み (画像の base64 化) はここで一度だけ
    const attachments = await buildAttachmentPayloads(history);
    // system prompt もモデルも、部屋の設定があればそちらが勝つ。無ければ .env と既定
    const { systemPrompt, model } = resolveAiSettings(room, mode);
    const request = buildChatMessages(history, attachments, mode, systemPrompt);

    for await (const delta of streamChatCompletion(request, run.controller.signal, model)) {
      if (!leadFlushed) {
        lead += delta;
        // 改行が来たら1行目は出揃っている。判定を待つ理由はもうない
        if (lead.length < LEAD_BUFFER && !lead.includes('\n')) continue;
        flushLead();
        continue;
      }
      emit(delta);
    }
    flushAll(); // 溜めきらないまま終わる短い返事のため
    finish(roomId, run);
  } catch (error) {
    // 「とめる」で切ったときは失敗ではない。そこまでの本文を残して終わる
    if (run.stopped) {
      flushAll();
      finish(roomId, run);
      return;
    }
    fail(roomId, run, error, mode);
  } finally {
    endRun(roomId, run);
  }
}

function finish(roomId: string, run: AiRun): void {
  const body = run.body.trim();

  if (body === '') {
    deleteMessage(run.messageId);
    publish(roomId, {
      type: 'ai_error',
      messageId: run.messageId,
      reason: run.stopped ? 'stopped' : 'empty',
    });
    return;
  }

  updateMessageBody(run.messageId, body);
  publish(roomId, { type: 'ai_end', messageId: run.messageId, body });
}

/** 詳細はサーバーログへ。子どもの画面には「いま話せないみたい」だけ出す */
function fail(roomId: string, run: AiRun, error: unknown, mode: AiMode): void {
  const detail = error instanceof Error ? error.message : String(error);
  const timedOut = error instanceof Error && error.name === 'TimeoutError';
  console.error(
    `[ai] 部屋 ${roomId} の${mode === 'opinion' ? '意見の生成' : '応答'}に失敗しました (${error instanceof AiEngineError ? `status=${error.status ?? '-'}` : error instanceof Error ? error.name : 'unknown'}): ${detail}`,
  );

  deleteMessage(run.messageId);
  publish(roomId, {
    type: 'ai_error',
    messageId: run.messageId,
    reason: timedOut ? 'timeout' : 'failed',
  });

  // 何が起きたかは部屋の全員に見えるようにしておく
  const notice = insertMessage({
    roomId,
    kind: 'system',
    body: failureNotice(mode, timedOut),
  });
  publish(roomId, { type: 'message', message: forRoom(notice) });
}

/** 部屋の全員に出すお知らせ。モードによって「おへんじ」と「いけん」を言い分ける */
function failureNotice(mode: AiMode, timedOut: boolean): string {
  if (mode === 'opinion') {
    return timedOut
      ? 'AIの いけんが おそいので やめました。もういちど きいてみてね'
      : 'いま AIに いけんを きけないみたい。すこし してから もういちど きいてね';
  }
  return timedOut
    ? 'AIの おへんじが おそいので やめました。もういちど きいてみてね'
    : 'いま AIと おはなし できないみたい。すこし してから もういちど きいてね';
}
