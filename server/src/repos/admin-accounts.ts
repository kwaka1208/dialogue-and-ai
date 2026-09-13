import { getDb } from '../db/index.js';
import { randomId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { AdminAccount } from '../types.js';

interface AdminAccountRow {
  id: string;
  email: string;
  name: string | null;
  created_by: string | null;
  disabled_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

function toAccount(row: AdminAccountRow): AdminAccount {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdBy: row.created_by,
    disabledAt: row.disabled_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

/** メールアドレスは大文字小文字を無視して1件に寄せる */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAccount(id: string): AdminAccount | null {
  const row = getDb()
    .prepare<[string], AdminAccountRow>('SELECT * FROM admin_accounts WHERE id = ?')
    .get(id);
  return row ? toAccount(row) : null;
}

export function findAccountByEmail(email: string): AdminAccount | null {
  const row = getDb()
    .prepare<[string], AdminAccountRow>('SELECT * FROM admin_accounts WHERE email = ?')
    .get(normalizeEmail(email));
  return row ? toAccount(row) : null;
}

export function listAccounts(): AdminAccount[] {
  const rows = getDb()
    .prepare<[], AdminAccountRow>('SELECT * FROM admin_accounts ORDER BY created_at ASC')
    .all();
  return rows.map(toAccount);
}

export interface CreateAccountInput {
  email: string;
  name?: string | null;
  /** 登録した特権管理者。ログイン時の自動登録では null */
  createdBy?: string | null;
}

/**
 * アカウントを1件足す。すでに同じメールアドレスがあれば null を返す。
 * (どちらなのかは呼び出し側で 409 に変える)
 */
export function createAccount(input: CreateAccountInput): AdminAccount | null {
  const email = normalizeEmail(input.email);
  if (findAccountByEmail(email)) return null;

  const account: AdminAccount = {
    id: randomId(22),
    email,
    name: input.name?.trim() || null,
    createdBy: input.createdBy ?? null,
    disabledAt: null,
    lastLoginAt: null,
    createdAt: nowIso(),
  };

  getDb()
    .prepare(
      `INSERT INTO admin_accounts (id, email, name, created_by, disabled_at, last_login_at, created_at)
       VALUES (@id, @email, @name, @createdBy, NULL, NULL, @createdAt)`,
    )
    .run(account);

  return account;
}

/** ログインのたびに呼ぶ。Googleの表示名が空なら前の値を残す */
export function markSignedIn(id: string, name: string | null): void {
  getDb()
    .prepare('UPDATE admin_accounts SET last_login_at = ?, name = COALESCE(?, name) WHERE id = ?')
    .run(nowIso(), name?.trim() || null, id);
}

/**
 * アカウントを消す。
 *
 * その人が作った部屋は消さない。使っている最中の部屋を巻き込まないためで、
 * 代わりに所有者を外して「所有者なし」にする (以後は特権管理者だけが管理できる)。
 * 所有者を外さずに消すと、rooms.created_by の外部キーに引っかかって削除自体が失敗する。
 */
export function deleteAccount(id: string): { ok: boolean; orphanedRooms: number } {
  const db = getDb();
  return db.transaction(() => {
    db.prepare('DELETE FROM admin_sessions WHERE account_id = ?').run(id);
    // 削除した人が登録した他のアカウントを道連れにしない
    db.prepare('UPDATE admin_accounts SET created_by = NULL WHERE created_by = ?').run(id);
    const orphaned = db.prepare('UPDATE rooms SET created_by = NULL WHERE created_by = ?').run(id);
    const deleted = db.prepare('DELETE FROM admin_accounts WHERE id = ?').run(id);
    return { ok: deleted.changes > 0, orphanedRooms: orphaned.changes };
  })();
}

/** 一時的に締め出す。行は残るので、あとから戻せる */
export function setAccountDisabled(id: string, disabled: boolean): AdminAccount | null {
  const db = getDb();
  db.prepare('UPDATE admin_accounts SET disabled_at = ? WHERE id = ?').run(
    disabled ? nowIso() : null,
    id,
  );
  // 締め出すなら、開いたままのセッションもその場で切る
  if (disabled) db.prepare('DELETE FROM admin_sessions WHERE account_id = ?').run(id);
  return getAccount(id);
}
