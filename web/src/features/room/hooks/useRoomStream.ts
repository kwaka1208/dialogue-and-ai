import { useEffect, useReducer } from 'react';
import * as api from '../api.ts';
import type { ConnectionStatus, Message, PresenceEntry, ServerEvent } from '../types.ts';

interface StreamState {
  messages: Message[];
  participants: PresenceEntry[];
  status: ConnectionStatus;
  loadError: string | null;
  /** 部屋が管理画面から閉じられた */
  roomClosed: boolean;
}

type Action =
  | { type: 'history'; messages: Message[]; participants: PresenceEntry[] }
  | { type: 'load_error'; reason: string }
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'server'; event: ServerEvent };

const initialState: StreamState = {
  messages: [],
  participants: [],
  status: 'connecting',
  loadError: null,
  roomClosed: false,
};

/** SSEは再送されうるので、同じidのメッセージを二重に積まない */
function appendMessage(messages: Message[], message: Message): Message[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message];
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case 'history':
      return {
        ...state,
        messages: action.messages,
        participants: action.participants,
        loadError: null,
      };

    case 'load_error':
      return { ...state, loadError: action.reason };

    case 'status':
      return { ...state, status: action.status };

    case 'server':
      switch (action.event.type) {
        case 'message':
          return { ...state, messages: appendMessage(state.messages, action.event.message) };
        case 'presence':
          return { ...state, participants: action.event.participants };
        case 'room_closed':
          return { ...state, roomClosed: true };
        // ai_* はフェーズ4で扱う
        default:
          return state;
      }
  }
}

const SSE_EVENTS: Array<ServerEvent['type']> = [
  'message',
  'presence',
  'ai_start',
  'ai_delta',
  'ai_end',
  'ai_error',
  'room_closed',
];

/**
 * 部屋のタイムラインを購読する。
 * 初期履歴をHTTPで一度取り、そのあとの更新はSSEで受ける。
 */
export function useRoomStream(roomId: string): StreamState {
  const [state, dispatch] = useReducer(reducer, initialState);

  // 初期履歴の取得
  useEffect(() => {
    let cancelled = false;

    api
      .history(roomId)
      .then((data) => {
        if (cancelled) return;
        dispatch({ type: 'history', messages: data.messages, participants: data.participants });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        dispatch({ type: 'load_error', reason: error instanceof Error ? error.message : 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // SSEの購読。EventSource は同一オリジンなら cookie を送ってくれる
  useEffect(() => {
    const source = new EventSource(`/api/rooms/${roomId}/stream`);

    const handle = (event: MessageEvent<string>): void => {
      try {
        dispatch({ type: 'server', event: JSON.parse(event.data) as ServerEvent });
      } catch {
        // 壊れたチャンクは捨てる。次のイベントで追いつく
      }
    };

    for (const name of SSE_EVENTS) source.addEventListener(name, handle);
    source.onopen = () => dispatch({ type: 'status', status: 'open' });
    // EventSource は自前で再接続する。落ちた表示だけ出しておく
    source.onerror = () => dispatch({ type: 'status', status: 'reconnecting' });

    return () => {
      for (const name of SSE_EVENTS) source.removeEventListener(name, handle);
      source.close();
    };
  }, [roomId]);

  return state;
}
