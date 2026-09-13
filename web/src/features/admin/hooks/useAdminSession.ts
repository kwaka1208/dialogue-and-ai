import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import { forgetGoogleAccount } from '../google.ts';
import { ApiError } from '../../../lib/api.ts';
import type { AdminSession } from '../types.ts';

/**
 * 管理画面のログイン状態。
 * セッションは HttpOnly cookie にあるので、ここではJSから触れる値を持たない。
 * 開いたときに /session を叩いて、通れば入っている、という判定だけをする。
 */
export type AdminAuthState =
  | { status: 'checking' }
  | { status: 'signed_out'; error: string | null }
  | { status: 'signed_in'; session: AdminSession };

export function useAdminSession(): {
  auth: AdminAuthState;
  signIn: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadSession: () => Promise<void>;
} {
  const [auth, setAuth] = useState<AdminAuthState>({ status: 'checking' });

  const loadSession = useCallback(async (): Promise<void> => {
    try {
      setAuth({ status: 'signed_in', session: await api.session() });
    } catch (error) {
      // 401 はまだ入っていないだけなので、エラー扱いにしない
      const expired = error instanceof ApiError && error.status === 401;
      setAuth({ status: 'signed_out', error: expired ? null : signInError(error) });
    }
  }, []);

  // 開いたとき・リロードしたときは、cookie のセッションで入り直す
  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const signIn = useCallback(
    async (credential: string): Promise<void> => {
      try {
        await api.signInWithGoogle(credential);
      } catch (error) {
        setAuth({ status: 'signed_out', error: signInError(error) });
        return;
      }
      // セッションが張れたら、権限や既定値をまとめて取り直す
      await loadSession();
    },
    [loadSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await api.signOut().catch(() => undefined);
    forgetGoogleAccount();
    setAuth({ status: 'signed_out', error: null });
  }, []);

  return { auth, signIn, signOut, reloadSession: loadSession };
}

function signInError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'サーバーに接続できませんでした';

  switch (error.code) {
    case 'admin_disabled':
      return 'サーバーに GOOGLE_CLIENT_ID が設定されていません';
    case 'not_registered':
      return 'このGoogleアカウントは登録されていません。特権管理者に登録を依頼してください';
    case 'account_disabled':
      return 'このアカウントは無効にされています';
    case 'invalid_credential':
      return 'Googleの確認に失敗しました。もう一度お試しください';
    default:
      return `入れませんでした (${error.code})`;
  }
}
