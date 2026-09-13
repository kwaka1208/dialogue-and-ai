import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { config, isAdminAuthConfigured, isSuperAdminEmail } from '../config.js';
import { verifyGoogleIdToken } from '../lib/google-auth.js';
import {
  createAccount,
  findAccountByEmail,
  markSignedIn,
  normalizeEmail,
} from '../repos/admin-accounts.js';
import { createSession, deleteSession } from '../repos/admin-sessions.js';
import { ADMIN_COOKIE, adminCookieOptions } from '../middleware/admin.js';
import type { AdminAccount } from '../types.js';

const signInSchema = z.object({
  /** Google のログインボタンが返す ID トークン (JWT) */
  credential: z.string().min(1),
});

export const adminAuthRoute = new Hono();

/**
 * ログイン画面が最初に叩く。
 * クライアントIDをここから配ることで、設定を .env だけにまとめられる。
 */
adminAuthRoute.get('/config', (c) =>
  c.json({
    googleClientId: config.admin.googleClientId ?? null,
    configured: isAdminAuthConfigured(),
  }),
);

/**
 * Google の ID トークンを受けてセッションを張る。
 *
 * ログインを許すのは次のどちらか。
 *   - admin_accounts に有効な行があるアカウント
 *   - .env の SUPER_ADMIN_EMAILS に書かれたアカウント (行が無ければここで作る)
 * 後者があるおかげで、まっさらな状態でも特権管理者だけは入れて、そこから登録を始められる。
 */
adminAuthRoute.post('/google', async (c) => {
  if (!isAdminAuthConfigured()) {
    return c.json({ error: 'admin_disabled', message: 'GOOGLE_CLIENT_ID が未設定です' }, 503);
  }

  const parsed = signInSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);

  const profile = await verifyGoogleIdToken(parsed.data.credential);
  if (!profile) return c.json({ error: 'invalid_credential' }, 401);

  const email = normalizeEmail(profile.email);
  const isSuper = isSuperAdminEmail(email);

  let account: AdminAccount | null = findAccountByEmail(email);
  if (!account) {
    // 登録されていない人は、特権管理者でないかぎり入れない
    if (!isSuper) return c.json({ error: 'not_registered' }, 403);
    account = createAccount({ email, name: profile.name });
    if (!account) return c.json({ error: 'account_conflict' }, 409);
  }

  // 無効化ずみは、特権管理者であっても .env を直すまで入れない
  if (account.disabledAt !== null) return c.json({ error: 'account_disabled' }, 403);

  markSignedIn(account.id, profile.name);

  const { token } = createSession(account.id);
  setCookie(c, ADMIN_COOKIE, token, adminCookieOptions());

  return c.json({
    account: { ...account, name: profile.name ?? account.name },
    isSuper,
  });
});

adminAuthRoute.post('/logout', (c) => {
  const token = getCookie(c, ADMIN_COOKIE);
  if (token) deleteSession(token);
  deleteCookie(c, ADMIN_COOKIE, { path: '/' });
  return c.json({ ok: true });
});
