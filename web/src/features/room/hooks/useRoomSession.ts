import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import type { Participant } from '../types.ts';

type SessionState =
  | { status: 'checking' }
  | { status: 'guest' }
  | { status: 'kicked' }
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
      .catch((error: unknown) => {
        if (cancelled) return;
        // 強制退出ずみ。入室フォームを出しても同じ名前では戻れない
        const kicked = error instanceof ApiError && error.code === 'kicked';
        setSession({ status: kicked ? 'kicked' : 'guest' });
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const onJoined = useCallback((me: Participant) => setSession({ status: 'joined', me }), []);
  const onLeft = useCallback(() => setSession({ status: 'guest' }), []);

  return { session, onJoined, onLeft };
}
