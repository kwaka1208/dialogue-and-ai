import { createMiddleware } from 'hono/factory';
import { config } from '../config.js';
import { safeEqual } from '../lib/ids.js';

/**
 * 管理APIの認証。子ども用の部屋URLとは別系統で、環境変数のトークンだけを見る。
 */
export const adminAuth = createMiddleware(async (c, next) => {
  if (!config.adminToken) {
    return c.json({ error: 'admin_disabled', message: 'ADMIN_TOKEN が未設定です' }, 503);
  }

  const header = c.req.header('Authorization') ?? '';
  const provided = header.startsWith('Bearer ')
    ? header.slice(7)
    : (c.req.header('X-Admin-Token') ?? '');

  if (!provided || !safeEqual(provided, config.adminToken)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await next();
});
