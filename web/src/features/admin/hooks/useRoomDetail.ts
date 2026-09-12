import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import type { Message, RoomDetail } from '../types.ts';

/**
 * 選択中の部屋の詳細とログ。
 * 在室状況が変わるので、開いているあいだは定期的に取り直す。
 */
const RELOAD_INTERVAL_MS = 10_000;

export function useRoomDetail(
  token: string,
  roomId: string,
): {
  detail: RoomDetail | null;
  messages: Message[];
  error: string | null;
  reload: () => Promise<void>;
} {
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [next, log] = await Promise.all([
        api.roomDetail(token, roomId),
        api.roomMessages(token, roomId),
      ]);
      setDetail(next);
      setMessages(log.messages);
      setError(null);
    } catch {
      setError('部屋の情報を読み込めませんでした');
    }
  }, [token, roomId]);

  useEffect(() => {
    // 部屋を切り替えたら、前の部屋の内容を残さない
    setDetail(null);
    setMessages([]);

    void reload();
    const timer = setInterval(() => void reload(), RELOAD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return { detail, messages, error, reload };
}
