import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { config, isAiConfigured } from './config.js';
import { getDb } from './db/index.js';
import { roomsRoute } from './routes/rooms.js';
import { adminRoute } from './routes/admin.js';

const app = new Hono();

// 部屋のURLが外に漏れにくいように。検索エンジンにも載せない
app.use('*', async (c, next) => {
  await next();
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.get('/api/health', (c) =>
  c.json({ ok: true, aiConfigured: isAiConfigured(), now: new Date().toISOString() }),
);

app.route('/api/rooms', roomsRoute);
app.route('/api/admin', adminRoute);

// 本番はビルド済みのフロントを同じサーバーから配る。
// serveStatic の root は起動時の cwd からの相対なので、リポジトリルートで起動する前提。
const repoRoot = path.resolve(import.meta.dirname, '../..');
const webDist = path.join(repoRoot, 'web/dist');
if (fs.existsSync(webDist)) {
  const relativeDist = path.relative(process.cwd(), webDist) || '.';
  app.use('/assets/*', serveStatic({ root: relativeDist }));
  app.get('*', serveStatic({ path: `${relativeDist}/index.html` }));
}

getDb();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`BFF listening on http://localhost:${info.port}`);
  if (!isAiConfigured()) {
    console.log('SAKURA_AI_TOKEN / SAKURA_AI_MODEL が未設定です。AIの応答は無効のまま起動します。');
  }
  if (!config.adminToken) {
    console.log('ADMIN_TOKEN が未設定です。/api/admin は 503 を返します。');
  }
});

export { app };
