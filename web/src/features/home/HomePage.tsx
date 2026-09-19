import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api.ts';
import { lookupRoom } from '../room/api.ts';

const CODE_LENGTH = 6;

/** コード入力でだけ出るエラー。部屋の中の文言 (room/messages.ts) とは別に持つ */
const ERROR_TEXT: Record<string, string> = {
  not_found: 'その ばんごうの へやは みつかりません。もういちど かくにんしてね',
  invalid_code: '6けたの すうじを いれてね',
  too_fast: 'なんども まちがえたみたい。すこし まってから いれてね',
};

export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { roomId } = await lookupRoom(code);
      // 名前と合言葉は、この先の入室画面で受ける
      navigate(`/r/${roomId}`);
    } catch (err) {
      const reason = err instanceof ApiError ? err.code : 'unknown';
      setError(ERROR_TEXT[reason] ?? 'うまく いかなかったみたい。もういちど ためしてね');
      setSubmitting(false);
    }
  };

  return (
    <main className="centered-page">
      <h1 className="join-title">へやに はいる</h1>
      <p>おとなの人に おしえてもらった 6けたの ばんごうを いれてね。</p>

      <form className="join-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">へやの ばんごう</span>
          <input
            className="field-input code-input"
            value={code}
            // 数字以外は受け取らない。全角で打たれても、ここで落ちて入らないだけ
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={CODE_LENGTH}
            required
            autoFocus
            placeholder="123456"
          />
          <span className="field-hint">6けたの すうじ</span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={submitting || code.length !== CODE_LENGTH}
        >
          {submitting ? 'さがしています…' : 'つぎへ'}
        </button>
      </form>

      <p className="notice">
        ばんごうが わからないときは、おとなの人に きいてね。
        <br />
        URLを もらっているときは、その URLを ひらくだけで はいれるよ。
      </p>
    </main>
  );
}
