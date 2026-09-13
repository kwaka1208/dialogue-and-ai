import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { config, isAiConfigured } from '../config.js';
import { consumeTurn, getRoom } from '../repos/rooms.js';
import {
  DuplicateNameError,
  countActive,
  joinRoom,
  markLeft,
  markRejoined,
} from '../repos/participants.js';
import { forRoom, getMessage, insertMessage, listMessages } from '../repos/messages.js';
import {
  attachToMessage,
  deleteAttachment,
  getAttachment,
  insertAttachment,
  listPending,
  listStalePending,
  toPublic,
} from '../repos/attachments.js';
import { startAiResponse, type AiSkipReason } from '../services/ai-responder.js';
import { abortRun, activeRun } from '../lib/ai-runs.js';
import { consume, retryAfterSeconds } from '../lib/rate-limit.js';
import { containsNgWord } from '../lib/word-filter.js';
import { addConnection, isConnected, presenceOf, publish } from '../lib/room-hub.js';
import { EventQueue } from '../lib/event-queue.js';
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  UploadRejected,
  readStoredFile,
  removeStoredFile,
  storeFile,
} from '../lib/uploads.js';
import { AI_HISTORY_LIMIT } from '../lib/prompt.js';
import { isPast, isoAfterHours } from '../lib/time.js';
import { sha256, safeEqual } from '../lib/ids.js';
import { participantAuth, participantCookieName, type ParticipantEnv } from '../middleware/participant.js';
import type { Message, Participant, Room, ServerEvent } from '../types.js';

const HEARTBEAT_MS = 15_000;
/** multipart の境界やヘッダーのぶん。Content-Length は本体より少し大きくなる */
const FORM_OVERHEAD_BYTES = 64 * 1024;
const HISTORY_LIMIT = 200;

/** 名前に改行やタブが混ざるとタイムラインが崩れるので落とす */
function cleanName(raw: string): string {
  return raw.replace(/[\r\n\t]/g, '').trim();
}

const joinSchema = z.object({
  displayName: z.string().transform(cleanName).pipe(z.string().min(1).max(12)),
  passcode: z.string().optional(),
});

const postMessageSchema = z.object({
  // 添付だけを送ることもできるので、本文は空でもよい
  body: z.string().trim().max(2000),
  attachmentIds: z.array(z.string()).max(MAX_FILES_PER_MESSAGE).default([]),
});

export const roomsRoute = new Hono();

/** 入室画面が最初に叩く。部屋の名前と、合言葉が要るかどうかだけ返す */
roomsRoute.get('/:id', (c) => {
  const room = getRoom(c.req.param('id'));
  if (!room) return c.json({ error: 'not_found' }, 404);

  return c.json({
    id: room.id,
    name: room.name,
    requiresPasscode: room.passcodeHash !== null,
    aiAvailable: isAiConfigured(),
    closed: isPast(room.expiresAt),
    expiresAt: room.expiresAt,
  });
});

roomsRoute.post('/:id/join', async (c) => {
  const roomId = c.req.param('id');
  const room = getRoom(roomId);
  if (!room) return c.json({ error: 'not_found' }, 404);
  if (isPast(room.expiresAt)) return c.json({ error: 'room_closed' }, 410);

  const parsed = joinSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_name' }, 400);

  if (room.passcodeHash) {
    const given = parsed.data.passcode ?? '';
    if (!given || !safeEqual(sha256(given), room.passcodeHash)) {
      return c.json({ error: 'wrong_passcode' }, 403);
    }
  }

  if (countActive(roomId) >= room.capacity) {
    return c.json({ error: 'room_full' }, 409);
  }

  let result;
  try {
    result = joinRoom(roomId, parsed.data.displayName);
  } catch (error) {
    if (error instanceof DuplicateNameError) return c.json({ error: 'name_taken' }, 409);
    throw error;
  }

  setCookie(c, participantCookieName(roomId), result.token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.isProduction,
    path: `/api/rooms/${roomId}`,
    maxAge: 60 * 60 * 12,
  });

  const systemMessage = insertMessage({
    roomId,
    kind: 'system',
    body: `${result.participant.displayName} さんが はいりました`,
  });
  publish(roomId, { type: 'message', message: forRoom(systemMessage) });

  return c.json({ participant: result.participant });
});

/** リロード後に入室済みかどうかを確かめる。cookie が生きていれば自分の情報が返る */
roomsRoute.get('/:id/me', participantAuth, (c) => c.json({ participant: c.get('participant') }));

