import type { PresenceEntry } from '../types.ts';

interface ParticipantListProps {
  participants: PresenceEntry[];
  myParticipantId: string;
}

export function ParticipantList({ participants, myParticipantId }: ParticipantListProps) {
  return (
    <ul className="participant-list">
      {participants.map((p) => (
        <li key={p.id} className="participant">
          {p.displayName}
          {p.id === myParticipantId && <span className="participant-me">（あなた）</span>}
        </li>
      ))}
    </ul>
  );
}
