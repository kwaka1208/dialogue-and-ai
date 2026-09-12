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
  /** 生成中のAIの応答のid。無ければ null */
  streamingId: string | null;
  /** AIの応答が失敗した理由。次の呼びかけまで出しておく */
  aiError: string | null;
}

type Action =
  | { type: 'history'; messages: Message[]; participants: PresenceEntry[] }
  | { type: 'load_error'; reason: string }
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'server'; event: ServerEvent; roomId: string };

const initialState: StreamState = {
  messages: [],
  participants: [],
  status: 'connecting',
  loadError: null,
  roomClosed: false,
  streamingId: null,
  aiError: null,
};

/** SSEは再送されうるので、同じidのメッセージを二重に積まない */
function appendMessage(messages: Message[], message: Message): Message[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message];
}

/** AIの応答の本文を書き換える。無ければ何もしない */
function patchBody(messages: Message[], id: string, next: (body: string) => string): Message[] {
  return messages.map((m) => (m.id === id ? { ...m, body: next(m.body) } : m));
}

/** 生成が始まったときの、本文が空のAIメッセージ */
function aiPlaceholder(messageId: string, roomId: string): Message {
  return {
    id: messageId,
    roomId,
    kind: 'ai',
    participantId: null,
    displayName: null,
    body: '',
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case 'history': {
      // 履歴を取っているあいだにも生成は進む。書きかけの本文を上書きで消さない
      const streaming = state.streamingId
        ? state.messages.find((m) => m.id === state.streamingId)
        : undefined;

      let messages = action.messages;
      if (streaming) {
        messages = messages.some((m) => m.id === streaming.id)
          ? messages.map((m) => (m.id === streaming.id ? streaming : m))
          : [...messages, streaming];
      }

      return { ...state, messages, participants: action.participants, loadError: null };
    }

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

        case 'ai_start':
          return {
            ...state,
            // 途中から入った子には、この直後に それまでの本文が delta でまとめて届く
            messages: appendMessage(
              state.messages,
              aiPlaceholder(action.event.messageId, action.roomId),
            ),
            streamingId: action.event.messageId,
            aiError: null,
          };

        case 'ai_delta': {
          const { messageId, delta } = action.event;
          return {
            ...state,
            messages: patchBody(state.messages, messageId, (body) => body + delta),
          };
        }

        case 'ai_end': {
          const { messageId, body } = action.event;
          return {
            ...state,
            messages: patchBody(state.messages, messageId, () => body),
            streamingId: state.streamingId === messageId ? null : state.streamingId,
          };
        }

        case 'ai_error': {
          const { messageId, reason } = action.event;
          return {
            ...state,
            // 本文が確定しなかったので、書きかけの吹き出しごと消す
            messages: state.messages.filter((m) => m.id !== messageId),
            streamingId: state.streamingId === messageId ? null : state.streamingId,
            aiError: reason === 'stopped' ? null : reason,
          };
        }

        case 'room_closed':
          return { ...state, roomClosed: true };

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
        dispatch({ type: 'server', event: JSON.parse(event.data) as ServerEvent, roomId });
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