roomsRoute.get('/:id/messages', participantAuth, (c) => {
  const room = c.get('room');
  return c.json({
    messages: listMessages(room.id, HISTORY_LIMIT).map(forRoom),
    participants: presenceOf(room.id),
  });
});

roomsRoute.post('/:id/messages', participantAuth, async (c) => {
  const room = c.get('room');
  const participant = c.get('participant');

  const parsed = postMessageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { body, attachmentIds } = parsed.data;
  if (body === '' && attachmentIds.length === 0) return c.json({ error: 'invalid_body' }, 400);

  // 連投でタイムラインが埋まるのを防ぐ。普通に打つぶんには当たらない上限
  if (!consume('message', participant.id, config.rateLimits.messagesPerMinute)) {
    return c.json(
      { error: 'too_fast', retryAfter: retryAfterSeconds('message', participant.id) },
      429,
    );
  }

  // 引っかかっても発言はそのまま部屋に出す。AIに意見を求められないことと、ログの印だけが変わる
  const flagged = containsNgWord(body);

  const created = insertMessage({
    roomId: room.id,
    kind: 'user',
    participantId: participant.id,
    body,
    flagged,
  });

  // 自分がアップロードした未送信のものだけが付く。取り違えは黙って落ちる
  attachToMessage(attachmentIds, created.id, participant.id);
  const message = getMessage(created.id)!;

  publish(room.id, { type: 'message', message: forRoom(message) });

  return c.json({ message: forRoom(message) });
});

/**
 * 「AIに いけんを きく」ボタン。
 * そこまでのやり取りについて、AIに意見を言ってもらう。発言は伴わない。
 */
roomsRoute.post('/:id/ai-opinion', participantAuth, (c) => {
  const room = c.get('room');
  const participant = c.get('participant');

  return c.json({ ai: requestOpinion(room, participant) });
});

/** 送られないまま残った添付を、実体ごと片づける */
async function sweepStalePending(): Promise<void> {
  for (const stale of listStalePending(isoAfterHours(-6))) {
    deleteAttachment(stale.id);
    await removeStoredFile(stale.storedPath).catch(() => undefined);
  }
}

/**
 * ファイルのアップロード。発言より先に送っておき、送信時に `attachmentIds` で紐づける。
 * 発言に紐づくまでは、上げた本人にしか見えない。
 */
roomsRoute.post('/:id/attachments', participantAuth, async (c) => {
  const room = c.get('room');
  const participant = c.get('participant');

  await sweepStalePending();

  if (listPending(participant.id).length >= MAX_FILES_PER_MESSAGE) {
    return c.json({ error: 'too_many_files' }, 409);
  }

  // parseBody はいったん全部メモリに載せるので、大きすぎるものは読む前に断る
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES + FORM_OVERHEAD_BYTES) {
    return c.json({ error: 'file_too_large' }, 413);
  }

  const form = await c.req.parseBody().catch(() => null);
  const file = form?.['file'];
  if (!(file instanceof File)) return c.json({ error: 'no_file' }, 400);

  let stored;
  try {
    stored = await storeFile(room.id, file);
  } catch (error) {
    if (error instanceof UploadRejected) return c.json({ error: error.reason }, 400);
    throw error;
  }

  const attachment = insertAttachment({
    roomId: room.id,
    participantId: participant.id,
    originalName: stored.originalName,
    mimeType: stored.mimeType,
    size: stored.size,
    storedPath: stored.storedPath,
    extractedText: stored.extractedText,
  });

  return c.json({ attachment: toPublic(attachment) }, 201);
});

/** 送る前に添付を取り消す。送ったあとのものは消せない */
roomsRoute.delete('/:id/attachments/:attachmentId', participantAuth, async (c) => {
  const participant = c.get('participant');
  const attachment = getAttachment(c.req.param('attachmentId'));

  if (!attachment || attachment.participantId !== participant.id) {
    return c.json({ error: 'not_found' }, 404);
  }
  if (attachment.messageId !== null) return c.json({ error: 'already_sent' }, 409);

  deleteAttachment(attachment.id);
  await removeStoredFile(attachment.storedPath).catch(() => undefined);

  return c.json({ ok: true });
});

