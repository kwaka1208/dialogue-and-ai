import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { config, isAdminAuthConfigured, isSuperAdminEmail } from '../config.js';
import { findAccountBySessionToken } from '../repos/admin-sessions.js';
import type { AdminIdentity } from '../types.js';

/** 管理セッションの cookie 名。子ども用の参加者 cookie とは別系統にする */
export const ADMIN_COOKIE = 'kgc_admin_session';

/** ログイン中のアカウントを、後続のハンドラから取り出すための入れ物 */
export interface AdminEnv {
  Variables: { admin: AdminIdentity };
}

/**
 * cookie の管理セッションを見る。
 * 特権かどうかは毎回 .env と突き合わせるので、.env を直して再起動すれば即座に反映される。
 */
export const adminAuth = createMiddleware<AdminEnv>(async (c, next) => {
  if (!isAdminAuthConfigured()) {
    return c.json({ error: 'admin_disabled', message: 'GOOGLE_CLIENT_ID が未設定です' }, 503);
  }

  const token = getCookie(c, ADMIN_COOKIE);
  const account = token ? findAccountBySessionToken(token) : null;
  if (!account) return c.json({ error: 'unauthorized' }, 401);

  c.set('admin', { account, isSuper: isSuperAdminEmail(account.email) });
  await next();
});

/** 特権管理者だけに許すルート用。アカウントの登録と削除がこれに当たる */
export const requireSuperAdmin = createMiddleware<AdminEnv>(async (c, next) => {
  if (!c.get('admin').isSuper) {
    return c.json({ error: 'forbidden', message: '特権管理者だけが使えます' }, 403);
  }
  await next();
});

/** cookie に付ける属性。本番はHTTPSなので Secure を足す */
export function adminCookieOptions(): {
  httpOnly: true;
  sameSite: 'Lax';
  path: string;
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: config.isProduction,
    maxAge: Math.floor(config.admin.sessionTtlHours * 60 * 60),
  };
}
