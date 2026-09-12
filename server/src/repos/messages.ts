import { getDb } from '../db/index.js';
import { randomId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { listForMessages, toPublic } from './attachments.js';
import type { Attachment, Message, MessageKind, RoomMessage } from '../types.js';

interface MessageRow {
  id: string;
  room_id: string;
  kind: string;
  participant_id: string | null;
  display_name: string | null;
  body: string;
  flagged: number;
  created_at: string;
}

function toMessage(row: MessageRow, attachments: Attachment[] = []): Message {
  return {
    id: row.id,
    roomId: row.room_id,
    kind: row.kind as MessageKind,
    participantId: row.participant_id,
    displayName: row.display_name,
    body: row.body,
    attachments,
    flagged: row.flagged === 1,
    createdAt: row.created_at,
  };
}

/** 添付を1回のクエリでまとめて引いて、発言ごとに配る */
function withAttachments(rows: MessageRow[]): Message[] {
  const byMessage = listForMessages(rows.map((row) => row.id));
  return rows.map((row) => toMessage(row, (byMessage.get(row.id) ?? []).map(toPublic)));
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
  /** NGワードの疑い。付けるのは子どもの発言だけ */
  flagged?: boolean;
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
    flagged: input.flagged ? 1 : 0,
    createdAt: nowIso(),
  };

  getDb()
    .prepare(
      `INSERT INTO messages (id, room_id, kind, participant_id, body, flagged, created_at)
       VALUES (@id, @roomId, @kind, @participantId, @body, @flagged, @createdAt)`,
    )
    .run(row);

  return getMessage(row.id)!;
}

/** 子どもの画面に流す形へ。印は落とす */
export function forRoom(message: Message): RoomMessage {
  const { flagged: _flagged, ...rest } = message;
  return rest;
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
  return row ? withAttachments([row])[0]! : null;
}

/** 古い順に返す。limit は「直近N件」の意味なので、末尾から取って並べ直す */
export function listMessages(roomId: string, limit = 200): Message[] {
  const rows = getDb()
    .prepare<[string, number], MessageRow>(
      `${SELECT_WITH_NAME} WHERE m.room_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`,
    )
    .all(roomId, limit);
  return withAttachments(rows).reverse();
}

export function countMessages(roomId: string): number {
  const row = getDb()
    .prepare<[string], { count: number }>('SELECT COUNT(*) AS count FROM messages WHERE room_id = ?')
    .get(roomId);
  return row?.count ?? 0;
}
