import { useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { errorText } from '../messages.ts';
import { copyFor } from '../copy.ts';
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
  const copy = copyFor(room.audience);

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
      setError(errorText(err instanceof ApiError ? err.code : 'unknown', room.audience));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="centered-page">
      <h1 className="join-title">{room.name}</h1>

      <form className="join-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">{copy.nameLabel}</span>
          <input
            className="field-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={12}
            required
            autoFocus
            placeholder={copy.namePlaceholder}
          />
          <span className="field-hint">{copy.nameHint}</span>
        </label>

        {room.requiresPasscode && (
          <label className="field">
            <span className="field-label">{copy.passcodeLabel}</span>
            <input
              className="field-input"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              placeholder={copy.passcodePlaceholder}
            />
          </label>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" type="submit" disabled={submitting || !displayName}>
          {submitting ? copy.joining : copy.join}
        </button>
      </form>

      <p className="notice">
        <strong>{copy.promiseTitle}</strong>
        {copy.promiseLines.map((line) => (
          <span key={line}>
            <br />
            {line}
          </span>
        ))}
      </p>
    </main>
  );
}
