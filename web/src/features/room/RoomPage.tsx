import { useParams } from 'react-router-dom';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return (
    <main className="centered-page">
      <h1>おしゃべりルーム</h1>
      <p>room: {roomId}</p>
    </main>
  );
}
