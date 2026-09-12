import { getDb } from '../db/index.js';
import { randomId, sha256 } from '../lib/ids.js';
import { isoAfterHours, nowIso } from '../lib/time.js';
import { config } from '../config.js';
import type { ReplyMode, Room } from '../types.js';

interface RoomRow {
  id: string;
  name: string;
  passcode_hash: string | null;
  reply_mode: string;
  capacity: number;
  turn_limit: number;
  turns_used: number;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
}

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    passcodeHash: row.passcode_hash,
    replyMode: row.reply_mode === 'always' ? 'always' : 'mention',
    capacity: row.capacity,
    turnLimit: row.turn_limit,
    turnsUsed: row.turns_used,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

export interface CreateRoomInput {
  name: string;
  passcode?: string | null;
  replyMode?: ReplyMode;
  capacity?: number;
  turnLimit?: number;
  expiresInHours?: number;
}

export function createRoom(input: CreateRoomInput): Room {
  const defaults = config.roomDefaults;
  const room: Room = {
    id: randomId(22),
    name: input.name,
    passcodeHash: input.passcode ? sha256(input.passcode) : null,
    replyMode: input.replyMode ?? defaults.replyMode,
    capacity: input.capacity ?? defaults.capacity,
    turnLimit: input.turnLimit ?? defaults.turnLimit,
    turnsUsed: 0,
    expiresAt: isoAfterHours(input.expiresInHours ?? defaults.expiresInHours),
    deletedAt: null,
    createdAt: nowIso(),
  };

  getDb()
    .prepare(
      `INSERT INTO rooms (id, name, passcode_hash, reply_mode, capacity, turn_limit, turns_used, expires_at, created_at)
       VALUES (@id, @name, @passcodeHash, @replyMode, @capacity, @turnLimit, 0, @expiresAt, @createdAt)`,
    )
    .run(room);

  return room;
}

/** 論理削除ずみの部屋は「無い」ものとして扱う */
export function getRoom(id: string): Room | null {
  const row = getDb()
    .prepare<[string], RoomRow>('SELECT * FROM rooms WHERE id = ? AND deleted_at IS NULL')
    .get(id);
  return row ? toRoom(row) : null;
}

export function listRooms(): Room[] {
  const rows = getDb()
    .prepare<[], RoomRow>('SELECT * FROM rooms WHERE deleted_at IS NULL ORDER BY created_at DESC')
    .all();
  return rows.map(toRoom);
}

export function softDeleteRoom(id: string): boolean {
  const result = getDb()
    .prepare('UPDATE rooms SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(nowIso(), id);
  return result.changes > 0;
}

export interface UpdateRoomInput {
  name?: string;
  replyMode?: ReplyMode;
  capacity?: number;
  turnLimit?: number;
}

/**
 * 管理画面からの設定変更。渡された項目だけを書き換える。
 * turns_used は触らない（上限を上げれば、そのぶん続きから使える）。
 */
export function updateRoom(id: string, input: UpdateRoomInput): Room | null {
  const columns: Record<keyof UpdateRoomInput, string> = {
    name: 'name',
    replyMode: 'reply_mode',
    capacity: 'capacity',
    turnLimit: 'turn_limit',
  };

  const assignments: string[] = [];
  const values: Array<string | number> = [];
  for (const [key, column] of Object.entries(columns) as Array<[keyof UpdateRoomInput, string]>) {
    const value = input[key];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    values.push(value);
  }

  if (assignments.length > 0) {
    getDb()
      .prepare(`UPDATE rooms SET ${assignments.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values, id);
  }

  return getRoom(id);
}

export function extendRoom(id: string, hours: number): Room | null {
  getDb().prepare('UPDATE rooms SET expires_at = ? WHERE id = ?').run(isoAfterHours(hours), id);
  return getRoom(id);
}

/** ターン上限に達していたら false を返し、加算しない */
export function consumeTurn(id: string): boolean {
  const result = getDb()
    .prepare('UPDATE rooms SET turns_used = turns_used + 1 WHERE id = ? AND turns_used < turn_limit')
    .run(id);
  return result.changes > 0;
}