/** 添付の中身を返す。部屋に入っている子だけが見られる */
roomsRoute.get('/:id/attachments/:attachmentId', participantAuth, async (c) => {
  const room = c.get('room');
  const participant = c.get('participant');
  const attachment = getAttachment(c.req.param('attachmentId'));

  if (!attachment || attachment.roomId !== room.id) return c.json({ error: 'not_found' }, 404);
  // まだ送られていないものは、上げた本人にしか見せない
  if (attachment.messageId === null && attachment.participantId !== participant.id) {
    return c.json({ error: 'not_found' }, 404);
  }

  let data: Buffer;
  try {
    data = await readStoredFile(attachment.storedPath);
  } catch {
    return c.json({ error: 'not_found' }, 404);
  }

  // MIME は allowlist で決めたものだけ。画像以外はブラウザで開かせず保存させる
  c.header('Content-Type', attachment.mimeType);
  c.header('Content-Length', String(data.byteLength));
  c.header('Cache-Control', 'private, max-age=3600');
  c.header(
    'Content-Disposition',
    `${attachment.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
  );

  return c.body(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
});

/**
 * 意見を求められるかどうかを判定し、生成を始める。
 *
 * 断る判定は、数を消費しないものから先に並べる。
 * 「混んでいて断られた」ぶんで参加者の枠や部屋のターンが減らないようにするため。
 */
function requestOpinion(room: Room, participant: Participant): 'started' | AiSkipReason {
  const recent = listMessages(room.id, AI_HISTORY_LIMIT);

  if (!recent.some((message) => message.kind === 'user')) return 'no_messages';
  // 前回の意見より後に印の付いた発言があれば、そこには触れさせない
  if (sinceLastOpinion(recent).some((message) => message.flagged)) return 'filtered';
  if (!isAiConfigured()) return 'unavailable';
  if (activeRun(room.id)) return 'busy';
  if (!consume('ai_turn', participant.id, config.rateLimits.aiTurnsPerMinute)) return 'rate_limited';
  if (!consumeTurn(room.id)) return 'turn_limit';

  // 誰が意見を求めたかは、部屋の全員に見えるようにしておく。
  // 意見の本体より先に入れないと、タイムラインで意見のあとに並んでしまう
  const notice = insertMessage({
    roomId: room.id,
    kind: 'system',
    body: `${participant.displayName} さんが AIに いけんを ききました`,
  });
  publish(room.id, { type: 'message', message: forRoom(notice) });

  // ここまで来ても、ほぼ同時のボタンに先を越されることはありうる
  if (!startAiResponse(room.id)) return 'busy';

  return 'started';
}

/** 直近の履歴のうち、いちばん新しいAIの意見より後のぶん。無ければ全部 */
function sinceLastOpinion(recent: Message[]): Message[] {
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index]!.kind === 'ai') return recent.slice(index + 1);
  }
  return recent;
}

/** 「とめる」ボタン。生成中のAIの応答を打ち切る */
roomsRoute.post('/:id/stop', participantAuth, (c) => {
  const stopped = abortRun(c.get('room').id);
  return c.json({ stopped });
});

roomsRoute.post('/:id/leave', participantAuth, (c) => {
  const room = c.get('room');
  const participant = c.get('participant');

  markLeft(participant.id);
  const systemMessage = insertMessage({
    roomId: room.id,
    kind: 'system',
    body: `${participant.displayName} さんが でていきました`,
  });
  publish(room.id, { type: 'message', message: forRoom(systemMessage) });
  deleteCookie(c, participantCookieName(room.id), { path: `/api/rooms/${room.id}` });

  return c.json({ ok: true });
});

roomsRoute.get('/:id/stream', participantAuth, (c) => {
  const room = c.get('room');
  const participant = c.get('participant');

  c.header('X-Accel-Buffering', 'no');

  return streamSSE(c, async (stream) => {
    const queue = new EventQueue<ServerEvent>();

    markRejoined(participant.id);

    // addConnection がこの接続を含む全員に presence を配るので、初期送信は要らない
    const unsubscribe = addConnection(room.id, {
      participantId: participant.id,
      displayName: participant.displayName,
      push: (event) => queue.push(event),
      // 強制退出でサーバー側から切るとき用。溜まっているぶんは流しきってから終わる
      close: () => queue.close(),
    });

    // プロキシに切られないよう定期的に何か送る
    const heartbeat = setInterval(() => queue.push({ type: 'ping' }), HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      queue.close();
      // 全部のタブを閉じたら退室扱いにする
      if (!isConnected(room.id, participant.id)) {
        markLeft(participant.id);
      }
    };

    stream.onAbort(cleanup);

    try {
      for await (const event of queue) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      }
    } finally {
      cleanup();
    }
  });
});
