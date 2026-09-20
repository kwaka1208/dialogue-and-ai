/** server/src/routes/admin.ts が返す形に対応する */
import type { AiMode, Message, Participant, ReplyMode } from '../room/types.ts';

/** モードごとの、部屋で上書きしなかったときの中身。/session が返す */
export interface AiModeDefaults {
  systemPrompt: string;
  /** .env で決まっているモデル。未設定なら null */
  model: string | null;
}

export interface AiDefaults {
  chat: AiModeDefaults;
  opinion: AiModeDefaults;
}

export interface AdminRoom {
  id: string;
  /** 子どもがトップページで入れる6桁の数字 */
  code: string;
  name: string;
  aiMode: AiMode;
  replyMode: ReplyMode;
  /** モードごとの system prompt とモデル。null なら既定を使う */
  chatSystemPrompt: string | null;
  opinionSystemPrompt: string | null;
  chatModel: string | null;
  opinionModel: string | null;
  capacity: number;
  turnLimit: number;
  turnsUsed: number;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
  /** 合言葉そのものは返らない。設定されているかどうかだけ */
  hasPasscode: boolean;
  closed: boolean;
  /** 作った管理者のアカウントID。null は所有者不明の古い部屋 */
  createdBy: string | null;
  /** 作った管理者のメールアドレス。特権管理者が一覧で見分けるための表示用 */
  ownerEmail: string | null;
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

/** ログイン画面が最初に受け取る設定。ここだけは未ログインでも叩ける */
export interface AuthConfig {
  googleClientId: string | null;
  configured: boolean;
}

/** 管理画面にログインできるアカウント */
export interface AdminAccount {
  id: string;
  email: string;
  name: string | null;
  /** 登録した特権管理者のアカウントID。自動登録は null */
  createdBy: string | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  /** .env の SUPER_ADMIN_EMAILS に載っているか */
  isSuper: boolean;
}

export interface CreateAccountInput {
  email: string;
  name?: string;
}

export interface AdminSession {
  ok: true;
  account: AdminAccount;
  /** すべての部屋を管理でき、アカウントの登録もできる */
  isSuper: boolean;
  aiConfigured: boolean;
  /** 部屋で上書きしなかったときに使われる system prompt とモデル */
  aiDefaults: AiDefaults;
  roomDefaults: {
    capacity: number;
    expiresInHours: number;
    turnLimit: number;
    aiMode: AiMode;
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
  aiMode?: AiMode;
  replyMode?: ReplyMode;
  /** 空文字または null を送ると既定のまま */
  chatSystemPrompt?: string | null;
  opinionSystemPrompt?: string | null;
  chatModel?: string | null;
  opinionModel?: string | null;
  capacity?: number;
  turnLimit?: number;
  expiresInHours?: number;
}

export interface UpdateRoomInput {
  name?: string;
  aiMode?: AiMode;
  replyMode?: ReplyMode;
  /** 空文字または null を送ると既定に戻る */
  chatSystemPrompt?: string | null;
  opinionSystemPrompt?: string | null;
  chatModel?: string | null;
  opinionModel?: string | null;
  capacity?: number;
  turnLimit?: number;
}

/** 管理画面のログにだけ出る印。子どもの画面に流れる形には入っていない */
export interface AdminMessage extends Message {
  flagged: boolean;
}

export type { Message };
