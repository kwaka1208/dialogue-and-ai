import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import type { AdminSession } from '../types.ts';

/**
 * 管理トークンは sessionStorage に置く。
 * タブを閉じれば消えるので、共用のPCで開いたままにしても残らない。
 */
const STORAGE_KEY = 'kgc_admin_token';

export type AdminAuthState =
  | { status: 'checking' }
  | { status: 'signed_out'; error: string | null }
  | { status: 'signed_in'; token: string; session: AdminSession };

export function useAdminToken(): {
  auth: AdminAuthState;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
} {
  const [auth, setAuth] = useState<AdminAuthState>({ status: 'checking' });

  const verify = useCallback(async (token: string): Promise<void> => {
    try {
      const session = await api.session(token);
      sessionStorage.setItem(STORAGE_KEY, token);
      setAuth({ status: 'signed_in', token, session });
    } catch (error) {
      sessionStorage.removeItem(STORAGE_KEY);
      setAuth({ status: 'signed_out', error: signInError(error) });
    }
  }, []);

  // リロードしたときは、保存ずみのトークンで入り直す
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setAuth({ status: 'signed_out', error: null });
      return;
    }
    void verify(saved);
  }, [verify]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuth({ status: 'signed_out', error: null });
  }, []);

  return { auth, signIn: verify, signOut };
}

function signInError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'サーバーに接続できませんでした';
  if (error.code === 'admin_disabled') return 'サーバーに ADMIN_TOKEN が設定されていません';
  if (error.status === 401) return '管理トークンが違います';
  return `入れませんでした (${error.code})`;
}
