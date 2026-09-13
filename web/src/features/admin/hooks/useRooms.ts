import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import type { RoomSummary } from '../types.ts';

/**
 * 部屋の一覧。在室人数はサーバーのSSE接続を数えた値なので、
 * 開いたままでも古くならないように一定間隔で取り直す。
 */
const RELOAD_INTERVAL_MS = 15_000;

export function useRooms(): {
  rooms: RoomSummary[];
  error: string | null;
  reload: () => Promise<void>;
} {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const data = await api.listRooms();
      setRooms(data.rooms);
      setError(null);
    } catch {
      setError('部屋の一覧を読み込めませんでした');
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), RELOAD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return { rooms, error, reload };
}
