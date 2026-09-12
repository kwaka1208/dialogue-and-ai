import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { config, isAiConfigured } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { abortAllRuns, hasActiveRuns } from './lib/ai-runs.js';
import { closeAllConnections } from './lib/room-hub.js';
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

// どのルートにも当たらなかった /api は、この下の静的配信まで落とさずにJSONで返す。
// index.html が返ると、フロントはJSONのつもりでパースして分かりにくく壊れる
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// 本番はビルド済みのフロントを同じサーバーから配る。
// serveStatic の root は起動時の cwd からの相対しか受けないので、ここで相対に直す。
const repoRoot = path.resolve(import.meta.dirname, '../..');
const webDist = path.join(repoRoot, 'web/dist');
if (fs.existsSync(webDist)) {
  const relativeDist = path.relative(process.cwd(), webDist) || '.';
  app.use('/assets/*', serveStatic({ root: relativeDist }));
  app.get('*', serveStatic({ path: `${relativeDist}/index.html` }));
}

getDb();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`BFF listening on http://localhost:${info.port}`);
  if (!isAiConfigured()) {
    console.log('SAKURA_AI_TOKEN / SAKURA_AI_MODEL が未設定です。AIの応答は無効のまま起動します。');
  }
  if (!config.adminToken) {
    console.log('ADMIN_TOKEN が未設定です。/api/admin は 503 を返します。');
  }
});

/** 中断した生成の書き込みが終わるのを、上限つきで待つ */
async function waitForRunsToSettle(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (hasActiveRuns() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

let shuttingDown = false;

/**
 * systemd の restart / stop で送られてくる SIGTERM を受けて畳む。
 * 生成中の本文を落とさず、開いているSSEを閉じてから終わる。
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} を受けたので終了します`);

  // 走っている生成を止める。そこまでの本文は AI 応答側が保存する
  abortAllRuns();
  // 開いている画面のSSEを閉じる。閉じないと HTTP サーバーが終われない
  closeAllConnections();
  await waitForRunsToSettle(2_000);

  // 接続が居座っても待ちすぎない
  const giveUp = setTimeout(() => {
    console.log('接続が閉じきらないので打ち切ります');
    closeDb();
    process.exit(0);
  }, 5_000);
  giveUp.unref();

  server.close(() => {
    clearTimeout(giveUp);
    closeDb();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
