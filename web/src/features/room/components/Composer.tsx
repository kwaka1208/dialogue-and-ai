import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { errorText } from '../messages.ts';
import { ACCEPT_ATTRIBUTE, MAX_FILES_PER_MESSAGE } from '../attachments.ts';
import { fileSizeText } from './AttachmentList.tsx';
import type { Attachment } from '../types.ts';

interface ComposerProps {
  roomId: string;
  /** 送れたら true。false のときは書いたものを消さずに残す */
  onSend: (body: string, askAi: boolean, attachmentIds: string[]) => Promise<boolean>;
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

export function Composer({ roomId, onSend, aiEnabled, aiBusy, disabled }: ComposerProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  // アップロードずみで、まだ送っていない添付
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = body.trim().length > 0 || pending.length > 0;
  const canSend = hasContent && !sending && !uploading && !disabled;

  const send = async (askAi: boolean): Promise<void> => {
    if (!canSend) return;
    setSending(true);
    try {
      const sent = await onSend(
        body.trim(),
        askAi,
        pending.map((attachment) => attachment.id),
      );
      if (sent) {
        setBody('');
        setPending([]);
        setUploadError(null);
      }
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

  /** 選んだファイルはその場で送っておく。発言に付くのは「いう」を押したとき */
  const handleFiles = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const chosen = [...(event.target.files ?? [])];
    // 同じファイルをもう一度選べるように、input の値は先に空へ戻す
    event.target.value = '';
    if (chosen.length === 0) return;

    setUploadError(null);
    setUploading(true);
    try {
      let added = 0;
      for (const file of chosen) {
        if (pending.length + added >= MAX_FILES_PER_MESSAGE) {
          setUploadError(errorText('too_many_files'));
          break;
        }
        try {
          const { attachment } = await api.uploadAttachment(roomId, file);
          setPending((current) => [...current, attachment]);
          added += 1;
        } catch (error) {
          setUploadError(errorText(error instanceof ApiError ? error.code : 'unknown'));
          break;
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (attachmentId: string): Promise<void> => {
    setPending((current) => current.filter((attachment) => attachment.id !== attachmentId));
    await api.discardAttachment(roomId, attachmentId).catch(() => undefined);
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {pending.length > 0 && (
        <ul className="pending-list">
          {pending.map((attachment) => (
            <li key={attachment.id} className="pending-item">
              {attachment.kind === 'image' && (
                <img
                  className="pending-thumb"
                  src={api.attachmentUrl(roomId, attachment.id)}
                  alt=""
                />
              )}
              <span className="pending-name">{attachment.originalName}</span>
              <span className="attachment-size">{fileSizeText(attachment.size)}</span>
              <button
                className="pending-remove"
                type="button"
                onClick={() => void handleRemove(attachment.id)}
                title="この ファイルを やめる"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploadError && <p className="form-error">{uploadError}</p>}

      <div className="composer-row">
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
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            onChange={(e) => void handleFiles(e)}
          />
          <button
            className="attach-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading || pending.length >= MAX_FILES_PER_MESSAGE}
            title={
              pending.length >= MAX_FILES_PER_MESSAGE
                ? `ファイルは ${MAX_FILES_PER_MESSAGE}こまで`
                : 'ファイルを つける'
            }
          >
            {uploading ? 'おくってます…' : '📎 ファイル'}
          </button>
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
      </div>
    </form>
  );
}
