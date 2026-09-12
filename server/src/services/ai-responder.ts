/**
 * 部屋の履歴からリクエストを組み立て、AIの応答を部屋の全員に流す。
 *
 * 応答は「空のメッセージを1件つくる → 差分を流す → 本文を確定させる」の順で進む。
 * 途中で入室した子にも同じものが見えるよう、進行中の本文は ai-runs が持つ。
 */
import { insertMessage, listMessages, updateMessageBody, deleteMessage } from '../repos/messages.js';
import { AiEngineError, streamChatCompletion } from '../lib/ai-client.js';
import { AI_HISTORY_LIMIT, buildChatMessages, stripSpeakerPrefix } from '../lib/prompt.js';
import { startRun, endRun, type AiRun } from '../lib/ai-runs.js';
import { publish } from '../lib/room-hub.js';
import type { Message } from '../types.js';

/** 呼びかけを受け付けなかった理由。フロントで子ども向けの文言に直す */
export type AiSkipReason = 'busy' | 'unavailable' | 'turn_limit';

/**
 * 応答を開始する。開始できたら true。
 * 生成そのものは待たずに進むので、呼び出し側は POST の応答をすぐ返せる。
 */
export function startAiResponse(roomId: string): boolean {
  // 履歴は空のプレースホルダを作る前に読む。自分自身を履歴に含めないため
  const history = listMessages(roomId, AI_HISTORY_LIMIT);
  const placeholder = insertMessage({ roomId, kind: 'ai', body: '' });

  const run = startRun(roomId, placeholder.id);
  if (!run) {
    deleteMessage(placeholder.id);
    return false;
  }

  publish(roomId, { type: 'ai_start', messageId: run.messageId });
  void generate(roomId, run, history);
  return true;
}

/** 先頭が「なまえ:」かどうかを決めるために溜めておく文字数。名前は最大16文字まで見る */
const LEAD_BUFFER = 24;

async function generate(
  roomId: string,
  run: AiRun,
  history: Message[],
): Promise<void> {
  // 先頭の「なまえ:」を落とすため、最初だけ少し溜めてから流しはじめる
  let lead = '';
  let leadFlushed = false;

  const emit = (text: string): void => {
    if (text === '') return;
    run.body += text;
    publish(roomId, { type: 'ai_delta', messageId: run.messageId, delta: text });
  };

  // 溜めたぶんを、接頭辞を落としてから流す。何度呼んでも1回しか効かない
  const flushLead = (): void => {
    if (leadFlushed) return;
    leadFlushed = true;
    emit(stripSpeakerPrefix(lead, history));
    lead = '';
  };

  try {
    for await (const delta of streamChatCompletion(buildChatMessages(history), run.controller.signal)) {
      if (!leadFlushed) {
        lead += delta;
        // 改行が来たら1行目は出揃っている。判定を待つ理由はもうない
        if (lead.length < LEAD_BUFFER && !lead.includes('\n')) continue;
        flushLead();
        continue;
      }
      emit(delta);
    }
    flushLead(); // 溜めきらないまま終わる短い返事のため
    finish(roomId, run);
  } catch (error) {
    // 「とめる」で切ったときは失敗ではない。そこまでの本文を残して終わる
    if (run.stopped) {
      flushLead();
      finish(roomId, run);
      return;
    }
    fail(roomId, run, error);
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
function fail(roomId: string, run: AiRun, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  const timedOut = error instanceof Error && error.name === 'TimeoutError';
  console.error(
    `[ai] 部屋 ${roomId} の応答に失敗しました (${error instanceof AiEngineError ? `status=${error.status ?? '-'}` : error instanceof Error ? error.name : 'unknown'}): ${detail}`,
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
    body: timedOut
      ? 'AIの おへんじが おそいので やめました。もういちど きいてみてね'
      : 'いま AIと おはなし できないみたい。すこし してから もういちど きいてね',
  });
  publish(roomId, { type: 'message', message: notice });
}
