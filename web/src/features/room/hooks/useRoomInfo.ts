import { useEffect, useState } from 'react';
import * as api from '../api.ts';
import { ApiError } from '../../../lib/api.ts';
import type { RoomInfo } from '../types.ts';

type InfoState =
  | { status: 'loading' }
  | { status: 'ready'; room: RoomInfo }
  | { status: 'not_found' }
  | { status: 'error' };

/** 入室画面で使う。部屋の名前と、合言葉が要るかどうかを取ってくる */
export function useRoomInfo(roomId: string): InfoState {
  const [state, setState] = useState<InfoState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    api
      .roomInfo(roomId)
      .then((room) => {
        if (!cancelled) setState({ status: 'ready', room });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const notFound = error instanceof ApiError && error.status === 404;
        setState({ status: notFound ? 'not_found' : 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return state;
}
