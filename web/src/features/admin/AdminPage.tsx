import { useState } from 'react';
import { useAdminSession } from './hooks/useAdminSession.ts';
import { useRooms } from './hooks/useRooms.ts';
import { AdminLogin } from './components/AdminLogin.tsx';
import { AccountManager } from './components/AccountManager.tsx';
import { CreateRoomForm } from './components/CreateRoomForm.tsx';
import { RoomList } from './components/RoomList.tsx';
import { RoomDetailPanel } from './components/RoomDetailPanel.tsx';
import type { AdminSession } from './types.ts';

export function AdminPage() {
  const { auth, signIn, signOut } = useAdminSession();

  if (auth.status === 'checking') {
    return <main className="centered-page">確認中…</main>;
  }

  if (auth.status === 'signed_out') {
    return <AdminLogin error={auth.error} onCredential={signIn} />;
  }

  return <AdminConsole session={auth.session} onSignOut={() => void signOut()} />;
}

interface AdminConsoleProps {
  session: AdminSession;
  onSignOut: () => void;
}

/** ログインが通ってから表示する本体。部屋の一覧と、選んだ部屋の詳細 */
function AdminConsole({ session, onSignOut }: AdminConsoleProps) {
  const { rooms, error, reload } = useRooms();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 削除された部屋や、まだ一覧に載っていない部屋を選んだままにしない
  const selected = rooms.some((room) => room.id === selectedId) ? selectedId : null;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <h1 className="admin-title">管理画面</h1>
        <div className="admin-header-right">
          {!session.aiConfigured && (
            <span className="status-badge">AI未設定（子ども同士のチャットのみ）</span>
          )}
          <span className="admin-account">
            {session.account.name ?? session.account.email}
            {session.isSuper && <span className="room-tag">特権管理者</span>}
          </span>
          <button className="text-button" type="button" onClick={onSignOut}>
            ログアウト
          </button>
        </div>
      </header>

      <p className="notice">
        AIに聞けるのは1人あたり毎分 {session.rateLimits.aiTurnsPerMinute} 回、発言は毎分{' '}
        {session.rateLimits.messagesPerMinute} 回までです。部屋ごとの上限は「AIに聞ける回数」で
        決まります。
      </p>

      {session.isSuper && (
        <section className="admin-section">
          <AccountManager currentAccountId={session.account.id} />
        </section>
      )}

      <section className="admin-section">
        <CreateRoomForm defaults={session.roomDefaults} onCreated={() => void reload()} />
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className="admin-section">
        <h2 className="admin-section-title">部屋（{rooms.length}）</h2>
        <p className="notice">
          {session.isSuper
            ? 'すべての管理者が作った部屋が出ています。'
            : 'あなたが作った部屋だけが出ています。'}
        </p>
        <RoomList
          rooms={rooms}
          selectedId={selected}
          onSelect={setSelectedId}
          showOwner={session.isSuper}
        />
      </section>

      {selected && (
        <RoomDetailPanel
          roomId={selected}
          onRoomChanged={reload}
          onRoomDeleted={() => setSelectedId(null)}
        />
      )}
    </main>
  );
}
