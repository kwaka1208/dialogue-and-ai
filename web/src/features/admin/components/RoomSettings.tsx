import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import type { AdminRoom } from '../types.ts';

interface RoomSettingsProps {
  token: string;
  room: AdminRoom;
  onSaved: () => Promise<void>;
}

/** 部屋ごとの設定変更。合言葉と有効期限はここでは触らない（期限は「延長」ボタン） */
export function RoomSettings({ token, room, onSaved }: RoomSettingsProps) {
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const [turnLimit, setTurnLimit] = useState(String(room.turnLimit));
  const [replyMode, setReplyMode] = useState(room.replyMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 別の部屋を選んだとき、前の部屋の入力値を残さない
  useEffect(() => {
    setName(room.name);
    setCapacity(String(room.capacity));
    setTurnLimit(String(room.turnLimit));
    setReplyMode(room.replyMode);
    setError(null);
  }, [room.id, room.name, room.capacity, room.turnLimit, room.replyMode]);

  const changed =
    name !== room.name ||
    Number(capacity) !== room.capacity ||
    Number(turnLimit) !== room.turnLimit ||
    replyMode !== room.replyMode;

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.updateRoom(token, room.id, {
        name,
        capacity: Number(capacity),
        turnLimit: Number(turnLimit),
        replyMode,
      });
      await onSaved();
    } catch {
      setError('設定を変更できませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={(e) => void handleSubmit(e)}>
      <label className="field">
        <span className="field-label">部屋の名前</span>
        <input
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
        />
      </label>

      <div className="admin-form-row">
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
          <span className="field-hint">これまでに使った {room.turnsUsed} 回は戻らない</span>
        </label>
      </div>

      <label className="field">
        <span className="field-label">AIの返し方</span>
        <select
          className="field-input"
          value={replyMode}
          onChange={(e) => setReplyMode(e.target.value === 'always' ? 'always' : 'mention')}
        >
          <option value="mention">呼ばれたら返す</option>
          <option value="always">毎回返す</option>
        </select>
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="primary-button" type="submit" disabled={saving || !changed}>
        {saving ? '保存中…' : '設定を保存'}
      </button>
    </form>
  );
}
