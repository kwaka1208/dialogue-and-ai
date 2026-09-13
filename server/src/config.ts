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

  // 管理画面のGoogleログイン。Google Cloud コンソールで作るウェブアプリケーションのクライアントID
  GOOGLE_CLIENT_ID: z.string().optional(),

  // 特権管理者のメールアドレス。カンマ区切り。ここが管理者アカウントの起点になる
  SUPER_ADMIN_EMAILS: z.string().default(''),

  // 管理セッションの有効時間
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(12),

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
  const missing = (['GOOGLE_CLIENT_ID', 'SAKURA_AI_TOKEN'] as const).filter((key) => !env[key]);
  if (missing.length > 0) {
    console.error(`本番環境では次の環境変数が必須です: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/**
 * 特権管理者のメールアドレス。比較を揺らさないよう小文字に寄せる。
 * ここが唯一の情報源で、DBには特権かどうかを持たせない。
 * (DBに持たせると .env を直したのに権限が戻らない、という食い違いが起きる)
 */
const superAdminEmails = env.SUPER_ADMIN_EMAILS.split(',')
  .map((email) => email.trim().toLowerCase())
  .filter((email) => email.length > 0);

// 特権管理者が居ないと、管理者アカウントを1つも登録できないまま詰む
if (isProduction && superAdminEmails.length === 0) {
  console.error('本番環境では SUPER_ADMIN_EMAILS に最低1件のメールアドレスが必要です');
  process.exit(1);
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

  admin: {
    googleClientId: env.GOOGLE_CLIENT_ID,
    superAdminEmails,
    sessionTtlHours: env.ADMIN_SESSION_TTL_HOURS,
  },

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

/** 管理画面のGoogleログインを使える状態か */
export function isAdminAuthConfigured(): boolean {
  return Boolean(config.admin.googleClientId);
}

/** .env に書かれた特権管理者か。メールアドレスの大文字小文字は無視する */
export function isSuperAdminEmail(email: string): boolean {
  return config.admin.superAdminEmails.includes(email.trim().toLowerCase());
}
