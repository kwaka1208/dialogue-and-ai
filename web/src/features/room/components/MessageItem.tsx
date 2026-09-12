import { AttachmentList } from './AttachmentList.tsx';
import type { Message } from '../types.ts';

interface MessageItemProps {
  message: Message;
  roomId: string;
  isMine: boolean;
  /** AIがいま書いている最中のメッセージ */
  isStreaming: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function MessageItem({ message, roomId, isMine, isStreaming }: MessageItemProps) {
  if (message.kind === 'system') {
    return <li className="message message-system">{message.body}</li>;
  }

  const speaker = message.kind === 'ai' ? 'AI' : (message.displayName ?? 'だれか');

  // 最初のひとことが届くまでのあいだ、待たされている感じを減らす
  if (isStreaming && message.body === '') {
    return (
      <li className="message message-ai is-streaming">
        <div className="message-head">
          <span className="message-speaker">{speaker}</span>
        </div>
        <p className="message-body message-thinking">かんがえちゅう…</p>
      </li>
    );
  }

  return (
    <li
      className={`message message-${message.kind} ${isMine ? 'is-mine' : ''} ${isStreaming ? 'is-streaming' : ''}`}
    >
      <div className="message-head">
        <span className="message-speaker">{speaker}</span>
        <time className="message-time" dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
      {message.body !== '' && <p className="message-body">{message.body}</p>}
      <AttachmentList roomId={roomId} attachments={message.attachments} />
    </li>
  );
}
