import { MessageItem } from './MessageItem.tsx';
import { useStickToBottom } from '../hooks/useStickToBottom.ts';
import type { AiMode, Message } from '../types.ts';

interface TimelineProps {
  roomId: string;
  messages: Message[];
  myParticipantId: string;
  streamingId: string | null;
  aiMode: AiMode;
}

export function Timeline({
  roomId,
  messages,
  myParticipantId,
  streamingId,
  aiMode,
}: TimelineProps) {
  const last = messages[messages.length - 1];
  // AIの本文は件数が増えないまま伸びるので、末尾の長さも見る
  const { scrollRef, bottomRef, atBottom, jumpToBottom } = useStickToBottom(
    `${messages.length}:${last?.body.length ?? 0}`,
  );

  return (
    <div className="timeline-area">
      <div className="timeline" ref={scrollRef}>
        <ul className="message-list">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              roomId={roomId}
              isMine={message.participantId === myParticipantId}
              isStreaming={message.id === streamingId}
              aiMode={aiMode}
            />
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      {!atBottom && (
        <button className="jump-button" type="button" onClick={jumpToBottom}>
          ↓ あたらしい はなし
        </button>
      )}
    </div>
  );
}
