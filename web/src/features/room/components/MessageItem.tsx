import type { Message } from '../types.ts';

interface MessageItemProps {
  message: Message;
  isMine: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function MessageItem({ message, isMine }: MessageItemProps) {
  if (message.kind === 'system') {
    return <li className="message message-system">{message.body}</li>;
  }

  const speaker = message.kind === 'ai' ? 'AI' : (message.displayName ?? 'だれか');

  return (
    <li className={`message message-${message.kind} ${isMine ? 'is-mine' : ''}`}>
      <div className="message-head">
        <span className="message-speaker">{speaker}</span>
        <time className="message-time" dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
      <p className="message-body">{message.body}</p>
    </li>
  );
}
