import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem.tsx';
import type { Message } from '../types.ts';

interface TimelineProps {
  messages: Message[];
  myParticipantId: string;
  streamingId: string | null;
}

export function Timeline({ messages, myParticipantId, streamingId }: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastBodyLength = messages[messages.length - 1]?.body.length ?? 0;

  // 新しい発言が増えたら一番下へ。ブラウザのスクロール位置という外部状態との同期。
  // AIの本文は件数が増えないまま伸びるので、末尾の長さも見る
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastBodyLength]);

  return (
    <div className="timeline">
      <ul className="message-list">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isMine={message.participantId === myParticipantId}
            isStreaming={message.id === streamingId}
          />
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
