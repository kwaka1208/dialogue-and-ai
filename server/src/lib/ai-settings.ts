/**
 * 「この部屋のこのモードで、どの system prompt とどのモデルを使うか」の解決。
 *
 * 決め方は3段。部屋ごとの設定 → .env → prompt.ts の既定。
 * 部屋の列 (chat_system_prompt など) はどれも NULL 可で、NULL は「既定のまま」を意味する。
 * 解決をここ1か所に閉じておかないと、生成のときと画面に出すときで食い違う。
 */
import { config } from '../config.js';
import { systemPromptFor } from './prompt.js';
import type { AiMode, Room } from '../types.js';

export interface AiSettings {
  systemPrompt: string;
  /** モデルが1つも決まらないこともある (.env 未設定で部屋にも指定なし) */
  model: string | undefined;
  /** 部屋で上書きされているか。管理画面の表示に使う */
  systemPromptOverridden: boolean;
  modelOverridden: boolean;
}

/** .env が決めるモデル。意見モードだけ別に指定できる */
export function defaultModelFor(mode: AiMode): string | undefined {
  return mode === 'opinion' ? config.ai.opinionModel : config.ai.model;
}

export function resolveAiSettings(room: Room, mode: AiMode): AiSettings {
  const prompt = mode === 'opinion' ? room.opinionSystemPrompt : room.chatSystemPrompt;
  const model = mode === 'opinion' ? room.opinionModel : room.chatModel;

  return {
    systemPrompt: prompt ?? systemPromptFor(mode),
    model: model ?? defaultModelFor(mode),
    systemPromptOverridden: prompt !== null,
    modelOverridden: model !== null,
  };
}

/**
 * この部屋でAIを動かせるか。
 * トークンはプロセス共通だが、モデルは部屋で指定できるので .env が空でも動くことがある。
 */
export function isAiAvailableFor(room: Room, mode: AiMode = room.aiMode): boolean {
  return Boolean(config.ai.token && resolveAiSettings(room, mode).model);
}
