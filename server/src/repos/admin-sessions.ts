import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { randomId, randomToken, sha256 } from '../lib/ids.js';
import { isoAfterHours, nowIso } from '../lib/time.js';
import type { AdminAccount } from '../types.js';

/**
 * セッションを1つ作り、cookie に載せる生のトークンを返す。
 * DBにはハッシュしか置かないので、DBを見ても他人になりすませない。
 */
export function createSession(accountId: string): { token: string; expiresAt: string } {
  const token = randomToken();
  const expiresAt = isoAfterHours(config.admin.sessionTtlHours);

  getDb()
    .prepare(
      `INSERT INTO admin_sessions (id, account_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(randomId(22), accountId, sha256(token), expiresAt, nowIso());

  return { token, expiresAt };
}

interface AccountRow {
  id: string;
  email: string;
  name: string | null;
  created_by: string | null;
  disabled_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

/**
 * cookie のトークンからアカウントを引く。
 * 期限切れ・無効化ずみ・アカウント削除ずみはすべて null になる。
 */
export function findAccountBySessionToken(token: string): AdminAccount | null {
  const row = getDb()
    .prepare<[string, string], AccountRow>(
      `SELECT a.* FROM admin_sessions s
       JOIN admin_accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled_at IS NULL`,
    )
    .get(sha256(token), nowIso());

  if (!row) return null;
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

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
}

/** 期限切れの掃除。起動時に1回流す */
export function purgeExpiredSessions(): number {
  const result = getDb()
    .prepare('DELETE FROM admin_sessions WHERE expires_at <= ?')
    .run(nowIso());
  return result.changes;
}
