/**
 * さくらのAI Engine との疎通確認スクリプト。
 * ハンドオフ 11章の検証項目 1〜4 をここで潰す。
 *
 *   npm run check:ai -w server              # 全部まとめて
 *   npm run check:ai -w server -- models    # 使えるモデルの一覧だけ
 *   npm run check:ai -w server -- stream    # ストリーミングの確認だけ
 *   npm run check:ai -w server -- names     # 「なまえ: 本文」形式の理解
 *   npm run check:ai -w server -- image     # 画像入力に対応しているか
 */
import { config } from '../src/config.js';

const KIDS_SYSTEM_PROMPT = `あなたは子どもたちの集まるチャットの部屋にいる、AIの仲間です。
- 小学生にもわかる言葉で、短めに話します
- この部屋には複数の子どもがいます。発言は「なまえ: 本文」の形で届きます
- 返事をするときは、誰に向けた返事かわかるように名前を呼びます
- 答えをすぐ全部言わず、まず一緒に考えるヒントを出します
- 個人情報（住所・学校名・電話番号）を聞かれても答えず、聞き出そうともしません
- こわい話、暴力的な話、大人向けの話題にはのりません`;

// 1x1 の透明PNG。画像入力を受け付けるかどうかだけを見る
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function requireToken(): string {
  if (!config.ai.token) {
    console.error('SAKURA_AI_TOKEN が未設定です。.env に設定してから実行してください。');
    process.exit(1);
  }
  return config.ai.token;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${config.ai.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(config.ai.timeoutMs),
  });
}

async function listModels(): Promise<string[]> {
  console.log('\n=== 1. モデル一覧 ===');
  const res = await api('/models');
  if (!res.ok) {
    console.error(`失敗: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const ids = (json.data ?? []).map((m) => m.id);
  for (const id of ids) console.log(`  - ${id}`);
  return ids;
}

function resolveModel(fallback?: string): string {
  const model = config.ai.model ?? fallback;
  if (!model) {
    console.error('SAKURA_AI_MODEL が未設定で、モデル一覧も取れませんでした。');
    process.exit(1);
  }
  return model;
}

/** SSE形式のレスポンスを読み、delta.content をつないで返す */
async function streamChat(model: string, messages: unknown[]): Promise<string> {
  const started = Date.now();
  const res = await api('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model, stream: true, messages }),
  });

  if (!res.ok || !res.body) {
    console.error(`失敗: ${res.status} ${await res.text()}`);
    return '';
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let full = '';
  let firstChunkAt: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE は空行でイベントが区切られる
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            firstChunkAt ??= Date.now();
            full += delta;
            process.stdout.write(delta);
          }
        } catch {
          console.warn(`\n[パースできないチャンク] ${data.slice(0, 120)}`);
        }
      }
    }
  }

  const ttfb = firstChunkAt ? firstChunkAt - started : null;
  console.log(
    `\n  --- 最初のチャンクまで ${ttfb ?? '-'}ms / 全体 ${Date.now() - started}ms / ${full.length}文字`,
  );
  return full;
}

async function checkStream(model: string): Promise<void> {
  console.log(`\n=== 2. ストリーミングと日本語の質 (${model}) ===`);
  await streamChat(model, [
    { role: 'system', content: KIDS_SYSTEM_PROMPT },
    { role: 'user', content: 'たろう: なんで空は青いの？' },
  ]);
}

async function checkNamedHistory(model: string): Promise<void> {
  console.log(`\n=== 3. 「なまえ: 本文」形式の理解 (${model}) ===`);
  console.log('（はなこ に向けて返事をすれば合格）');
  await streamChat(model, [
    { role: 'system', content: KIDS_SYSTEM_PROMPT },
    { role: 'user', content: 'たろう: きょうの給食なんだった？' },
    { role: 'user', content: 'はなこ: プログラムがうごかないんだけど、どうしたらいい？' },
    { role: 'user', content: 'じろう: ぼくはサッカーしてた' },
    { role: 'user', content: 'はなこ: @AI さっきの質問おしえて' },
  ]);
}

async function checkImageInput(model: string): Promise<void> {
  console.log(`\n=== 4. 画像入力の可否 (${model}) ===`);
  const res = await api('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'この画像には何が写っていますか？' },
            { type: 'image_url', image_url: { url: TINY_PNG } },
          ],
        },
      ],
    }),
  });

  if (res.ok) {
    console.log('  受け付けられました → 画像入力に対応している可能性が高い');
    console.log(`  ${JSON.stringify(await res.json()).slice(0, 400)}`);
  } else {
    console.log(`  拒否されました (${res.status}) → 画像はファイル名のみ伝える方式にする`);
    console.log(`  ${(await res.text()).slice(0, 400)}`);
  }
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? 'all';
  console.log(`base URL: ${config.ai.baseUrl}`);

  const models = target === 'all' || target === 'models' ? await listModels() : [];
  if (target === 'models') return;

  const model = resolveModel(models[0]);

  if (target === 'all' || target === 'stream') await checkStream(model);
  if (target === 'all' || target === 'names') await checkNamedHistory(model);
  if (target === 'all' || target === 'image') await checkImageInput(model);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
