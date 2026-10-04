import { useState } from 'react';
import { Timeline } from './Timeline.tsx';
import { ParticipantList } from './ParticipantList.tsx';
import { Composer } from './Composer.tsx';
import { LeaveButton } from './LeaveButton.tsx';
import { useRoomStream } from '../hooks/useRoomStream.ts';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import { aiErrorText, aiNoticeText, errorText } from '../messages.ts';
import { copyFor, type RoomCopy } from '../copy.ts';
import type { Participant, RoomInfo } from '../types.ts';

interface ChatRoomProps {
  room: RoomInfo;
  me: Participant;
  onLeft: () => void;
}

/** 意見モードのボタンに添える説明。押せない理由があればそれを出す */
function askButtonTitle(copy: RoomCopy, aiEnabled: boolean, aiBusy: boolean): string {
  if (!aiEnabled) return copy.aiResting;
  if (aiBusy) return copy.askOpinionBusy;
  return copy.askOpinionTitle;
}

export function ChatRoom({ room, me, onLeft }: ChatRoomProps) {
  const { messages, participants, status, loadError, roomClosed, kicked, streamingId, aiError } =
    useRoomStream(room.id);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  // 意見をたのんでから、受け付けられたかどうかが返るまで
  const [asking, setAsking] = useState(false);

  const opinionMode = room.aiMode === 'opinion';
  const { audience } = room;
  const copy = copyFor(audience);

  const handleSend = async (
    body: string,
    askAi: boolean,
    attachmentIds: string[],
  ): Promise<boolean> => {
    setSendError(null);
    setAiNotice(null);
    try {
      const { ai } = await api.sendMessage(room.id, { body, askAi, attachmentIds });
      setAiNotice(aiNoticeText(ai, room.aiMode, audience));
      return true;
    } catch (error) {
      setSendError(errorText(error instanceof ApiError ? error.code : 'unknown', audience));
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
      setAiNotice(aiNoticeText(ai, room.aiMode, audience));
    } catch (error) {
      setSendError(errorText(error instanceof ApiError ? error.code : 'unknown', audience));
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
        <p>{copy.kicked}</p>
      </main>
    );
  }

  return (
    <div className="chat-room">
      <header className="chat-header">
        <div className="chat-header-main">
          <h1 className="chat-title">{room.name}</h1>
          <ParticipantList participants={participants} myParticipantId={me.id} audience={audience} />
        </div>
        <div className="chat-header-right">
          {status === 'reconnecting' && (
            <span className="status-badge" role="status">
              {copy.reconnecting}
            </span>
          )}
          <LeaveButton onLeave={() => void handleLeave()} audience={audience} />
        </div>
      </header>

      {loadError && (
        <p className="form-error" role="alert">
          {copy.loadError}
        </p>
      )}
      {roomClosed && (
        <p className="room-closed" role="status">
          {copy.roomClosed}
        </p>
      )}

      <Timeline
        roomId={room.id}
        messages={messages}
        myParticipantId={me.id}
        streamingId={streamingId}
        aiMode={room.aiMode}
        audience={audience}
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
      {aiError && aiErrorText(aiError, room.aiMode, audience) && (
        <p className="ai-notice" role="status">
          {aiErrorText(aiError, room.aiMode, audience)}
        </p>
      )}

      {streamingId && (
        <button className="stop-button" type="button" onClick={() => void handleStop()}>
          {copy.stop}
        </button>
      )}

      {opinionMode && (
        <div className="ai-ask">
          <button
            className="ai-button"
            type="button"
            onClick={() => void handleAskOpinion()}
            disabled={!room.aiAvailable || streamingId !== null || asking || roomClosed}
            title={askButtonTitle(copy, room.aiAvailable, streamingId !== null)}
          >
            {copy.askOpinion}
          </button>
          <p className="ai-ask-hint">{copy.askOpinionHint}</p>
        </div>
      )}

      <Composer
        roomId={room.id}
        audience={audience}
        onSend={handleSend}
        showAiButton={!opinionMode}
        aiEnabled={room.aiAvailable}
        aiBusy={streamingId !== null}
        disabled={roomClosed}
      />
    </div>
  );
}
