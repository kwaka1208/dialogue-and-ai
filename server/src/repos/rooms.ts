import { getDb } from '../db/index.js';
import { randomId, randomDigits, sha256 } from '../lib/ids.js';
import { isoAfterHours, nowIso } from '../lib/time.js';
import { config } from '../config.js';
import type { AiMode, ReplyMode, Room } from '../types.js';

interface RoomRow {
  id: string;
  code: string | null;
  name: string;
  passcode_hash: string | null;
  ai_mode: string;
  reply_mode: string;
  capacity: number;
  turn_limit: number;
  turns_used: number;
  expires_at: string;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
}

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    // 起動時の採番 (ensureRoomCodes) で埋まる。空になるのは採番前の一瞬だけ
    code: row.code ?? '',
    name: row.name,
    passcodeHash: row.passcode_hash,
    aiMode: row.ai_mode === 'opinion' ? 'opinion' : 'chat',
    replyMode: row.reply_mode === 'always' ? 'always' : 'mention',
    capacity: row.capacity,
    turnLimit: row.turn_limit,
    turnsUsed: row.turns_used,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export interface CreateRoomInput {
  name: string;
  passcode?: string | null;
  aiMode?: AiMode;
  replyMode?: ReplyMode;
  capacity?: number;
  turnLimit?: number;
  expiresInHours?: number;
  /** 作った管理者のアカウントID。CLIから作ると null (所有者不明) になる */
  createdBy?: string | null;
}

export function createRoom(input: CreateRoomInput): Room {
  const defaults = config.roomDefaults;
  const room: Room = {
    id: randomId(22),
    code: issueCode(),
    name: input.name,
    passcodeHash: input.passcode ? sha256(input.passcode) : null,
    aiMode: input.aiMode ?? defaults.aiMode,
    replyMode: input.replyMode ?? defaults.replyMode,
    capacity: input.capacity ?? defaults.capacity,
    turnLimit: input.turnLimit ?? defaults.turnLimit,
    turnsUsed: 0,
    expiresAt: isoAfterHours(input.expiresInHours ?? defaults.expiresInHours),
    deletedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: nowIso(),
  };

  getDb()
    .prepare(
      `INSERT INTO rooms (id, code, name, passcode_hash, ai_mode, reply_mode, capacity, turn_limit, turns_used, expires_at, created_by, created_at)
       VALUES (@id, @code, @name, @passcodeHash, @aiMode, @replyMode, @capacity, @turnLimit, 0, @expiresAt, @createdBy, @createdAt)`,
    )
    .run(room);

  return room;
}

/**
 * 6桁コードの採番。
 *
 * 「いま入れる部屋」(未削除かつ期限内) の中で重なっていなければよい。
 * 終わった部屋のコードは、またどこかの部屋で使われる。
 *
 * 先頭が 0 のコードは作らない。口頭で伝えるときに 0 が落ちて取り違える。
 */
function issueCode(): string {
  const db = getDb();
  const taken = db.prepare<[string, string], { code: string }>(
    'SELECT code FROM rooms WHERE code = ? AND deleted_at IS NULL AND expires_at > ?',
  );

  // 同時に開いている部屋は多くても数十。数回引き直せばまず当たる
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = randomDigits(6);
    if (candidate.startsWith('0')) continue;
    if (!taken.get(candidate, nowIso())) return candidate;
  }

  throw new Error('部屋コードを採番できませんでした。期限内の部屋が多すぎます。');
}

/**
 * コードから部屋を引く。トップページの入室がこれを使う。
 * 終わった部屋はコードでは引けない (URLを知っていれば「おわりました」の画面までは出る)。
 */
export function findRoomByCode(code: string): Room | null {
  const row = getDb()
    .prepare<[string, string], RoomRow>(
      `SELECT * FROM rooms
       WHERE code = ? AND deleted_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(code, nowIso());
  return row ? toRoom(row) : null;
}

/**
 * コードを持たない既存の部屋に採番する。起動時に一度だけ呼ぶ。
 * 6桁コードを足す前に作られた部屋も、トップページから入れるようにするため。
 */
export function ensureRoomCodes(): number {
  const db = getDb();
  const rows = db
    .prepare<[], { id: string }>('SELECT id FROM rooms WHERE code IS NULL AND deleted_at IS NULL')
    .all();

  const update = db.prepare('UPDATE rooms SET code = ? WHERE id = ?');
  for (const row of rows) {
    update.run(issueCode(), row.id);
  }

  return rows.length;
}

/** 論理削除ずみの部屋は「無い」ものとして扱う */
export function getRoom(id: string): Room | null {
  const row = getDb()
    .prepare<[string], RoomRow>('SELECT * FROM rooms WHERE id = ? AND deleted_at IS NULL')
    .get(id);
  return row ? toRoom(row) : null;
}

/**
 * 部屋の一覧。
 * ownerId を渡すと、その管理者が作った部屋だけに絞る。
 * 所有者不明 (created_by IS NULL) の古い部屋は、絞り込むと出てこない。
 */
export function listRooms(ownerId?: string): Room[] {
  const db = getDb();
  const rows = ownerId
    ? db
        .prepare<[string], RoomRow>(
          'SELECT * FROM rooms WHERE deleted_at IS NULL AND created_by = ? ORDER BY created_at DESC',
        )
        .all(ownerId)
    : db
        .prepare<[], RoomRow>(
          'SELECT * FROM rooms WHERE deleted_at IS NULL ORDER BY created_at DESC',
        )
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
  aiMode?: AiMode;
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
    aiMode: 'ai_mode',
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
