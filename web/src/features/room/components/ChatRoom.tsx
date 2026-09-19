import { useState } from 'react';
import { Timeline } from './Timeline.tsx';
import { ParticipantList } from './ParticipantList.tsx';
import { Composer } from './Composer.tsx';
import { LeaveButton } from './LeaveButton.tsx';
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

/** 意見モードのボタンに添える説明。押せない理由があればそれを出す */
function askButtonTitle(aiEnabled: boolean, aiBusy: boolean): string {
  if (!aiEnabled) return 'いまは AIが おやすみちゅう';
  if (aiBusy) return 'AIが いけんを かいているよ';
  return 'ここまでの はなしについて AIの いけんを きく';
}

export function ChatRoom({ room, me, onLeft }: ChatRoomProps) {
  const { messages, participants, status, loadError, roomClosed, kicked, streamingId, aiError } =
    useRoomStream(room.id);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  // 意見をたのんでから、受け付けられたかどうかが返るまで
  const [asking, setAsking] = useState(false);

  const opinionMode = room.aiMode === 'opinion';

  const handleSend = async (
    body: string,
    askAi: boolean,
    attachmentIds: string[],
  ): Promise<boolean> => {
    setSendError(null);
    setAiNotice(null);
    try {
      const { ai } = await api.sendMessage(room.id, { body, askAi, attachmentIds });
      setAiNotice(aiNoticeText(ai, room.aiMode));
      return true;
    } catch (error) {
      setSendError(errorText(error instanceof ApiError ? error.code : 'unknown'));
      return false;
    }
  };

  /** 意見モードの「AIに いけんを きく」。発言は送らず、ここまでのやり取りを見てもらう */
  const handleAskOpinion = async (): Promise<void> => {
    setSendError(null);
    setAiNotice(null);
    setAsking(true);
    try {
      const { ai } = await api.askOpinion(room.id);
      setAiNotice(aiNoticeText(ai, room.aiMode));
    } catch (error) {
      setSendError(errorText(error instanceof ApiError ? error.code : 'unknown'));
    } finally {
      setAsking(false);
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
        <div className="chat-header-main">
          <h1 className="chat-title">{room.name}</h1>
          <ParticipantList participants={participants} myParticipantId={me.id} />
        </div>
        <div className="chat-header-right">
          {status === 'reconnecting' && (
            <span className="status-badge" role="status">
              つなぎなおしています…
            </span>
          )}
          <LeaveButton onLeave={() => void handleLeave()} />
        </div>
      </header>

      {loadError && (
        <p className="form-error" role="alert">
          いままでの はなしを よみこめませんでした
        </p>
      )}
      {roomClosed && (
        <p className="room-closed" role="status">
          この へやは おわりました
        </p>
      )}

      <Timeline
        roomId={room.id}
        messages={messages}
        myParticipantId={me.id}
        streamingId={streamingId}
        aiMode={room.aiMode}
      />

      {sendError && (
        <p className="form-error" role="alert">
          {sendError}
        </p>
      )}
      {aiNotice && (
        <p className="ai-notice" role="status">
          {aiNotice}
        </p>
      )}
      {aiError && aiErrorText(aiError, room.aiMode) && (
        <p className="ai-notice" role="status">
          {aiErrorText(aiError, room.aiMode)}
        </p>
      )}

      {streamingId && (
        <button className="stop-button" type="button" onClick={() => void handleStop()}>
          ■ とめる
        </button>
      )}

      {opinionMode && (
        <div className="ai-ask">
          <button
            className="ai-button"
            type="button"
            onClick={() => void handleAskOpinion()}
            disabled={!room.aiAvailable || streamingId !== null || asking || roomClosed}
            title={askButtonTitle(room.aiAvailable, streamingId !== null)}
          >
            🤖 AIに いけんを きく
          </button>
          <p className="ai-ask-hint">ここまでの みんなの はなしを 見て、AIが いけんを いいます</p>
        </div>
      )}

      <Composer
        roomId={room.id}
        onSend={handleSend}
        showAiButton={!opinionMode}
        aiEnabled={room.aiAvailable}
        aiBusy={streamingId !== null}
        disabled={roomClosed}
      />
    </div>
  );
}
