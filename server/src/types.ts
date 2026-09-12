export type ReplyMode = 'mention' | 'always';
export type MessageKind = 'user' | 'ai' | 'system';

export interface Room {
  id: string;
  name: string;
  passcodeHash: string | null;
  replyMode: ReplyMode;
  capacity: number;
  turnLimit: number;
  turnsUsed: number;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface Message {
  id: string;
  roomId: string;
  kind: MessageKind;
  participantId: string | null;
  /** kind='user' のときの発言者名。表示用に join して埋める */
  displayName: string | null;
  body: string;
  createdAt: string;
}

/**
 * SSE で配信するイベント。
 * web/src/features/room/types.ts と同じ形を保つこと。
 */
export type ServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'presence'; participants: Array<{ id: string; displayName: string }> }
  | { type: 'ai_start'; messageId: string }
  | { type: 'ai_delta'; messageId: string; delta: string }
  | { type: 'ai_end'; messageId: string; body: string }
  | { type: 'ai_error'; messageId: string; reason: string }
  | { type: 'room_closed' }
  | { type: 'ping' };
