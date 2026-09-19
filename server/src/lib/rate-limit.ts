/**
 * 参加者ごとの連投を抑える、プロセス内メモリのレート制限。
 *
 * サーバーは1台なので分散は考えない。再起動すればカウントは消えるが、
 * 制限の窓が1分なので取りこぼしても実害はない。
 *
 * ハンドオフ 10章「参加者ごと毎分3ターン」に対応する。部屋ごとの上限は
 * DBの turn_limit / turns_used が持つ (repos/rooms.ts の consumeTurn)。
 */

/**
 * 制限の単位。同じ相手でも用途ごとに別の枠で数える。
 * room_code だけは入室前なので、参加者IDではなくクライアントのIPで数える。
 */
export type Bucket = 'ai_turn' | 'message' | 'room_code';

interface Window {
  /** この窓の中で記録した時刻 (ミリ秒)。古いものは判定のたびに捨てる */
  hits: number[];
}

const WINDOW_MS = 60_000;

/** key は `${bucket}:${subject}` (subject は参加者ID、または入室前ならIP) */
const windows = new Map<string, Window>();

/** 使われなくなった枠を片づける間隔。捨て漏れでメモリが伸びないように */
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = 0;

function keyOf(bucket: Bucket, subject: string): string {
  return `${bucket}:${subject}`;
}

/** 窓から出た時刻を捨てる。残った数がそのまま「直近1分の回数」になる */
function prune(window: Window, now: number): void {
  const from = now - WINDOW_MS;
  while (window.hits.length > 0 && window.hits[0]! <= from) {
    window.hits.shift();
  }
}

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, window] of windows) {
    prune(window, now);
    if (window.hits.length === 0) windows.delete(key);
  }
}

/**
 * 1回ぶんを記録して、上限に収まっていれば true。
 * 上限を超えていたときは記録しない (断ったぶんで窓が伸びないように)。
 */
export function consume(
  bucket: Bucket,
  subject: string,
  limitPerMinute: number,
  now = Date.now(),
): boolean {
  sweep(now);

  const key = keyOf(bucket, subject);
  let window = windows.get(key);
  if (!window) {
    window = { hits: [] };
    windows.set(key, window);
  }

  prune(window, now);
  if (window.hits.length >= limitPerMinute) return false;

  window.hits.push(now);
  return true;
}

/** 次にまた送れるようになるまでの秒数。画面に「○秒まってね」と出すために使う */
export function retryAfterSeconds(
  bucket: Bucket,
  subject: string,
  now = Date.now(),
): number {
  const window = windows.get(keyOf(bucket, subject));
  const oldest = window?.hits[0];
  if (oldest === undefined) return 0;
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
}

/** テスト用。窓をぜんぶ捨てる */
export function resetRateLimits(): void {
  windows.clear();
  lastSweep = 0;
}
