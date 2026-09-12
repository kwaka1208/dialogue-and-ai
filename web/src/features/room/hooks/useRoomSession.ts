import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import type { Participant } from '../types.ts';

type SessionState =
  | { status: 'checking' }
  | { status: 'guest' }
  | { status: 'joined'; me: Participant };

/**
 * 入室しているかどうかを持つ。
 * 参加者トークンは HttpOnly cookie にあるので、リロードしても /me で復帰できる。
 */
export function useRoomSession(roomId: string): {
  session: SessionState;
  onJoined: (me: Participant) => void;
  onLeft: () => void;
} {
  const [session, setSession] = useState<SessionState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    setSession({ status: 'checking' });

    api
      .whoAmI(roomId)
      .then(({ participant }) => {
        if (!cancelled) setSession({ status: 'joined', me: participant });
      })
      .catch(() => {
        if (!cancelled) setSession({ status: 'guest' });
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const onJoined = useCallback((me: Participant) => setSession({ status: 'joined', me }), []);
  const onLeft = useCallback(() => setSession({ status: 'guest' }), []);

  return { session, onJoined, onLeft };
}
