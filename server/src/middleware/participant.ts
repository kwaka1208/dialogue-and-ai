import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { getRoom } from '../repos/rooms.js';
import { findByToken } from '../repos/participants.js';
import { isPast } from '../lib/time.js';
import type { Participant, Room } from '../types.js';

export type ParticipantEnv = {
  Variables: {
    room: Room;
    participant: Participant;
  };
};

/** 参加者トークンは部屋ごとの cookie に置く。部屋をまたいだ流用を防ぐ */
export function participantCookieName(roomId: string): string {
  return `kgc_pt_${roomId}`;
}

export const participantAuth = createMiddleware<ParticipantEnv>(async (c, next) => {
  const roomId = c.req.param('id');
  if (!roomId) return c.json({ error: 'not_found' }, 404);

  const room = getRoom(roomId);
  if (!room) return c.json({ error: 'not_found' }, 404);
  if (isPast(room.expiresAt)) return c.json({ error: 'room_closed' }, 410);

  const token = getCookie(c, participantCookieName(roomId));
  if (!token) return c.json({ error: 'not_joined' }, 401);

  const participant = findByToken(roomId, token);
  if (!participant) return c.json({ error: 'not_joined' }, 401);

  c.set('room', room);
  c.set('participant', participant);
  await next();
});
