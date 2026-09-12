import { useState } from 'react';
import * as api from '../api.ts';
import { timeText } from '../format.ts';
import type { AdminParticipant } from '../types.ts';

interface ParticipantTableProps {
  token: string;
  roomId: string;
  participants: AdminParticipant[];
  onChanged: () => Promise<void>;
}

function stateText(participant: AdminParticipant): string {
  if (participant.kickedAt !== null) return '強制退出';
  if (participant.online) return '在室';
  return '退室';
}

export function ParticipantTable({
  token,
  roomId,
  participants,
  onChanged,
}: ParticipantTableProps) {
  // 押し間違いを防ぐため、2回押させる。確認ダイアログは出さない
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const handleKick = async (participantId: string): Promise<void> => {
    if (confirming !== participantId) {
      setConfirming(participantId);
      return;
    }

    setWorking(participantId);
    try {
      await api.kickParticipant(token, roomId, participantId);
      await onChanged();
    } finally {
      setWorking(null);
      setConfirming(null);
    }
  };

  if (participants.length === 0) {
    return <p className="admin-empty">まだ誰も入っていません。</p>;
  }

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>名前</th>
          <th>入室</th>
          <th>状態</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {participants.map((participant) => (
          <tr key={participant.id}>
            <td>{participant.displayName}</td>
            <td>{timeText(participant.joinedAt)}</td>
            <td>
              <span className={participant.online ? 'state-online' : 'state-away'}>
                {stateText(participant)}
              </span>
            </td>
            <td>
              {participant.kickedAt === null && (
                <button
                  className={confirming === participant.id ? 'danger-button' : 'text-button'}
                  type="button"
                  onClick={() => void handleKick(participant.id)}
                  disabled={working === participant.id}
                >
                  {working === participant.id
                    ? '退出中…'
                    : confirming === participant.id
                      ? '本当に退出させる'
                      : '退出させる'}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
