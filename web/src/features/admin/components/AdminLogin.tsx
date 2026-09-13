import { useEffect, useRef, useState } from 'react';
import * as api from '../api.ts';
import { renderGoogleButton } from '../google.ts';

interface AdminLoginProps {
  error: string | null;
  onCredential: (credential: string) => Promise<void>;
}

export function AdminLogin({ error, onCredential }: AdminLoginProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // 押されたときに最新の onCredential を呼びたい。
  // GIS のコールバックは一度しか登録できないので、ref 経由で見に行く
  const handlerRef = useRef(onCredential);
  handlerRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { googleClientId } = await api.authConfig();
        if (cancelled) return;

        if (!googleClientId) {
          setSetupError('サーバーに GOOGLE_CLIENT_ID が設定されていません');
          return;
        }
        if (!buttonRef.current) return;

        await renderGoogleButton(buttonRef.current, googleClientId, (credential) => {
          void handlerRef.current(credential);
        });
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setSetupError(err instanceof Error ? err.message : 'ログインを準備できませんでした');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="centered-page">
      <h1>管理画面</h1>

      <p className="notice">Googleアカウントでログインしてください。</p>

      <div className="google-signin" ref={buttonRef} />
      {!ready && !setupError && <p className="admin-empty">読み込み中…</p>}

      {setupError && <p className="form-error">{setupError}</p>}
      {error && <p className="form-error">{error}</p>}

      <p className="notice">
        ログインできるのは、あらかじめ登録されたアカウントだけです。登録が必要なときは特権管理者に
        依頼してください。
      </p>
    </main>
  );
}
