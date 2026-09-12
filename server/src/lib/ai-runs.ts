/**
 * いま生成中のAI応答を、部屋ごとに1本だけ覚えておく置き場。
 *
 * 用途は3つ。
 * - 生成中に別の子が呼びかけたときに断る（部屋の会話がAIで埋まらないように）
 * - 「とめる」ボタンから中断する
 * - 生成の途中で入室した子に、それまでの本文を配る
 */
export interface AiRun {
  messageId: string;
  /** ここまでに届いた本文。追いつき配信に使う */
  body: string;
  controller: AbortController;
  /** 「とめる」で止められた場合に true */
  stopped: boolean;
}

const runs = new Map<string, AiRun>();

/** 生成を始める。すでに走っていれば null を返す（呼び出し側は断る） */
export function startRun(roomId: string, messageId: string): AiRun | null {
  if (runs.has(roomId)) return null;
  const run: AiRun = { messageId, body: '', controller: new AbortController(), stopped: false };
  runs.set(roomId, run);
  return run;
}

export function activeRun(roomId: string): AiRun | null {
  return runs.get(roomId) ?? null;
}

/** 自分が始めた生成だけを片づける。入れ替わっていたら何もしない */
export function endRun(roomId: string, run: AiRun): void {
  if (runs.get(roomId) === run) runs.delete(roomId);
}

/** 「とめる」から呼ぶ。止めるものが無ければ false */
export function abortRun(roomId: string): boolean {
  const run = runs.get(roomId);
  if (!run) return false;
  run.stopped = true;
  run.controller.abort();
  return true;
}
