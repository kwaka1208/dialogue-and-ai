import { apiFetch } from '../../lib/api.ts';
import type { AiStatus, Message, Participant, PresenceEntry, ReplyMode, RoomInfo } from './types.ts';

export function roomInfo(roomId: string): Promise<RoomInfo> {
  return apiFetch<RoomInfo>(`/api/rooms/${roomId}`);
}

export function whoAmI(roomId: string): Promise<{ participant: Participant; replyMode: ReplyMode }> {
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

export function sendMessage(
  roomId: string,
  input: { body: string; askAi: boolean },
): Promise<{ message: Message; ai: AiStatus }> {
  return apiFetch(`/api/rooms/${roomId}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** 生成中のAIの応答を打ち切る */
export function stopAi(roomId: string): Promise<{ stopped: boolean }> {
  return apiFetch(`/api/rooms/${roomId}/stop`, { method: 'POST' });
}

export function leave(roomId: string): Promise<{ ok: true }> {
  return apiFetch(`/api/rooms/${roomId}/leave`, { method: 'POST' });
}
