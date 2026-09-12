import { useParams } from 'react-router-dom';
import { JoinForm } from './components/JoinForm.tsx';
import { ChatRoom } from './components/ChatRoom.tsx';
import { useRoomInfo } from './hooks/useRoomInfo.ts';
import { useRoomSession } from './hooks/useRoomSession.ts';

export function RoomPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const info = useRoomInfo(roomId);
  const { session, onJoined, onLeft } = useRoomSession(roomId);

  if (info.status === 'loading' || session.status === 'checking') {
    return <main className="centered-page">よみこみちゅう…</main>;
  }

  if (info.status === 'not_found') {
    return (
      <main className="centered-page">
        <h1>へやが みつかりません</h1>
        <p>URLを もういちど かくにんしてね。</p>
      </main>
    );
  }

  if (info.status === 'error') {
    return (
      <main className="centered-page">
        <h1>つながりませんでした</h1>
        <p>すこし まってから、ページを ひらきなおしてね。</p>
      </main>
    );
  }

  if (info.room.closed) {
    return (
      <main className="centered-page">
        <h1>{info.room.name}</h1>
        <p>この へやは おわりました。</p>
      </main>
    );
  }

  if (session.status === 'guest') {
    return <JoinForm room={info.room} onJoined={onJoined} />;
  }

  return <ChatRoom room={info.room} me={session.me} onLeft={onLeft} />;
}
