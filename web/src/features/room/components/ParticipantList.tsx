import { copyFor } from '../copy.ts';
import type { Audience, PresenceEntry } from '../types.ts';

interface ParticipantListProps {
  participants: PresenceEntry[];
  myParticipantId: string;
  audience: Audience;
}

/** いま部屋にいる人。人数が増えるとヘッダーが縦に伸びるので、横に流す */
export function ParticipantList({ participants, myParticipantId, audience }: ParticipantListProps) {
  const copy = copyFor(audience);
  return (
    <div className="participants">
      <span className="participant-count">{copy.participantCount(participants.length)}</span>
      <ul className="participant-list">
        {participants.map((p) => (
          <li key={p.id} className={`participant ${p.id === myParticipantId ? 'is-me' : ''}`}>
            {p.displayName}
            {p.id === myParticipantId && <span className="participant-me">{copy.me}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
