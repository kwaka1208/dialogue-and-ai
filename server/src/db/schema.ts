/**
 * SQLite のスキーマ定義。
 * すべて `CREATE ... IF NOT EXISTS` なので、起動のたびに流して問題ない。
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admin_accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,      -- Googleアカウントのメールアドレス。小文字で持つ
  name          TEXT,                      -- 表示名。初回ログイン時にGoogleの値で埋める
  created_by    TEXT REFERENCES admin_accounts(id),  -- 登録した特権管理者。自動登録は NULL
  disabled_at   TEXT,                      -- 入るとログインできない
  last_login_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES admin_accounts(id),
  token_hash TEXT NOT NULL,                -- cookie の生の値は保存しない
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_account ON admin_sessions(account_id);

CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT PRIMARY KEY,          -- 22文字のランダム文字列 (base62)
  code          TEXT,                      -- トップページで入れる6桁の数字。期限内の部屋の中で重複しない
  name          TEXT NOT NULL,
  passcode_hash TEXT,                      -- NULL可。設定時は4桁の合言葉のハッシュ
  ai_mode       TEXT NOT NULL DEFAULT 'chat',     -- 'chat' | 'opinion'
  reply_mode    TEXT NOT NULL,             -- 'mention' | 'always' (ai_mode='chat' のときだけ効く)
  -- AIの中身の差し替え。いずれも NULL 可で、NULL なら既定 (prompt.ts / .env) を使う
  chat_system_prompt    TEXT,              -- 会話モードの system prompt
  opinion_system_prompt TEXT,              -- 意見モードの system prompt
  chat_model            TEXT,              -- 会話モードで使うモデルID
  opinion_model         TEXT,              -- 意見モードで使うモデルID
  capacity      INTEGER NOT NULL,
  turn_limit    INTEGER NOT NULL,
  turns_used    INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT NOT NULL,
  deleted_at    TEXT,
  created_by    TEXT REFERENCES admin_accounts(id),  -- 作った管理者。NULL は所有者不明の古い部屋
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id),
  display_name TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  joined_at    TEXT NOT NULL,
  left_at      TEXT,
  kicked_at    TEXT,                      -- 管理画面から強制退出させた時刻。入ると再入室できない
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
  flagged        INTEGER NOT NULL DEFAULT 0,  -- NGワードの疑い。管理画面にだけ出す印
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
