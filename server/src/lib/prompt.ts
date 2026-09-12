/**
 * AI Engine に送るリクエストの組み立て。
 * ハンドオフ 3章（部屋でのAIの振る舞い）と 7.4（system prompt の骨子）に対応する。
 */
import type { Message } from '../types.js';
import type { ChatMessage } from './ai-client.js';

export const KIDS_SYSTEM_PROMPT = `あなたは子どもたちの集まるチャットの部屋にいる、AIの仲間です。
- 小学生にもわかる言葉で、短めに話します
- この部屋には複数の子どもがいます。発言は「なまえ: 本文」の形で届きます
- 返事をするときは、誰に向けた返事かわかるように名前を呼びます
- 答えをすぐ全部言わず、まず一緒に考えるヒントを出します
- 個人情報（住所・学校名・電話番号）を聞かれても答えず、聞き出そうともしません
- こわい話、暴力的な話、大人向けの話題にはのりません`;

/** 直近このぶんだけ送る。これを超えたぶんは捨てる（要約はフェーズ4の範囲外） */
export const AI_HISTORY_LIMIT = 60;

/** 「@AI」などで始まる呼びかけ。全角の＠と、ひらがな・カタカナ表記も拾う */
const MENTION = /^[\s　]*[@＠]\s*(ai|えーあい|エーアイ)/i;

export function mentionsAi(body: string): boolean {
  return MENTION.test(body);
}

/**
 * 部屋の履歴を OpenAI 互換の messages に変換する。
 * 発言者名は本文の先頭に埋める。`name` フィールドはモデルによって扱いが違うため。
 */
export function buildChatMessages(history: Message[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: KIDS_SYSTEM_PROMPT }];

  for (const message of history) {
    // 入退室のお知らせはトークンの無駄なので送らない
    if (message.kind === 'system') continue;
    // 生成中で本文がまだ空のものは飛ばす
    if (message.body.trim() === '') continue;

    if (message.kind === 'ai') {
      messages.push({ role: 'assistant', content: message.body });
    } else {
      messages.push({
        role: 'user',
        content: `${message.displayName ?? 'だれか'}: ${message.body}`,
      });
    }
  }

  return messages;
}
