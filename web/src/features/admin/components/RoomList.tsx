import { dateTimeText, remainingText } from '../format.ts';
import type { RoomSummary } from '../types.ts';

interface RoomListProps {
  rooms: RoomSummary[];
  selectedId: string | null;
  onSelect: (roomId: string) => void;
  /** 作った管理者を出すか。特権管理者は他人の部屋も見えるので、誰の部屋かを示す */
  showOwner: boolean;
}

/** 部屋のURLをクリップボードに入れる。口頭で伝えるより取り違えが少ない */
async function copyUrl(room: RoomSummary): Promise<void> {
  await navigator.clipboard.writeText(`${location.origin}${room.url}`).catch(() => undefined);
}

export function RoomList({ rooms, selectedId, onSelect, showOwner }: RoomListProps) {
  if (rooms.length === 0) {
    return <p className="admin-empty">まだ部屋がありません。</p>;
  }

  return (
    <ul className="room-list">
      {rooms.map((room) => (
        <li key={room.id}>
          <div className={`room-row${room.id === selectedId ? ' is-selected' : ''}`}>
            <button className="room-row-main" type="button" onClick={() => onSelect(room.id)}>
              <span className="room-row-name">
                {room.name}
                {room.hasPasscode && <span className="room-tag">合言葉</span>}
                {room.closed && <span className="room-tag is-closed">終了</span>}
              </span>
              <span className="room-row-meta">
                {remainingText(room.expiresAt)} ・ 在室 {room.onlineCount}/{room.capacity} ・ 発言{' '}
                {room.messageCount} ・ AIの意見 {room.turnsUsed}/{room.turnLimit}
              </span>
              <span className="room-row-meta">
                作成 {dateTimeText(room.createdAt)}
                {showOwner && ` ・ ${room.ownerEmail ?? '所有者なし'}`}
              </span>
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void copyUrl(room)}
              title="子どもに渡すURLをコピー"
            >
              URLをコピー
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
