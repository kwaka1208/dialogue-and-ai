import type { PresenceEntry } from '../types.ts';

interface ParticipantListProps {
  participants: PresenceEntry[];
  myParticipantId: string;
}

/** いま部屋にいる人。人数が増えるとヘッダーが縦に伸びるので、横に流す */
export function ParticipantList({ participants, myParticipantId }: ParticipantListProps) {
  return (
    <div className="participants">
      <span className="participant-count">いま {participants.length}人</span>
      <ul className="participant-list">
        {participants.map((p) => (
          <li key={p.id} className={`participant ${p.id === myParticipantId ? 'is-me' : ''}`}>
            {p.displayName}
            {p.id === myParticipantId && <span className="participant-me">（あなた）</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
