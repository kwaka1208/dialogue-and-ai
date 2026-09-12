import { apiFetch } from '../../lib/api.ts';
import type {
  AdminRoom,
  AdminSession,
  CreateRoomInput,
  Message,
  RoomDetail,
  RoomSummary,
  UpdateRoomInput,
} from './types.ts';

/** 管理トークンは cookie ではなくヘッダーで送る。子ども用の部屋とは別系統にするため */
function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/api/admin${path}`, {
    ...init,
    headers: { ...authHeader(token), ...init?.headers },
  });
}

/** トークンが通るかの確認。既定値もここで受け取って作成フォームに使う */
export function session(token: string): Promise<AdminSession> {
  return adminFetch(token, '/session');
}

export function listRooms(token: string): Promise<{ rooms: RoomSummary[] }> {
  return adminFetch(token, '/rooms');
}

export function createRoom(
  token: string,
  input: CreateRoomInput,
): Promise<{ room: AdminRoom; url: string }> {
  return adminFetch(token, '/rooms', { method: 'POST', body: JSON.stringify(input) });
}

export function roomDetail(token: string, roomId: string): Promise<RoomDetail> {
  return adminFetch(token, `/rooms/${roomId}`);
}

export function roomMessages(
  token: string,
  roomId: string,
): Promise<{ messages: Message[]; limit: number }> {
  return adminFetch(token, `/rooms/${roomId}/messages`);
}

export function updateRoom(
  token: string,
  roomId: string,
  input: UpdateRoomInput,
): Promise<{ room: AdminRoom }> {
  return adminFetch(token, `/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function extendRoom(
  token: string,
  roomId: string,
  hours: number,
): Promise<{ room: AdminRoom }> {
  return adminFetch(token, `/rooms/${roomId}/extend`, {
    method: 'POST',
    body: JSON.stringify({ hours }),
  });
}

export function kickParticipant(
  token: string,
  roomId: string,
  participantId: string,
): Promise<unknown> {
  return adminFetch(token, `/rooms/${roomId}/participants/${participantId}/kick`, {
    method: 'POST',
  });
}

export function deleteRoom(
  token: string,
  roomId: string,
): Promise<{ ok: true; removedAttachments: number }> {
  return adminFetch(token, `/rooms/${roomId}`, { method: 'DELETE' });
}

/**
 * ログのJSONを保存させる。
 * Authorization ヘッダーが必要なので、リンクではなく fetch で取ってから保存する。
 */
export async function downloadExport(token: string, roomId: string): Promise<void> {
  const res = await fetch(`/api/admin/rooms/${roomId}/export`, { headers: authHeader(token) });
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
