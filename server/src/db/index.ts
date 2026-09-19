import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const db = new Database(config.dbPath);
  // WAL は読み書きの並行性のため。SSEで読みながら書き込むので効く
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  db.exec(SCHEMA_SQL);
  addMissingColumns(db);
  // あとから足した列への索引は、列が揃ってから作る
  db.exec('CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(created_by)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)');

  instance = db;
  return db;
}

/**
 * フェーズ5より前の attachments は、アップロードを実装する前の仮の形だった。
 * 中身が空のときだけ作り直す (SCHEMA_SQL が正しい形で作り直す)。
 */
function migrate(db: Database.Database): void {
  const exists = db
    .prepare<[], { name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attachments'`,
    )
    .get();
  if (!exists) return;

  const columns = db
    .prepare<[], { name: string }>('PRAGMA table_info(attachments)')
    .all()
    .map((column) => column.name);
  if (columns.includes('room_id')) return;

  const row = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM attachments').get();
  if ((row?.count ?? 0) > 0) {
    throw new Error(
      '古い attachments テーブルにデータが残っています。手動で移行するか、data/ を作り直してください。',
    );
  }

  db.exec('DROP TABLE attachments');
}

/**
 * あとから足した列を、既存のDBにも入れる。
 * SCHEMA_SQL の CREATE TABLE は既存のテーブルには効かないので、ここで補う。
 */
function addMissingColumns(db: Database.Database): void {
  const additions: Array<{ table: string; column: string; definition: string }> = [
    // フェーズ6: 参加者の強制退出
    { table: 'participants', column: 'kicked_at', definition: 'TEXT' },
    // フェーズ7: NGワードの印
    { table: 'messages', column: 'flagged', definition: 'INTEGER NOT NULL DEFAULT 0' },
    // フェーズ9: 部屋の所有者。既存の部屋は所有者不明 (NULL) になり、特権管理者だけが見られる
    { table: 'rooms', column: 'created_by', definition: 'TEXT REFERENCES admin_accounts(id)' },
    // フェーズ10: トップページから入るための6桁コード。既存の部屋には起動時に採番する
    { table: 'rooms', column: 'code', definition: 'TEXT' },
  ];

  for (const { table, column, definition } of additions) {
    const columns = db
      .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name);
    if (columns.includes(column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
