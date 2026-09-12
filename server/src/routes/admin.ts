import { Hono } from 'hono';
import { z } from 'zod';
import { config, isAiConfigured } from '../config.js';
import { adminAuth } from '../middleware/admin.js';
import {
  createRoom,
  extendRoom,
  getRoom,
  listRooms,
  softDeleteRoom,
  updateRoom,
} from '../repos/rooms.js';
import { listMessages, countMessages, insertMessage } from '../repos/messages.js';
import { getParticipant, kickParticipant, listParticipants } from '../repos/participants.js';
import { deleteForRoom, listForRoom } from '../repos/attachments.js';
import { removeRoomDir } from '../lib/uploads.js';
import { disconnect, presenceOf, publish } from '../lib/room-hub.js';
import { isPast } from '../lib/time.js';
import type { Participant, Room } from '../types.js';

/** 管理画面でログを読むときの上限。エクスポートはこれとは別に全件返す */
const LOG_LIMIT = 500;

/** 合言葉のハッシュは管理画面にも返さない */
function publicRoom(room: Room): Omit<Room, 'passcodeHash'> & {
  hasPasscode: boolean;
  closed: boolean;
} {
  const { passcodeHash, ...rest } = room;
  return { ...rest, hasPasscode: passcodeHash !== null, closed: isPast(room.expiresAt) };
}

/** 参加者に「いま画面を開いているか」を足す。在室の判定は SSE の接続で見る */
function withPresence(roomId: string, participants: Participant[]): Array<Participant & { online: boolean }> {
  const online = new Set(presenceOf(roomId).map((entry) => entry.id));
  return participants.map((participant) => ({ ...participant, online: online.has(participant.id) }));
}

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  passcode: z
    .string()
    .regex(/^\d{4}$/, '合言葉は4桁の数字')
    .optional(),
  replyMode: z.enum(['mention', 'always']).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  turnLimit: z.number().int().min(1).max(10_000).optional(),
  expiresInHours: z.number().min(0.5).max(72).optional(),
});

/** 設定変更。渡された項目だけを書き換える */
const updateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    replyMode: z.enum(['mention', 'always']).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    turnLimit: z.number().int().min(1).max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '変更する項目がありません');

export const adminRoute = new Hono();

adminRoute.use('*', adminAuth);

/** トークンの確認用。管理画面がログイン状態を判定するために叩く */
adminRoute.get('/session', (c) =>
  c.json({
    ok: true,
    aiConfigured: isAiConfigured(),
    roomDefaults: config.roomDefaults,
    rateLimits: config.rateLimits,
  }),
);

adminRoute.post('/rooms', async (c) => {
  const parsed = createRoomSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, 400);
  }

  const room = createRoom(parsed.data);
  return c.json({ room: publicRoom(room), url: `/r/${room.id}` }, 201);
});

adminRoute.get('/rooms', (c) => {
  const rooms = listRooms().map((room) => ({
    ...publicRoom(room),
    messageCount: countMessages(room.id),
    onlineCount: presenceOf(room.id).length,
    url: `/r/${room.id}`,
  }));
  return c.json({ rooms });
});

/** 部屋1つの詳細。参加者と使用量をまとめて返す */
adminRoute.get('/rooms/:id', (c) => {
  const room = getRoom(c.req.param('id'));
  if (!room) return c.json({ error: 'not_found' }, 404);

  return c.json({
    room: publicRoom(room),
    participants: withPresence(room.id, listParticipants(room.id)),
    messageCount: countMessages(room.id),
    attachmentCount: listForRoom(room.id).length,
    url: `/r/${room.id}`,
  });
});

/** ログ閲覧。直近 LOG_LIMIT 件まで */
adminRoute.get('/rooms/:id/messages', (c) => {
  const room = getRoom(c.req.param('id'));
  if (!room) return c.json({ error: 'not_found' }, 404);

  const requested = Number(c.req.query('limit') ?? LOG_LIMIT);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), LOG_LIMIT) : LOG_LIMIT;

  return c.json({ messages: listMessages(room.id, limit), limit });
});

adminRoute.get('/rooms/:id/export', (c) => {
  const room = getRoom(c.req.param('id'));
  if (!room) return c.json({ error: 'not_found' }, 404);

  const body = {
    exportedAt: new Date().toISOString(),
    room: publicRoom(room),
    participants: listParticipants(room.id),
    messages: listMessages(room.id, 100_000),
  };

  c.header('Content-Disposition', `attachment; filename="room-${room.id}.json"`);
  return c.json(body);
});

adminRoute.patch('/rooms/:id', async (c) => {
  const parsed = updateRoomSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, 400);
  }

  const room = updateRoom(c.req.param('id'), parsed.data);
  if (!room) return c.json({ error: 'not_found' }, 404);
  return c.json({ room: publicRoom(room) });
});

adminRoute.post('/rooms/:id/extend', async (c) => {
  const hours = z.number().min(0.5).max(72).safeParse((await c.req.json().catch(() => ({})))?.hours);
  const room = extendRoom(c.req.param('id'), hours.success ? hours.data : 4);
  if (!room) return c.json({ error: 'not_found' }, 404);
  return c.json({ room: publicRoom(room) });
});

/**
 * 参加者の強制退出。
 * cookie が残っていても戻れないように DB に印を付け、開いている画面はその場で切る。
 */
adminRoute.post('/rooms/:id/participants/:participantId/kick', (c) => {
  const roomId = c.req.param('id');
  const room = getRoom(roomId);
  if (!room) return c.json({ error: 'not_found' }, 404);

  const target = getParticipant(c.req.param('participantId'));
  if (!target || target.roomId !== roomId) return c.json({ error: 'not_found' }, 404);
  if (target.kickedAt !== null) return c.json({ error: 'already_kicked' }, 409);

  const participant = kickParticipant(target.id)!;
  disconnect(roomId, participant.id);

  // 部屋の中には、自分で出ていったときと同じ形で見せる
  const systemMessage = insertMessage({
    roomId,
    kind: 'system',
    body: `${participant.displayName} さんが でていきました`,
  });
  publish(roomId, { type: 'message', message: systemMessage });

  return c.json({ participant });
});

/**
 * 部屋の削除。会話ログは論理削除で残し、添付ファイルは実体ごと消す。
 * ログが必要なら、消す前に /export を取っておくこと。
 */
adminRoute.delete('/rooms/:id', async (c) => {
  const roomId = c.req.param('id');
  if (!softDeleteRoom(roomId)) return c.json({ error: 'not_found' }, 404);

  // 開いたままの画面に「おわりました」を出す
  publish(roomId, { type: 'room_closed' });

  const removedAttachments = deleteForRoom(roomId);
  await removeRoomDir(roomId).catch((error: unknown) => {
    console.error(`[admin] 部屋 ${roomId} の添付の削除に失敗しました: ${String(error)}`);
  });

  return c.json({ ok: true, removedAttachments });
});
