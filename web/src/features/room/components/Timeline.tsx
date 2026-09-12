import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem.tsx';
import type { Message } from '../types.ts';

interface TimelineProps {
  messages: Message[];
  myParticipantId: string;
}

export function Timeline({ messages, myParticipantId }: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新しい発言が増えたら一番下へ。ブラウザのスクロール位置という外部状態との同期
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  return (
    <div className="timeline">
      <ul className="message-list">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isMine={message.participantId === myParticipantId}
          />
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
