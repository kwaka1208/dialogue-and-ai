import { apiFetch } from '../../lib/api.ts';
import type {
  AdminAccount,
  AdminRoom,
  AdminSession,
  AuthConfig,
  CreateAccountInput,
  CreateRoomInput,
  AdminMessage,
  RoomDetail,
  RoomSummary,
  UpdateRoomInput,
} from './types.ts';

/**
 * 管理セッションは HttpOnly cookie で持つので、ここでトークンを扱う必要はない。
 * cookie は同一オリジンのリクエストに自動で載る。
 */
function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/api/admin${path}`, init);
}

/** ログイン画面用。GoogleのクライアントIDはサーバーから受け取る */
export function authConfig(): Promise<AuthConfig> {
  return apiFetch('/api/admin-auth/config');
}

/** Googleのログインボタンが返す ID トークンを渡して、セッションを張る */
export function signInWithGoogle(
  credential: string,
): Promise<{ account: AdminAccount; isSuper: boolean }> {
  return apiFetch('/api/admin-auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function signOut(): Promise<{ ok: true }> {
  return apiFetch('/api/admin-auth/logout', { method: 'POST' });
}

/** ログイン状態と権限の確認。管理画面が起動時とリロード時に叩く */
export function session(): Promise<AdminSession> {
  return adminFetch('/session');
}

/**
 * 部屋に指定できるモデルの一覧。
 * AI Engine から取れなかったときは models が空で、error に理由が入る。
 */
export function listModels(): Promise<{ models: string[]; error?: string }> {
  return adminFetch('/models');
}

export function listRooms(): Promise<{ rooms: RoomSummary[] }> {
  return adminFetch('/rooms');
}

export function createRoom(input: CreateRoomInput): Promise<{ room: AdminRoom; url: string }> {
  return adminFetch('/rooms', { method: 'POST', body: JSON.stringify(input) });
}

export function roomDetail(roomId: string): Promise<RoomDetail> {
  return adminFetch(`/rooms/${roomId}`);
}

export function roomMessages(
  roomId: string,
): Promise<{ messages: AdminMessage[]; limit: number }> {
  return adminFetch(`/rooms/${roomId}/messages`);
}

export function updateRoom(roomId: string, input: UpdateRoomInput): Promise<{ room: AdminRoom }> {
  return adminFetch(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function extendRoom(roomId: string, hours: number): Promise<{ room: AdminRoom }> {
  return adminFetch(`/rooms/${roomId}/extend`, {
    method: 'POST',
    body: JSON.stringify({ hours }),
  });
}

export function kickParticipant(roomId: string, participantId: string): Promise<unknown> {
  return adminFetch(`/rooms/${roomId}/participants/${participantId}/kick`, { method: 'POST' });
}

export function deleteRoom(roomId: string): Promise<{ ok: true; removedAttachments: number }> {
  return adminFetch(`/rooms/${roomId}`, { method: 'DELETE' });
}

/** 管理者アカウントの一覧。特権管理者だけが叩ける */
export function listAccounts(): Promise<{ accounts: AdminAccount[] }> {
  return adminFetch('/accounts');
}

export function createAccount(input: CreateAccountInput): Promise<{ account: AdminAccount }> {
  return adminFetch('/accounts', { method: 'POST', body: JSON.stringify(input) });
}

/** 一時的な締め出しと、その解除 */
export function setAccountDisabled(
  accountId: string,
  disabled: boolean,
): Promise<{ account: AdminAccount }> {
  return adminFetch(`/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled }),
  });
}

/** 消したあと、その人が作った部屋は所有者なしとして残る */
export function deleteAccount(
  accountId: string,
): Promise<{ ok: true; orphanedRooms: number }> {
  return adminFetch(`/accounts/${accountId}`, { method: 'DELETE' });
}

/**
 * ログのJSONを保存させる。
 * cookie は自動で載るが、Blob にしてから保存したいので fetch のまま扱う。
 */
export async function downloadExport(roomId: string): Promise<void> {
  const res = await fetch(`/api/admin/rooms/${roomId}/export`);
  if (!res.ok) throw new Error(`エクスポートに失敗しました (${res.status})`);

  const url = URL.createObjectURL(await res.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-${roomId}.json`;
    link.click();
  } finally {
    // click は同期なので、ここで開放しても保存は始まっている
    URL.revokeObjectURL(url);
  }
}
