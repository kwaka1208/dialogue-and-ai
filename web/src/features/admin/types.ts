/** server/src/routes/admin.ts が返す形に対応する */
import type { Message, Participant, ReplyMode } from '../room/types.ts';

export interface AdminRoom {
  id: string;
  name: string;
  replyMode: ReplyMode;
  capacity: number;
  turnLimit: number;
  turnsUsed: number;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
  /** 合言葉そのものは返らない。設定されているかどうかだけ */
  hasPasscode: boolean;
  closed: boolean;
}

export interface RoomSummary extends AdminRoom {
  messageCount: number;
  /** いま画面を開いている人数 */
  onlineCount: number;
  url: string;
}

export interface AdminParticipant extends Participant {
  online: boolean;
}

export interface RoomDetail {
  room: AdminRoom;
  participants: AdminParticipant[];
  messageCount: number;
  attachmentCount: number;
  url: string;
}

export interface AdminSession {
  ok: true;
  aiConfigured: boolean;
  roomDefaults: {
    capacity: number;
    expiresInHours: number;
    turnLimit: number;
    replyMode: ReplyMode;
  };
  rateLimits: {
    aiTurnsPerMinute: number;
    messagesPerMinute: number;
  };
}

export interface CreateRoomInput {
  name: string;
  passcode?: string;
  replyMode?: ReplyMode;
  capacity?: number;
  turnLimit?: number;
  expiresInHours?: number;
}

export interface UpdateRoomInput {
  name?: string;
  replyMode?: ReplyMode;
  capacity?: number;
  turnLimit?: number;
}

/** 管理画面のログにだけ出る印。子どもの画面に流れる形には入っていない */
export interface AdminMessage extends Message {
  flagged: boolean;
}

export type { Message };
