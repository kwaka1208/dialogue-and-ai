import { useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { errorText } from '../messages.ts';
import type { Participant, RoomInfo } from '../types.ts';

interface JoinFormProps {
  room: RoomInfo;
  onJoined: (me: Participant) => void;
}

export function JoinForm({ room, onJoined }: JoinFormProps) {
  const [displayName, setDisplayName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { participant } = await api.join(room.id, {
        displayName,
        passcode: room.requiresPasscode ? passcode : undefined,
      });
      onJoined(participant);
    } catch (err) {
      setError(errorText(err instanceof ApiError ? err.code : 'unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="centered-page">
      <h1 className="join-title">{room.name}</h1>

      <form className="join-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">なまえ</span>
          <input
            className="field-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={12}
            required
            autoFocus
            placeholder="たろう"
          />
          <span className="field-hint">1〜12もじ。ほんとうの なまえで なくても いいよ</span>
        </label>

        {room.requiresPasscode && (
          <label className="field">
            <span className="field-label">あいことば</span>
            <input
              className="field-input"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              placeholder="4けたの すうじ"
            />
          </label>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" type="submit" disabled={submitting || !displayName}>
          {submitting ? 'はいっています…' : 'はいる'}
        </button>
      </form>

      <p className="notice">
        <strong>やくそく</strong>
        <br />
        ここで はなしたことは、おとなが あとから ぜんぶ よめます。
        <br />
        じゅうしょ・がっこうの なまえ・でんわばんごうは かかないでね。
      </p>
    </main>
  );
}
