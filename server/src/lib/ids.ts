import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 推測不能なランダム文字列を作る。
 * 剰余による偏りを避けるため、範囲外の値は捨てて引き直す。
 */
export function randomId(length = 22): string {
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= 248) continue; // 248 = 62 * 4。ここを超える値は偏りの元になる
      out.push(BASE62[byte % 62]!);
      if (out.length === length) break;
    }
  }
  return out.join('');
}

/** 参加者トークンなど、URLに載せない秘密の値 */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** ハッシュ同士の比較。長さが違う場合も例外にせず false を返す */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
