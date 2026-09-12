import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';

// どこから起動しても同じ .env を読むように、パスを明示する。
// (npm run -w server は cwd が server/ になるため、リポジトリルートも見る)
const packageRoot = path.resolve(import.meta.dirname, '..');
// quiet: true は読み込んだパスを標準出力に出させないため (journald を汚さない)
loadDotenv({
  path: [path.join(packageRoot, '.env'), path.resolve(packageRoot, '..', '.env')],
  quiet: true,
});

const isProduction = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  // AI Engine。フェーズ2以降で必要になる。未設定でもサーバー自体は起動する
  SAKURA_AI_TOKEN: z.string().optional(),
  SAKURA_AI_BASE_URL: z.string().url().default('https://api.ai.sakura.ad.jp/v1'),
  SAKURA_AI_MODEL: z.string().optional(),

  ADMIN_TOKEN: z.string().optional(),

  DATA_DIR: z.string().default('./data'),
  UPLOAD_DIR: z.string().optional(),

  // NGワードのリスト。1行1語、# から先はコメント。未設定なら組み込みの既定リストを使う
  NG_WORDS_FILE: z.string().optional(),
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
  const missing = (['ADMIN_TOKEN', 'SAKURA_AI_TOKEN'] as const).filter((key) => !env[key]);
  if (missing.length > 0) {
    console.error(`本番環境では次の環境変数が必須です: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// どこから起動しても同じ場所を指すように、server/ を基準に解決する
const dataDir = path.resolve(packageRoot, env.DATA_DIR);

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

  dataDir,
  dbPath: path.join(dataDir, 'kids-group-chat.sqlite'),
  uploadDir: env.UPLOAD_DIR
    ? path.resolve(packageRoot, env.UPLOAD_DIR)
    : path.join(dataDir, 'uploads'),
  ngWordsFile: env.NG_WORDS_FILE ? path.resolve(packageRoot, env.NG_WORDS_FILE) : null,

  // 部屋の既定値 (管理画面から部屋ごとに変更できる)
  roomDefaults: {
    capacity: 20,
    expiresInHours: 4,
    turnLimit: 100,
    replyMode: 'mention' as const,
  },

  // 参加者ごとの連投の上限 (直近1分あたり)。部屋ごとの上限は turn_limit が持つ
  rateLimits: {
    aiTurnsPerMinute: 3,
    messagesPerMinute: 20,
  },
} as const;

/** AI Engine を呼べる状態か。未設定なら子ども同士のチャットだけ動かす */
export function isAiConfigured(): boolean {
  return Boolean(config.ai.token && config.ai.model);
}
