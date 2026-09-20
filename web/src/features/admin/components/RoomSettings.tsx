import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import { useModels } from '../hooks/useModels.ts';
import { AiBrainFields } from './AiBrainFields.tsx';
import type { AdminRoom, AiDefaults } from '../types.ts';

interface RoomSettingsProps {
  room: AdminRoom;
  /** 部屋で上書きしなかったときに使われる system prompt とモデル */
  aiDefaults: AiDefaults;
  onSaved: () => Promise<void>;
}

/** 部屋ごとの設定変更。合言葉と有効期限はここでは触らない（期限は「延長」ボタン） */
export function RoomSettings({ room, aiDefaults, onSaved }: RoomSettingsProps) {
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const [turnLimit, setTurnLimit] = useState(String(room.turnLimit));
  const [aiMode, setAiMode] = useState(room.aiMode);
  const [replyMode, setReplyMode] = useState(room.replyMode);
  // DB の null (既定のまま) を、画面では空文字として扱う
  const [chatModel, setChatModel] = useState(room.chatModel ?? '');
  const [opinionModel, setOpinionModel] = useState(room.opinionModel ?? '');
  const [chatPrompt, setChatPrompt] = useState(room.chatSystemPrompt ?? '');
  const [opinionPrompt, setOpinionPrompt] = useState(room.opinionSystemPrompt ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = useModels();

  // 別の部屋を選んだとき、前の部屋の入力値を残さない
  useEffect(() => {
    setName(room.name);
    setCapacity(String(room.capacity));
    setTurnLimit(String(room.turnLimit));
    setAiMode(room.aiMode);
    setReplyMode(room.replyMode);
    setChatModel(room.chatModel ?? '');
    setOpinionModel(room.opinionModel ?? '');
    setChatPrompt(room.chatSystemPrompt ?? '');
    setOpinionPrompt(room.opinionSystemPrompt ?? '');
    setError(null);
  }, [
    room.id,
    room.name,
    room.capacity,
    room.turnLimit,
    room.aiMode,
    room.replyMode,
    room.chatModel,
    room.opinionModel,
    room.chatSystemPrompt,
    room.opinionSystemPrompt,
  ]);

  const changed =
    name !== room.name ||
    Number(capacity) !== room.capacity ||
    Number(turnLimit) !== room.turnLimit ||
    aiMode !== room.aiMode ||
    replyMode !== room.replyMode ||
    chatModel !== (room.chatModel ?? '') ||
    opinionModel !== (room.opinionModel ?? '') ||
    chatPrompt !== (room.chatSystemPrompt ?? '') ||
    opinionPrompt !== (room.opinionSystemPrompt ?? '');

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.updateRoom(room.id, {
        name,
        capacity: Number(capacity),
        turnLimit: Number(turnLimit),
        aiMode,
        replyMode,
        // 空文字は「既定に戻す」。サーバー側で null に直して保存される
        chatModel,
        opinionModel,
        chatSystemPrompt: chatPrompt,
        opinionSystemPrompt: opinionPrompt,
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
        <span className="field-label">AIのモード</span>
        <select
          className="field-input"
          value={aiMode}
          onChange={(e) => setAiMode(e.target.value === 'opinion' ? 'opinion' : 'chat')}
        >
          <option value="chat">会話モード</option>
          <option value="opinion">意見モード</option>
        </select>
        <span className="field-hint">
          変えると、いま部屋にいる子の画面もボタンごと入れかわります。
        </span>
      </label>

      {aiMode === 'chat' && (
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
      )}

      {/* いま選んでいるモードのぶんだけ出す。もう一方の設定はそのまま残る */}
      {aiMode === 'chat' ? (
        <AiBrainFields
          mode="chat"
          defaults={aiDefaults.chat}
          options={models}
          model={chatModel}
          onModelChange={setChatModel}
          prompt={chatPrompt}
          onPromptChange={setChatPrompt}
        />
      ) : (
        <AiBrainFields
          mode="opinion"
          defaults={aiDefaults.opinion}
          options={models}
          model={opinionModel}
          onModelChange={setOpinionModel}
          prompt={opinionPrompt}
          onPromptChange={setOpinionPrompt}
        />
      )}

      {error && <p className="form-error">{error}</p>}

      <button className="primary-button" type="submit" disabled={saving || !changed}>
        {saving ? '保存中…' : '設定を保存'}
      </button>
    </form>
  );
}
