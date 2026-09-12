import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';

loadDotenv();

const isProduction = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  // AI Engine。フェーズ2以降で必要になる。未設定でもサーバー自体は起動する
  SAKURA_AI_TOKEN: z.string().optional(),
  SAKURA_AI_BASE_URL: z.string().url().default('https://api.ai.sakura.ad.jp/v1'),
  SAKURA_AI_MODEL: z.string().optional(),

  ADMIN_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().optional(),

  DATA_DIR: z.string().default('./data'),
  UPLOAD_DIR: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('環境変数の設定に問題があります:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

const env = parsed.data;

// 本番では秘密の値を省略させない
if (isProduction) {
  const missing = (['ADMIN_TOKEN', 'SESSION_SECRET', 'SAKURA_AI_TOKEN'] as const).filter(
    (key) => !env[key],
  );
  if (missing.length > 0) {
    console.error(`本番環境では次の環境変数が必須です: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const dataDir = path.resolve(env.DATA_DIR);

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction,
  port: env.PORT,

  ai: {
    token: env.SAKURA_AI_TOKEN,
    baseUrl: env.SAKURA_AI_BASE_URL.replace(/\/$/, ''),
    model: env.SAKURA_AI_MODEL,
    timeoutMs: 60_000,
  },

  adminToken: env.ADMIN_TOKEN,
  sessionSecret: env.SESSION_SECRET,

  dataDir,
  dbPath: path.join(dataDir, 'kids-group-chat.sqlite'),
  uploadDir: env.UPLOAD_DIR ? path.resolve(env.UPLOAD_DIR) : path.join(dataDir, 'uploads'),

  // 部屋の既定値 (管理画面から部屋ごとに変更できる)
  roomDefaults: {
    capacity: 20,
    expiresInHours: 4,
    turnLimit: 100,
    replyMode: 'mention' as const,
  },
} as const;

/** AI Engine を呼べる状態か。未設定なら子ども同士のチャットだけ動かす */
export function isAiConfigured(): boolean {
  return Boolean(config.ai.token && config.ai.model);
}
