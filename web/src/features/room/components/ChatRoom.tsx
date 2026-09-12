import { useState } from 'react';
import { Timeline } from './Timeline.tsx';
import { ParticipantList } from './ParticipantList.tsx';
import { Composer } from './Composer.tsx';
import { useRoomStream } from '../hooks/useRoomStream.ts';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { aiErrorText, aiNoticeText, errorText } from '../messages.ts';
import type { Participant, RoomInfo } from '../types.ts';

interface ChatRoomProps {
  room: RoomInfo;
  me: Participant;
  onLeft: () => void;
}

export function ChatRoom({ room, me, onLeft }: ChatRoomProps) {
  const { messages, participants, status, loadError, roomClosed, kicked, streamingId, aiError } =
    useRoomStream(room.id);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const handleSend = async (
    body: string,
    askAi: boolean,
    attachmentIds: string[],
  ): Promise<boolean> => {
    setSendError(null);
    setAiNotice(null);
    try {
      const { ai } = await api.sendMessage(room.id, { body, askAi, attachmentIds });
      setAiNotice(aiNoticeText(ai));
      return true;
    } catch (error) {
      setSendError(errorText(error instanceof ApiError ? error.code : 'unknown'));
      return false;
    }
  };

  const handleStop = async (): Promise<void> => {
    await api.stopAi(room.id).catch(() => undefined);
  };

  const handleLeave = async (): Promise<void> => {
    await api.leave(room.id).catch(() => undefined);
    onLeft();
  };

  // 管理画面から出されたら、その場でタイムラインを閉じる
  if (kicked) {
    return (
      <main className="centered-page">
        <h1>{room.name}</h1>
        <p>この へやから でました。おとなの人に きいてね。</p>
      </main>
    );
  }

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

      <Timeline
        roomId={room.id}
        messages={messages}
        myParticipantId={me.id}
        streamingId={streamingId}
      />

      {sendError && <p className="form-error">{sendError}</p>}
      {aiNotice && <p className="ai-notice">{aiNotice}</p>}
      {aiError && aiErrorText(aiError) && <p className="ai-notice">{aiErrorText(aiError)}</p>}

      {streamingId && (
        <button className="stop-button" type="button" onClick={() => void handleStop()}>
          とめる
        </button>
      )}

      <Composer
        roomId={room.id}
        onSend={handleSend}
        aiEnabled={room.aiAvailable}
        aiBusy={streamingId !== null}
        disabled={roomClosed}
      />
    </div>
  );
}
