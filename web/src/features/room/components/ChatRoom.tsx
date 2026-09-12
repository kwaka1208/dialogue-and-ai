import { useState } from 'react';
import { Timeline } from './Timeline.tsx';
import { ParticipantList } from './ParticipantList.tsx';
import { Composer } from './Composer.tsx';
import { useRoomStream } from '../hooks/useRoomStream.ts';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { errorText } from '../messages.ts';
import type { Participant, RoomInfo } from '../types.ts';

interface ChatRoomProps {
  room: RoomInfo;
  me: Participant;
  onLeft: () => void;
}

export function ChatRoom({ room, me, onLeft }: ChatRoomProps) {
  const { messages, participants, status, loadError, roomClosed } = useRoomStream(room.id);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSend = async (body: string, askAi: boolean): Promise<void> => {
    setSendError(null);
    try {
      await api.sendMessage(room.id, { body, askAi });
    } catch (error) {
      setSendError(errorText(error instanceof ApiError ? error.code : 'unknown'));
    }
  };

  const handleLeave = async (): Promise<void> => {
    await api.leave(room.id).catch(() => undefined);
    onLeft();
  };

  return (
    <div className="chat-room">
      <header className="chat-header">
        <div>
          <h1 className="chat-title">{room.name}</h1>
          <ParticipantList participants={participants} myParticipantId={me.id} />
        </div>
        <div className="chat-header-right">
          {status === 'reconnecting' && <span className="status-badge">つなぎなおしています…</span>}
          <button className="text-button" type="button" onClick={() => void handleLeave()}>
            でる
          </button>
        </div>
      </header>

      {loadError && <p className="form-error">かいわを よみこめませんでした</p>}
      {roomClosed && <p className="room-closed">この へやは おわりました</p>}

      <Timeline messages={messages} myParticipantId={me.id} />

      {sendError && <p className="form-error">{sendError}</p>}

      <Composer onSend={handleSend} aiEnabled={false} disabled={roomClosed} />
    </div>
  );
}
