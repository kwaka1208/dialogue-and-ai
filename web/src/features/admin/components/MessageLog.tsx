import { timeText } from '../format.ts';
import type { Message } from '../types.ts';

interface MessageLogProps {
  messages: Message[];
}

const KIND_LABEL: Record<Message['kind'], string> = {
  user: '',
  ai: 'AI',
  system: 'システム',
};

export function MessageLog({ messages }: MessageLogProps) {
  if (messages.length === 0) {
    return <p className="admin-empty">まだ発言がありません。</p>;
  }

  return (
    <ol className="log-list">
      {messages.map((message) => (
        <li key={message.id} className={`log-item log-${message.kind}`}>
          <span className="log-time">{timeText(message.createdAt)}</span>
          <span className="log-speaker">
            {message.displayName ?? KIND_LABEL[message.kind]}
          </span>
          <span className="log-body">
            {message.body}
            {message.attachments.length > 0 && (
              <span className="log-attachments">
                {message.attachments.map((attachment) => attachment.originalName).join(' / ')}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
