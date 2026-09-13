/** server/src/types.ts と対応する。片方を変えたらもう片方も直すこと */

export type MessageKind = 'user' | 'ai' | 'system';
export type AttachmentKind = 'image' | 'text' | 'pdf' | 'other';

export interface Attachment {
  id: string;
  messageId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
}

export interface Message {
  id: string;
  roomId: string;
  kind: MessageKind;
  participantId: string | null;
  displayName: string | null;
  body: string;
  attachments: Attachment[];
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
  /** 管理画面から強制退出させられた時刻 */
  kickedAt: string | null;
}

export interface PresenceEntry {
  id: string;
  displayName: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  requiresPasscode: boolean;
  /** サーバーに AI Engine の設定があるか。無ければ子ども同士のチャットだけ動く */
  aiAvailable: boolean;
  closed: boolean;
  expiresAt: string;
}

/** 「AIに いけんを きく」を押したときに、それがどう扱われたか */
export type AiStatus =
  | 'started'
  | 'busy'
  | 'unavailable'
  | 'turn_limit'
  | 'rate_limited'
  /** 前回の意見より後に、NGワードの候補に当たった発言がある */
  | 'filtered'
  /** まだ誰も発言していない。意見の材料が無い */
  | 'no_messages';

export type ServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'presence'; participants: PresenceEntry[] }
  | { type: 'ai_start'; messageId: string }
  | { type: 'ai_delta'; messageId: string; delta: string }
  | { type: 'ai_end'; messageId: string; body: string }
  | { type: 'ai_error'; messageId: string; reason: string }
  | { type: 'room_closed' }
  | { type: 'kicked'; participantId: string }
  | { type: 'ping' };

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
