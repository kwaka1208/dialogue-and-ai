import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config, isAiConfigured } from './config.js';
import { getDb } from './db/index.js';

const app = new Hono();

// 部屋のURLが外に漏れにくいように。検索エンジンにも載せない
app.use('*', async (c, next) => {
  await next();
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    aiConfigured: isAiConfigured(),
    now: new Date().toISOString(),
  }),
);

getDb();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`BFF listening on http://localhost:${info.port}`);
  if (!isAiConfigured()) {
    console.log('SAKURA_AI_TOKEN / SAKURA_AI_MODEL が未設定です。AIの応答は無効のまま起動します。');
  }
});

export { app };
