import { getDb } from '../db/index.js';
import { randomId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { kindOf } from '../lib/uploads.js';
import type { Attachment } from '../types.js';

interface AttachmentRow {
  id: string;
  room_id: string;
  participant_id: string;
  message_id: string | null;
  original_name: string;
  mime_type: string;
  size: number;
  stored_path: string;
  extracted_text: string | null;
  created_at: string;
}

/** 保存先や抽出したテキストまで持つ、サーバー内部だけの形 */
export interface StoredAttachment extends Attachment {
  roomId: string;
  participantId: string;
  storedPath: string;
  extractedText: string | null;
  createdAt: string;
}

function toStored(row: AttachmentRow): StoredAttachment {
  return {
    id: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    messageId: row.message_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    // 種類は保存しない。拡張子から引けば、表を直したときに過去の行にも効く
    kind: kindOf(row.original_name),
    storedPath: row.stored_path,
    extractedText: row.extracted_text,
    createdAt: row.created_at,
  };
}

/** 画面に返す形。保存先と抽出テキストはここで落とす */
export function toPublic(attachment: StoredAttachment): Attachment {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
  };
}

export interface InsertAttachmentInput {
  roomId: string;
  participantId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storedPath: string;
  extractedText: string | null;
}

export function insertAttachment(input: InsertAttachmentInput): StoredAttachment {
  const row = { id: randomId(16), ...input, createdAt: nowIso() };

  getDb()
    .prepare(
      `INSERT INTO attachments
         (id, room_id, participant_id, message_id, original_name, mime_type, size, stored_path, extracted_text, created_at)
       VALUES
         (@id, @roomId, @participantId, NULL, @originalName, @mimeType, @size, @storedPath, @extractedText, @createdAt)`,
    )
    .run(row);

  return getAttachment(row.id)!;
}

export function getAttachment(id: string): StoredAttachment | null {
  const row = getDb()
    .prepare<[string], AttachmentRow>('SELECT * FROM attachments WHERE id = ?')
    .get(id);
  return row ? toStored(row) : null;
}

/**
 * 発言に紐づける。
 * 自分がアップロードした、まだどの発言にも付いていないものだけが対象。
 * 他人の添付や、すでに送ったものを付け替えることはできない。
 */
export function attachToMessage(
  ids: string[],
  messageId: string,
  participantId: string,
): StoredAttachment[] {
  if (ids.length === 0) return [];

  const db = getDb();
  const update = db.prepare(
    `UPDATE attachments SET message_id = ?
      WHERE id = ? AND participant_id = ? AND message_id IS NULL`,
  );

  const attached: StoredAttachment[] = [];
  db.transaction(() => {
    for (const id of ids) {
      if (update.run(messageId, id, participantId).changes === 1) {
        attached.push(getAttachment(id)!);
      }
    }
  })();

  return attached;
}

/** タイムラインを組み立てるとき、複数の発言ぶんをまとめて引く */
export function listForMessages(messageIds: string[]): Map<string, StoredAttachment[]> {
  const byMessage = new Map<string, StoredAttachment[]>();
  if (messageIds.length === 0) return byMessage;

  const placeholders = messageIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare<string[], AttachmentRow>(
      `SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at, rowid`,
    )
    .all(...messageIds);

  for (const row of rows) {
    const attachment = toStored(row);
    const list = byMessage.get(attachment.messageId!) ?? [];
    list.push(attachment);
    byMessage.set(attachment.messageId!, list);
  }

  return byMessage;
}

/** まだ送っていない自分の添付。取り消しと、上限の数え上げに使う */
export function listPending(participantId: string): StoredAttachment[] {
  return getDb()
    .prepare<[string], AttachmentRow>(
      'SELECT * FROM attachments WHERE participant_id = ? AND message_id IS NULL ORDER BY created_at',
    )
    .all(participantId)
    .map(toStored);
}

/** 送られないまま置き去りになった添付。掃除のために引く */
export function listStalePending(beforeIso: string): StoredAttachment[] {
  return getDb()
    .prepare<[string], AttachmentRow>(
      'SELECT * FROM attachments WHERE message_id IS NULL AND created_at < ?',
    )
    .all(beforeIso)
    .map(toStored);
}

export function deleteAttachment(id: string): void {
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id);
}

/** 部屋ごとの添付。部屋を消すときに、実体を消すために引く */
export function listForRoom(roomId: string): StoredAttachment[] {
  return getDb()
    .prepare<[string], AttachmentRow>(
      'SELECT * FROM attachments WHERE room_id = ? ORDER BY created_at',
    )
    .all(roomId)
    .map(toStored);
}

/** 部屋ごとの添付の行を、まとめて消す。実体のファイルは呼び出し側で消す */
export function deleteForRoom(roomId: string): number {
  return getDb().prepare('DELETE FROM attachments WHERE room_id = ?').run(roomId).changes;
}
