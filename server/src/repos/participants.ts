import { getDb } from '../db/index.js';
import { randomId, randomToken, sha256 } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { Participant } from '../types.js';

interface ParticipantRow {
  id: string;
  room_id: string;
  display_name: string;
  token_hash: string;
  joined_at: string;
  left_at: string | null;
}

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    roomId: row.room_id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  };
}

export class DuplicateNameError extends Error {
  constructor() {
    super('その名前はもう使われています');
    this.name = 'DuplicateNameError';
  }
}

export interface JoinResult {
  participant: Participant;
  /** cookie に入れる生のトークン。DBにはハッシュしか残らない */
  token: string;
}

export function joinRoom(roomId: string, displayName: string): JoinResult {
  const token = randomToken();
  const row = {
    id: randomId(16),
    roomId,
    displayName,
    tokenHash: sha256(token),
    joinedAt: nowIso(),
  };

  try {
    getDb()
      .prepare(
        `INSERT INTO participants (id, room_id, display_name, token_hash, joined_at)
         VALUES (@id, @roomId, @displayName, @tokenHash, @joinedAt)`,
      )
      .run(row);
  } catch (error) {
    // UNIQUE(room_id, display_name) 違反 = 同じ名前の子がすでにいる
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new DuplicateNameError();
    }
    throw error;
  }

  return {
    participant: {
      id: row.id,
      roomId,
      displayName,
      joinedAt: row.joinedAt,
      leftAt: null,
    },
    token,
  };
}

export function findByToken(roomId: string, token: string): Participant | null {
  const row = getDb()
    .prepare<[string, string], ParticipantRow>(
      'SELECT * FROM participants WHERE room_id = ? AND token_hash = ?',
    )
    .get(roomId, sha256(token));
  return row ? toParticipant(row) : null;
}

export function getParticipant(id: string): Participant | null {
  const row = getDb()
    .prepare<[string], ParticipantRow>('SELECT * FROM participants WHERE id = ?')
    .get(id);
  return row ? toParticipant(row) : null;
}

export function listParticipants(roomId: string): Participant[] {
  const rows = getDb()
    .prepare<[string], ParticipantRow>(
      'SELECT * FROM participants WHERE room_id = ? ORDER BY joined_at',
    )
    .all(roomId);
  return rows.map(toParticipant);
}

/** 入室中（退室記録のない）参加者の数。定員判定に使う */
export function countActive(roomId: string): number {
  const row = getDb()
    .prepare<[string], { count: number }>(
      'SELECT COUNT(*) AS count FROM participants WHERE room_id = ? AND left_at IS NULL',
    )
    .get(roomId);
  return row?.count ?? 0;
}

/** 画面をつなぎ直したときに退室記録を取り消す。定員の数え方をずれさせないため */
export function markRejoined(id: string): void {
  getDb().prepare('UPDATE participants SET left_at = NULL WHERE id = ?').run(id);
}

export function markLeft(id: string): void {
  getDb().prepare('UPDATE participants SET left_at = ? WHERE id = ?').run(nowIso(), id);
}
