/** server/src/types.ts と対応する。片方を変えたらもう片方も直すこと */

export type ReplyMode = 'mention' | 'always';
export type MessageKind = 'user' | 'ai' | 'system';

export interface Message {
  id: string;
  roomId: string;
  kind: MessageKind;
  participantId: string | null;
  displayName: string | null;
  body: string;
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface PresenceEntry {
  id: string;
  displayName: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  requiresPasscode: boolean;
  replyMode: ReplyMode;
  closed: boolean;
  expiresAt: string;
}

export type ServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'presence'; participants: PresenceEntry[] }
  | { type: 'ai_start'; messageId: string }
  | { type: 'ai_delta'; messageId: string; delta: string }
  | { type: 'ai_end'; messageId: string; body: string }
  | { type: 'ai_error'; messageId: string; reason: string }
  | { type: 'room_closed' }
  | { type: 'ping' };

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
