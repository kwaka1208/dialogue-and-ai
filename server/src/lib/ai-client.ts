/**
 * さくらのAI Engine (OpenAI互換 Chat Completions) のクライアント。
 * APIキーはこのプロセスだけが持つ。ブラウザには絶対に出さない。
 */
import { config } from '../config.js';

/**
 * 画像を渡すときは content を配列にする (OpenAI 互換の multimodal 形式)。
 * 添付のない発言は今までどおり文字列のまま送る。
 */
export type ChatContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContent[];
}

export class AiEngineError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiEngineError';
    this.status = status;
  }
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * 使えるモデルの一覧。管理画面のプルダウンがこれを引く。
 *
 * 部屋を作るたびに AI Engine を叩く必要はないので、少しのあいだ覚えておく。
 * 一覧が増えるのはモデルが追加されたときだけで、数分の遅れは実害がない。
 */
const MODEL_CACHE_MS = 5 * 60_000;
let modelCache: { ids: string[]; fetchedAt: number } | null = null;

/**
 * チャットに使えないモデルを選択肢から落とす。
 *
 * /models は埋め込みや音声認識のモデルも一緒に返すが、レスポンスに種別が付かないので
 * (id / object / owned_by / created だけ) 名前で見分けるしかない。
 * 新しい名前のものは漏れるので、絞りすぎずに明らかなものだけを外す。
 */
const NOT_FOR_CHAT = /whisper|embedding|(^|[/-])e5([-.]|$)/i;

export async function listModels(): Promise<string[]> {
  const { token, baseUrl, timeoutMs } = config.ai;
  if (!token) throw new AiEngineError('SAKURA_AI_TOKEN が未設定です');

  const cached = modelCache;
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_MS) return cached.ids;

  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AiEngineError(
      `AI Engine が ${res.status} を返しました: ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const json = (await res.json()) as { data?: Array<{ id?: unknown }> };
  const ids = (json.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === 'string' && id !== '')
    .filter((id) => !NOT_FOR_CHAT.test(id))
    .sort((a, b) => a.localeCompare(b));

  modelCache = { ids, fetchedAt: Date.now() };
  return ids;
}

/**
 * ストリーミングで応答を受け取り、本文の差分を順に返す。
 * signal で中断でき、それとは別に config.ai.timeoutMs で打ち切る。
 *
 * modelOverride は、部屋のモードごとにモデルを変えるためのもの (意見モードなど)。
 * 省略すれば SAKURA_AI_MODEL を使う。
 */
export async function* streamChatCompletion(
  messages: ChatMessage[],
  signal?: AbortSignal,
  modelOverride?: string,
): AsyncGenerator<string> {
  const { token, baseUrl, timeoutMs } = config.ai;
  const model = modelOverride ?? config.ai.model;
  if (!token || !model) {
    throw new AiEngineError('SAKURA_AI_TOKEN / SAKURA_AI_MODEL が未設定です');
  }

  const signals = signal
    ? [signal, AbortSignal.timeout(timeoutMs)]
    : [AbortSignal.timeout(timeoutMs)];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, stream: true, messages }),
    signal: AbortSignal.any(signals),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new AiEngineError(
      `AI Engine が ${res.status} を返しました: ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE は空行でイベントが区切られる。途中で切れた最後の塊は次の読み込みに持ち越す
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '' || data === '[DONE]') continue;

          let parsed: StreamChunk;
          try {
            parsed = JSON.parse(data) as StreamChunk;
          } catch {
            continue; // 壊れたチャンクは捨てて次を待つ
          }

          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
