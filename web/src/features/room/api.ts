import { apiFetch } from '../../lib/api.ts';
import type {
  AiStatus,
  Attachment,
  Message,
  Participant,
  AiMode,
  PresenceEntry,
  ReplyMode,
  RoomInfo,
} from './types.ts';

/** トップページのコード入力。部屋のIDを引くだけで、入室はまだしない */
export function lookupRoom(code: string): Promise<{ roomId: string; name: string; url: string }> {
  return apiFetch('/api/rooms/lookup', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function roomInfo(roomId: string): Promise<RoomInfo> {
  return apiFetch<RoomInfo>(`/api/rooms/${roomId}`);
}

export function whoAmI(
  roomId: string,
): Promise<{ participant: Participant; aiMode: AiMode; replyMode: ReplyMode }> {
  return apiFetch(`/api/rooms/${roomId}/me`);
}

export function join(
  roomId: string,
  input: { displayName: string; passcode?: string },
): Promise<{ participant: Participant }> {
  return apiFetch(`/api/rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function history(
  roomId: string,
): Promise<{ messages: Message[]; participants: PresenceEntry[] }> {
  return apiFetch(`/api/rooms/${roomId}/messages`);
}

/** 意見モードの部屋で、ここまでのやり取りについてAIに意見を言ってもらう。発言は伴わない */
export function askOpinion(roomId: string): Promise<{ ai: AiStatus }> {
  return apiFetch(`/api/rooms/${roomId}/ai-opinion`, { method: 'POST' });
}

export function sendMessage(
  roomId: string,
  input: { body: string; askAi: boolean; attachmentIds: string[] },
): Promise<{ message: Message; ai: AiStatus }> {
  return apiFetch(`/api/rooms/${roomId}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * 発言より先にファイルを送っておく。
 * 返ってきた id を、送信時に attachmentIds として渡す。
 */
export function uploadAttachment(roomId: string, file: File): Promise<{ attachment: Attachment }> {
  const form = new FormData();
  form.append('file', file);
  // Content-Type は境界込みでブラウザに決めさせる
  return apiFetch(`/api/rooms/${roomId}/attachments`, { method: 'POST', body: form });
}

/** 送る前に添付を取り消す */
export function discardAttachment(roomId: string, attachmentId: string): Promise<{ ok: true }> {
  return apiFetch(`/api/rooms/${roomId}/attachments/${attachmentId}`, { method: 'DELETE' });
}

/** 添付の中身のURL。img の src とダウンロードリンクの両方に使う */
export function attachmentUrl(roomId: string, attachmentId: string): string {
  return `/api/rooms/${roomId}/attachments/${attachmentId}`;
}

/** 生成中のAIの応答を打ち切る */
export function stopAi(roomId: string): Promise<{ stopped: boolean }> {
  return apiFetch(`/api/rooms/${roomId}/stop`, { method: 'POST' });
}

export function leave(roomId: string): Promise<{ ok: true }> {
  return apiFetch(`/api/rooms/${roomId}/leave`, { method: 'POST' });
}
