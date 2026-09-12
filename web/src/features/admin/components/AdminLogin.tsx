import { useState, type FormEvent } from 'react';

interface AdminLoginProps {
  error: string | null;
  onSubmit: (token: string) => Promise<void>;
}

export function AdminLogin({ error, onSubmit }: AdminLoginProps) {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(token);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="centered-page">
      <h1>管理画面</h1>

      <form className="join-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="field">
          <span className="field-label">管理トークン</span>
          <input
            className="field-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            required
            autoComplete="current-password"
          />
          <span className="field-hint">サーバーの ADMIN_TOKEN と同じ値</span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={submitting || !token}>
          {submitting ? '確認中…' : '入る'}
        </button>
      </form>

      <p className="notice">
        タブを閉じるとトークンは消えます。子どもが使う端末では開いたままにしないでください。
      </p>
    </main>
  );
}
