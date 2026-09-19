import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { config, isAiConfigured } from '../config.js';
import { adminAuth, type AdminEnv } from '../middleware/admin.js';
import { adminAccountsRoute } from './admin-accounts.js';
import { getAccount } from '../repos/admin-accounts.js';
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
  /** 作った管理者のメールアドレス。特権管理者が一覧で見分けるために添える */
  ownerEmail: string | null;
} {
  const { passcodeHash, ...rest } = room;
  return {
    ...rest,
    hasPasscode: passcodeHash !== null,
    closed: isPast(room.expiresAt),
    ownerEmail: room.createdBy ? (getAccount(room.createdBy)?.email ?? null) : null,
  };
}

/**
 * 自分が管理してよい部屋を引く。
 * 他人の部屋は「無い」ものとして 404 にする。403 にすると、
 * IDを当てずっぽうに叩くだけで部屋の有無が分かってしまう。
 */
function ownedRoom(c: Context<AdminEnv>, roomId: string): Room | null {
  const room = getRoom(roomId);
  if (!room) return null;

  const admin = c.get('admin');
  if (admin.isSuper) return room;
  return room.createdBy === admin.account.id ? room : null;
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
  aiMode: z.enum(['chat', 'opinion']).optional(),
  replyMode: z.enum(['mention', 'always']).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  turnLimit: z.number().int().min(1).max(10_000).optional(),
  expiresInHours: z.number().min(0.5).max(72).optional(),
});

/** 設定変更。渡された項目だけを書き換える */
const updateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    aiMode: z.enum(['chat', 'opinion']).optional(),
    replyMode: z.enum(['mention', 'always']).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    turnLimit: z.number().int().min(1).max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '変更する項目がありません');

export const adminRoute = new Hono<AdminEnv>();

adminRoute.use('*', adminAuth);

/** ログイン状態と、自分の権限の確認。管理画面が起動時に叩く */
adminRoute.get('/session', (c) => {
  const admin = c.get('admin');
  return c.json({
    ok: true,
    account: { ...admin.account, isSuper: admin.isSuper },
    isSuper: admin.isSuper,
    aiConfigured: isAiConfigured(),
    roomDefaults: config.roomDefaults,
    rateLimits: config.rateLimits,
  });
});

// アカウントの登録・削除。中でさらに特権管理者だけに絞っている
adminRoute.route('/accounts', adminAccountsRoute);

adminRoute.post('/rooms', async (c) => {
  const parsed = createRoomSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, 400);
  }

  // 作った人を所有者として刻む。以後この部屋を触れるのは本人と特権管理者だけ
  const room = createRoom({ ...parsed.data, createdBy: c.get('admin').account.id });
  return c.json({ room: publicRoom(room), url: `/r/${room.id}` }, 201);
});

adminRoute.get('/rooms', (c) => {
  const admin = c.get('admin');
  // 特権管理者は全部屋。ほかは自分が作った部屋だけ
  const rooms = listRooms(admin.isSuper ? undefined : admin.account.id).map((room) => ({
    ...publicRoom(room),
    messageCount: countMessages(room.id),
    onlineCount: presenceOf(room.id).length,
    url: `/r/${room.id}`,
  }));
  return c.json({ rooms });
});

/** 部屋1つの詳細。参加者と使用量をまとめて返す */
adminRoute.get('/rooms/:id', (c) => {
  const room = ownedRoom(c, c.req.param('id'));
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
  const room = ownedRoom(c, c.req.param('id'));
  if (!room) return c.json({ error: 'not_found' }, 404);

  const requested = Number(c.req.query('limit') ?? LOG_LIMIT);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), LOG_LIMIT) : LOG_LIMIT;

  return c.json({ messages: listMessages(room.id, limit), limit });
});

adminRoute.get('/rooms/:id/export', (c) => {
  const room = ownedRoom(c, c.req.param('id'));
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

  if (!ownedRoom(c, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);

  const room = updateRoom(c.req.param('id'), parsed.data);
  if (!room) return c.json({ error: 'not_found' }, 404);
  return c.json({ room: publicRoom(room) });
});

adminRoute.post('/rooms/:id/extend', async (c) => {
  if (!ownedRoom(c, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);

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
  const room = ownedRoom(c, roomId);
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
  if (!ownedRoom(c, roomId)) return c.json({ error: 'not_found' }, 404);
  if (!softDeleteRoom(roomId)) return c.json({ error: 'not_found' }, 404);

  // 開いたままの画面に「おわりました」を出す
  publish(roomId, { type: 'room_closed' });

  const removedAttachments = deleteForRoom(roomId);
  await removeRoomDir(roomId).catch((error: unknown) => {
    console.error(`[admin] 部屋 ${roomId} の添付の削除に失敗しました: ${String(error)}`);
  });

  return c.json({ ok: true, removedAttachments });
});
