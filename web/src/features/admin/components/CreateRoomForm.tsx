import { useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import type { AdminSession, RoomSummary } from '../types.ts';

interface CreateRoomFormProps {
  token: string;
  defaults: AdminSession['roomDefaults'];
  onCreated: (room: RoomSummary | null) => void;
}

export function CreateRoomForm({ token, defaults, onCreated }: CreateRoomFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [capacity, setCapacity] = useState(String(defaults.capacity));
  const [turnLimit, setTurnLimit] = useState(String(defaults.turnLimit));
  const [expiresInHours, setExpiresInHours] = useState(String(defaults.expiresInHours));
  const [replyMode, setReplyMode] = useState(defaults.replyMode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.createRoom(token, {
        name,
        // 空欄なら合言葉なしで作る
        passcode: passcode === '' ? undefined : passcode,
        replyMode,
        capacity: Number(capacity),
        turnLimit: Number(turnLimit),
        expiresInHours: Number(expiresInHours),
      });
      setName('');
      setPasscode('');
      setOpen(false);
      onCreated(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_input'
          ? '入力に誤りがあります（合言葉は4桁の数字）'
          : '部屋を作れませんでした',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button className="primary-button" type="button" onClick={() => setOpen(true)}>
        部屋を作る
      </button>
    );
  }

  return (
    <form className="admin-card admin-form" onSubmit={(e) => void handleSubmit(e)}>
      <h2 className="admin-card-title">部屋を作る</h2>

      <label className="field">
        <span className="field-label">部屋の名前</span>
        <input
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
          autoFocus
          placeholder="6月のワークショップ"
        />
      </label>

      <div className="admin-form-row">
        <label className="field">
          <span className="field-label">合言葉（4桁・任意）</span>
          <input
            className="field-input"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="なしでもよい"
          />
        </label>

        <label className="field">
          <span className="field-label">定員</span>
          <input
            className="field-input"
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            min={1}
            max={100}
            required
          />
        </label>
      </div>

      <div className="admin-form-row">
        <label className="field">
          <span className="field-label">AIに聞ける回数</span>
          <input
            className="field-input"
            type="number"
            value={turnLimit}
            onChange={(e) => setTurnLimit(e.target.value)}
            min={1}
            max={10000}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">有効時間（時間）</span>
          <input
            className="field-input"
            type="number"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            min={0.5}
            max={72}
            step={0.5}
            required
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">AIの返し方</span>
        <select
          className="field-input"
          value={replyMode}
          onChange={(e) => setReplyMode(e.target.value === 'always' ? 'always' : 'mention')}
        >
          <option value="mention">呼ばれたら返す（@AI か「AIにきく」ボタン）</option>
          <option value="always">毎回返す</option>
        </select>
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="admin-actions">
        <button className="primary-button" type="submit" disabled={submitting || !name}>
          {submitting ? '作成中…' : '作る'}
        </button>
        <button className="text-button" type="button" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
