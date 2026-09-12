import { getDb } from '../db/index.js';
import { randomId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { Message, MessageKind } from '../types.js';

interface MessageRow {
  id: string;
  room_id: string;
  kind: string;
  participant_id: string | null;
  display_name: string | null;
  body: string;
  created_at: string;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    roomId: row.room_id,
    kind: row.kind as MessageKind,
    participantId: row.participant_id,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_NAME = `
  SELECT m.*, p.display_name
  FROM messages m
  LEFT JOIN participants p ON p.id = m.participant_id
`;

export interface InsertMessageInput {
  roomId: string;
  kind: MessageKind;
  participantId?: string | null;
  body: string;
  /** AIの応答のように、空で先に作って後から本文を埋めたい場合に使う */
  id?: string;
}

export function insertMessage(input: InsertMessageInput): Message {
  const row = {
    id: input.id ?? randomId(16),
    roomId: input.roomId,
    kind: input.kind,
    participantId: input.participantId ?? null,
    body: input.body,
    createdAt: nowIso(),
  };

  getDb()
    .prepare(
      `INSERT INTO messages (id, room_id, kind, participant_id, body, created_at)
       VALUES (@id, @roomId, @kind, @participantId, @body, @createdAt)`,
    )
    .run(row);

  return getMessage(row.id)!;
}

export function updateMessageBody(id: string, body: string): void {
  getDb().prepare('UPDATE messages SET body = ? WHERE id = ?').run(body, id);
}

/** 本文が空のまま終わったAIの応答など、残す意味のない行を消す */
export function deleteMessage(id: string): void {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(id);
}

export function getMessage(id: string): Message | null {
  const row = getDb()
    .prepare<[string], MessageRow>(`${SELECT_WITH_NAME} WHERE m.id = ?`)
    .get(id);
  return row ? toMessage(row) : null;
}

/** 古い順に返す。limit は「直近N件」の意味なので、末尾から取って並べ直す */
export function listMessages(roomId: string, limit = 200): Message[] {
  const rows = getDb()
    .prepare<[string, number], MessageRow>(
      `${SELECT_WITH_NAME} WHERE m.room_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`,
    )
    .all(roomId, limit);
  return rows.map(toMessage).reverse();
}

export function countMessages(roomId: string): number {
  const row = getDb()
    .prepare<[string], { count: number }>('SELECT COUNT(*) AS count FROM messages WHERE room_id = ?')
    .get(roomId);
  return row?.count ?? 0;
}
