export type ReplyMode = 'mention' | 'always';
export type MessageKind = 'user' | 'ai' | 'system';
/** 添付の扱いの分かれ目。画面の見せ方とAIへの渡し方がこれで決まる */
export type AttachmentKind = 'image' | 'text' | 'pdf' | 'other';

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

/** 画面に出す添付の情報。保存先や抽出したテキストは外に出さない */
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
  /** kind='user' のときの発言者名。表示用に join して埋める */
  displayName: string | null;
  body: string;
  attachments: Attachment[];
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
