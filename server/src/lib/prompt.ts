/**
 * AI Engine に送るリクエストの組み立て。
 * ハンドオフ 3章（部屋でのAIの振る舞い）と 7.4（system prompt の骨子）に対応する。
 */
import type { Message } from '../types.js';
import type { AttachmentPayload, AttachmentPayloads } from '../services/attachment-context.js';
import type { ChatContent, ChatMessage } from './ai-client.js';

export const KIDS_SYSTEM_PROMPT = `あなたは子どもたちの集まるチャットの部屋にいる、AIの仲間です。
- あなたは画面に「AI」と出ます。自分で別の名前を名乗りません
- 小学生にもわかる言葉で、2〜3文くらいの短さで話します
- 文は、ふつうのおしゃべりの言葉だけで書きます。** や # や - のような記号でかざりません
- この部屋には複数の子どもがいます。発言は「なまえ: 本文」の形で届きます
- 返事をするときは、誰に向けた返事かわかるように名前を呼びます
- 返事は、いちばん最後に話しかけてきた人ひとりに向けて書きます。ほかの子の発言にまとめて答えません
- あなたの返事の先頭に「なまえ:」は付けません。名前は画面に出るので、本文だけを書きます
- 聞かれたことには、まず答えます。答えを探している最中の子には、答えそのものではなくヒントを出します
- 聞きかえすのは、1回の返事にひとつまでです。毎回聞きかえす必要はありません
- 前の返事で言ったことを、もう一度言いません。言いかたを変えて同じことをくり返すのもしません
- 子どもが別の話をはじめたら、前の話に引きもどさず、新しい話にのります
- 個人情報（住所・学校名・電話番号）を聞かれても答えず、聞き出そうともしません
- こわい話、暴力的な話、大人向けの話題にはのりません
- ファイルや写真がついてくることがあります。中身が読めるものは「なかみ」として一緒に届きます
- 中身が届かないファイルは、名前だけを見て「どんなファイル？」と聞きかえします`;

/** 直近このぶんだけ送る。これを超えたぶんは捨てる（要約はフェーズ4の範囲外） */
export const AI_HISTORY_LIMIT = 60;

/** 「@AI」などで始まる呼びかけ。全角の＠と、ひらがな・カタカナ表記も拾う */
const MENTION = /^[\s　]*[@＠]\s*(ai|えーあい|エーアイ)/i;

export function mentionsAi(body: string): boolean {
  return MENTION.test(body);
}

/**
 * モデルは履歴の「なまえ: 本文」という形を真似て、自分の返事にも接頭辞を付けてくることがある
 * (Qwen3-VL はほぼ毎回付ける)。画面には発言者名が別に出るので、ここで落とす。
 *
 * 落とすのは履歴に出てくる発言者名と「AI」だけ。そうしないと「ヒント: 」のような
 * ふつうの本文まで削ってしまう。
 */
export function stripSpeakerPrefix(text: string, history: Message[]): string {
  const match = /^([^\n:：]{1,16})[:：][ 　]*/.exec(text);
  const name = match?.[1]?.trim();
  if (!match || !name) return text;

  const known =
    /^ai$/i.test(name) || history.some((message) => message.displayName?.trim() === name);

  return known ? text.slice(match[0].length) : text;
}

/**
 * 添付を本文に織り込む。中身が読めたものは「なかみ」として添え、
 * 読めないものはファイル名だけ伝える。
 */
function describeAttachments(payloads: AttachmentPayload[]): string {
  return payloads
    .map((payload) =>
      payload.text === null
        ? `\n[ファイル: ${payload.originalName}]`
        : `\n[ファイル: ${payload.originalName} の なかみ]\n${payload.text}`,
    )
    .join('');
}

/**
 * 部屋の履歴を OpenAI 互換の messages に変換する。
 * 発言者名は本文の先頭に埋める。`name` フィールドはモデルによって扱いが違うため。
 */
export function buildChatMessages(
  history: Message[],
  attachments: AttachmentPayloads = new Map(),
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: KIDS_SYSTEM_PROMPT }];

  for (const message of history) {
    // 入退室のお知らせはトークンの無駄なので送らない
    if (message.kind === 'system') continue;

    const payloads = attachments.get(message.id) ?? [];
    // 生成中で本文がまだ空のものは飛ばす。ただし添付だけの発言は送る
    if (message.body.trim() === '' && payloads.length === 0) continue;

    if (message.kind === 'ai') {
      messages.push({ role: 'assistant', content: message.body });
      continue;
    }

    const text = `${message.displayName ?? 'だれか'}: ${message.body}${describeAttachments(payloads)}`;
    const image = payloads.find((payload) => payload.imageDataUrl !== null)?.imageDataUrl;

    if (!image) {
      messages.push({ role: 'user', content: text });
      continue;
    }

    const content: ChatContent[] = [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: image } },
    ];
    messages.push({ role: 'user', content });
  }

  return messages;
}
