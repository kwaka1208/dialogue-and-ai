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
  db.exec(SCHEMA_SQL);

  instance = db;
  return db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
