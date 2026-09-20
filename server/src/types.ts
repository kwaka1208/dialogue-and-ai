/**
 * 部屋でのAIの立ち位置。部屋を作るときに選び、途中でも管理画面から変えられる。
 * - chat    : 会話の相手になる。呼ばれたら (または毎回) 返事をする
 * - opinion : 会話には入らず、頼まれたときだけ、そこまでのやり取りに意見を言う
 */
export type AiMode = 'chat' | 'opinion';
/** 会話モードでAIが口を開くきっかけ。意見モードでは使わない */
export type ReplyMode = 'mention' | 'always';
export type MessageKind = 'user' | 'ai' | 'system';
/** 添付の扱いの分かれ目。画面の見せ方とAIへの渡し方がこれで決まる */
export type AttachmentKind = 'image' | 'text' | 'pdf' | 'other';

/**
 * 管理画面にログインできるアカウント。
 * 特権かどうかはここには入れない (.env の SUPER_ADMIN_EMAILS が唯一の情報源)
 */
export interface AdminAccount {
  id: string;
  email: string;
  name: string | null;
  /** 登録した特権管理者のアカウントID。自動登録は null */
  createdBy: string | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** 認証を通ったあとの、権限つきのアカウント */
export interface AdminIdentity {
  account: AdminAccount;
  isSuper: boolean;
}

export interface Room {
  id: string;
  /** トップページで入れる6桁の数字 */
  code: string;
  name: string;
  passcodeHash: string | null;
  aiMode: AiMode;
  replyMode: ReplyMode;
  /** 会話モードの system prompt。null なら既定 (KIDS_SYSTEM_PROMPT) を使う */
  chatSystemPrompt: string | null;
  /** 意見モードの system prompt。null なら既定 (OPINION_SYSTEM_PROMPT) を使う */
  opinionSystemPrompt: string | null;
  /** 会話モードで使うモデルID。null なら .env の SAKURA_AI_MODEL */
  chatModel: string | null;
  /** 意見モードで使うモデルID。null なら .env の SAKURA_AI_MODEL_OPINION */
  opinionModel: string | null;
  capacity: number;
  turnLimit: number;
  turnsUsed: number;
  expiresAt: string;
  deletedAt: string | null;
  /** 作った管理者のアカウントID。null は所有者不明の古い部屋 */
  createdBy: string | null;
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
  /** 管理画面から強制退出させた時刻。入っていると部屋に戻れない */
  kickedAt: string | null;
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
  /** NGワードの疑いがあると判定された発言。管理画面にだけ出す */
  flagged: boolean;
  createdAt: string;
}

/**
 * 子どもの画面に流す形。どの発言に印が付いたかは見せない。
 * 見えると印を付けさせる遊びが始まるので、`flagged` はここで落とす。
 */
export type RoomMessage = Omit<Message, 'flagged'>;

/**
 * SSE で配信するイベント。
 * web/src/features/room/types.ts と同じ形を保つこと。
 */
export type ServerEvent =
  | { type: 'message'; message: RoomMessage }
  | { type: 'presence'; participants: Array<{ id: string; displayName: string }> }
  | { type: 'ai_start'; messageId: string }
  | { type: 'ai_delta'; messageId: string; delta: string }
  | { type: 'ai_end'; messageId: string; body: string }
  | { type: 'ai_error'; messageId: string; reason: string }
  | { type: 'room_closed' }
  | { type: 'kicked'; participantId: string }
  | { type: 'ping' };
