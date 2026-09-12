/**
 * SQLite のスキーマ定義。
 * すべて `CREATE ... IF NOT EXISTS` なので、起動のたびに流して問題ない。
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT PRIMARY KEY,          -- 22文字のランダム文字列 (base62)
  name          TEXT NOT NULL,
  passcode_hash TEXT,                      -- NULL可。設定時は4桁の合言葉のハッシュ
  reply_mode    TEXT NOT NULL,             -- 'mention' | 'always'
  capacity      INTEGER NOT NULL,
  turn_limit    INTEGER NOT NULL,
  turns_used    INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT NOT NULL,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id),
  display_name TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  joined_at    TEXT NOT NULL,
  left_at      TEXT,
  UNIQUE(room_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_token ON participants(token_hash);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  kind           TEXT NOT NULL,            -- 'user' | 'ai' | 'system'
  participant_id TEXT REFERENCES participants(id),  -- kind='user' のとき
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  message_id     TEXT REFERENCES messages(id),      -- 送信前は NULL (先にアップロードするため)
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size           INTEGER NOT NULL,
  stored_path    TEXT NOT NULL,                     -- uploadDir からの相対パス
  extracted_text TEXT,                              -- テキスト系から抽出した内容
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(participant_id, message_id);
`;
