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
import { insertMessage, listMessages } from '../repos/messages.js';
import { startAiResponse, type AiSkipReason } from '../services/ai-responder.js';
import { abortRun } from '../lib/ai-runs.js';
import { mentionsAi } from '../lib/prompt.js';
import { addConnection, isConnected, presenceOf, publish } from '../lib/room-hub.js';
import { EventQueue } from '../lib/event-queue.js';
import { isPast } from '../lib/time.js';
import { sha256, safeEqual } from '../lib/ids.js';
import { participantAuth, participantCookieName, type ParticipantEnv } from '../middleware/participant.js';
import type { Room, ServerEvent } from '../types.js';

const HEARTBEAT_MS = 15_000;
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
  body: z.string().trim().min(1).max(2000),
  askAi: z.boolean().default(false),
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
    replyMode: room.replyMode,
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
  publish(roomId, { type: 'message', message: systemMessage });

  return c.json({ participant: result.participant });
});

/** リロード後に入室済みかどうかを確かめる。cookie が生きていれば自分の情報が返る */
roomsRoute.get('/:id/me', participantAuth, (c) =>
  c.json({ participant: c.get('participant'), replyMode: c.get('room').replyMode }),
);

roomsRoute.get('/:id/messages', participantAuth, (c) => {
  const room = c.get('room');
  return c.json({
    messages: listMessages(room.id, HISTORY_LIMIT),
    participants: presenceOf(room.id),
  });
});

roomsRoute.post('/:id/messages', participantAuth, async (c) => {
  const room = c.get('room');
  const participant = c.get('participant');

  const parsed = postMessageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const message = insertMessage({
    roomId: room.id,
    kind: 'user',
    participantId: participant.id,
    body: parsed.data.body,
  });
  publish(room.id, { type: 'message', message });

  return c.json({ message, ai: triggerAi(room, parsed.data.body, parsed.data.askAi) });
});

/**
 * 呼びかけかどうかを判定し、応答を始める。
 * 発言そのものは保存ずみなので、AIが動かなくても部屋の会話は続く。
 */
function triggerAi(room: Room, body: string, askAi: boolean): 'started' | 'none' | AiSkipReason {
  const wanted = askAi || mentionsAi(body) || room.replyMode === 'always';
  if (!wanted) return 'none';

  if (!isAiConfigured()) return 'unavailable';
  if (!consumeTurn(room.id)) return 'turn_limit';
  if (!startAiResponse(room.id)) return 'busy';

  return 'started';
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
  publish(room.id, { type: 'message', message: systemMessage });
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
