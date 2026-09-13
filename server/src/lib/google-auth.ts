import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

/** Googleから受け取って確かめたあとの、必要な情報だけ */
export interface GoogleProfile {
  email: string;
  name: string | null;
}

let client: OAuth2Client | null = null;

function getClient(clientId: string): OAuth2Client {
  // 公開鍵のキャッシュを効かせたいので、使い回す
  client ??= new OAuth2Client(clientId);
  return client;
}

/**
 * ブラウザの Google ログインが返す ID トークン (JWT) を確かめる。
 * 署名・発行者・宛先 (aud) ・期限はすべてライブラリ側が見る。
 * ここで追加で見るのは「メールアドレスがGoogleで確認ずみか」だけ。
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile | null> {
  const clientId = config.admin.googleClientId;
  if (!clientId) return null;

  try {
    const ticket = await getClient(clientId).verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true) return null;

    return { email: payload.email.toLowerCase(), name: payload.name ?? null };
  } catch (error) {
    // 期限切れや改ざんはここに来る。理由は画面に出さずログだけに残す
    console.warn(`[admin] Google ID トークンの検証に失敗しました: ${String(error)}`);
    return null;
  }
}
