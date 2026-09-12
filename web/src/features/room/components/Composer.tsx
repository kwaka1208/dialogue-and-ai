import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface ComposerProps {
  onSend: (body: string, askAi: boolean) => Promise<void>;
  /** サーバーにAIの設定があるか */
  aiEnabled: boolean;
  /** いまAIが誰かに返事を書いている最中か */
  aiBusy: boolean;
  disabled: boolean;
}

function aiButtonTitle(aiEnabled: boolean, aiBusy: boolean): string {
  if (!aiEnabled) return 'いまは AIが おやすみちゅう';
  if (aiBusy) return 'AIが おへんじを かいているよ';
  return 'AIに こたえてもらう';
}

export function Composer({ onSend, aiEnabled, aiBusy, disabled }: ComposerProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = body.trim().length > 0 && !sending && !disabled;

  const send = async (askAi: boolean): Promise<void> => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(body.trim(), askAi);
      setBody('');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void send(false);
  };

  // Enterで送信、Shift+Enterで改行。スマホでは改行ボタンが出るので邪魔しない
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(false);
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer-input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={2000}
        rows={2}
        placeholder={disabled ? 'この へやは おわりました' : 'メッセージを かこう'}
        disabled={disabled}
      />
      <div className="composer-buttons">
        <button className="primary-button" type="submit" disabled={!canSend}>
          いう
        </button>
        <button
          className="ai-button"
          type="button"
          onClick={() => void send(true)}
          disabled={!canSend || !aiEnabled || aiBusy}
          title={aiButtonTitle(aiEnabled, aiBusy)}
        >
          AIに きく
        </button>
      </div>
    </form>
  );
}
