import { Hono } from 'hono';
import { z } from 'zod';
import { adminAuth } from '../middleware/admin.js';
import {
  createRoom,
  extendRoom,
  getRoom,
  listRooms,
  softDeleteRoom,
} from '../repos/rooms.js';
import { listMessages, countMessages } from '../repos/messages.js';
import { listParticipants } from '../repos/participants.js';
import { presenceOf, publish } from '../lib/room-hub.js';
import type { Room } from '../types.js';

/** 合言葉のハッシュは管理画面にも返さない */
function publicRoom(room: Room): Omit<Room, 'passcodeHash'> & { hasPasscode: boolean } {
  const { passcodeHash, ...rest } = room;
  return { ...rest, hasPasscode: passcodeHash !== null };
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

export const adminRoute = new Hono();

adminRoute.use('*', adminAuth);

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

adminRoute.post('/rooms/:id/extend', async (c) => {
  const hours = z.number().min(0.5).max(72).safeParse((await c.req.json().catch(() => ({})))?.hours);
  const room = extendRoom(c.req.param('id'), hours.success ? hours.data : 4);
  if (!room) return c.json({ error: 'not_found' }, 404);
  return c.json({ room: publicRoom(room) });
});

adminRoute.delete('/rooms/:id', (c) => {
  const roomId = c.req.param('id');
  if (!softDeleteRoom(roomId)) return c.json({ error: 'not_found' }, 404);

  // 開いたままの画面に「おわりました」を出す
  publish(roomId, { type: 'room_closed' });
  return c.json({ ok: true });
});
