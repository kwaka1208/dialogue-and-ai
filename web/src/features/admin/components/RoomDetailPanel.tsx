import { useState } from 'react';
import * as api from '../api.ts';
import { useRoomDetail } from '../hooks/useRoomDetail.ts';
import { dateTimeText, remainingText } from '../format.ts';
import { RoomSettings } from './RoomSettings.tsx';
import { ParticipantTable } from './ParticipantTable.tsx';
import { MessageLog } from './MessageLog.tsx';

interface RoomDetailPanelProps {
  token: string;
  roomId: string;
  /** 一覧の値も変わるので、部屋をいじったら親にも知らせる */
  onRoomChanged: () => Promise<void>;
  onRoomDeleted: () => void;
}

/** 延長は4時間きざみ。イベントが延びたときに押す */
const EXTEND_HOURS = 4;

export function RoomDetailPanel({
  token,
  roomId,
  onRoomChanged,
  onRoomDeleted,
}: RoomDetailPanelProps) {
  const { detail, messages, error, reload } = useRoomDetail(token, roomId);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    await reload();
    await onRoomChanged();
  };

  const run = async (label: string, action: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(`${label}に失敗しました`);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await run('削除', async () => {
      await api.deleteRoom(token, roomId);
      setConfirmingDelete(false);
      onRoomDeleted();
      await onRoomChanged();
    });
  };

  if (error && !detail) return <p className="form-error">{error}</p>;
  if (!detail) return <p className="admin-empty">読み込み中…</p>;

  const { room, participants } = detail;
  const onlineCount = participants.filter((participant) => participant.online).length;

  return (
    <div className="admin-card room-detail">
      <header className="room-detail-head">
        <h2 className="admin-card-title">{room.name}</h2>
        <code className="room-url">
          {location.origin}
          {detail.url}
        </code>
      </header>

      <dl className="room-stats">
        <div>
          <dt>期限</dt>
          <dd>
            {dateTimeText(room.expiresAt)}（{remainingText(room.expiresAt)}）
          </dd>
        </div>
        <div>
          <dt>在室</dt>
          <dd>
            {onlineCount} / {room.capacity} 人
          </dd>
        </div>
        <div>
          <dt>発言</dt>
          <dd>{detail.messageCount} 件</dd>
        </div>
        <div>
          <dt>AIの使用</dt>
          <dd>
            {room.turnsUsed} / {room.turnLimit} 回
          </dd>
        </div>
        <div>
          <dt>添付</dt>
          <dd>{detail.attachmentCount} 件</dd>
        </div>
        <div>
          <dt>合言葉</dt>
          <dd>{room.hasPasscode ? 'あり' : 'なし'}</dd>
        </div>
      </dl>

      <div className="admin-actions">
        <button
          className="text-button"
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void run('延長', async () => {
              await api.extendRoom(token, roomId, EXTEND_HOURS);
              await refresh();
            })
          }
        >
          {EXTEND_HOURS}時間 延長
        </button>
        <button
          className="text-button"
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void run('エクスポート', () => api.downloadExport(token, roomId))
          }
        >
          ログをエクスポート
        </button>
        <button
          className={confirmingDelete ? 'danger-button' : 'text-button'}
          type="button"
          disabled={busy !== null}
          onClick={() => void handleDelete()}
        >
          {confirmingDelete ? '本当に削除する（添付も消える）' : '部屋を削除'}
        </button>
      </div>

      {confirmingDelete && (
        <p className="notice">
          削除すると添付ファイルは消えます。会話ログはDBに残りますが、先にエクスポートしておくことを
          おすすめします。
        </p>
      )}

      {actionError && <p className="form-error">{actionError}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="admin-section">
        <h3 className="admin-section-title">参加者</h3>
        <ParticipantTable
          token={token}
          roomId={roomId}
          participants={participants}
          onChanged={refresh}
        />
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">設定</h3>
        <RoomSettings token={token} room={room} onSaved={refresh} />
      </section>

      <section className="admin-section">
        <h3 className="admin-section-title">会話ログ</h3>
        <MessageLog messages={messages} />
      </section>
    </div>
  );
}
