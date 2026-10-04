import type { AiMode, Audience } from './types.ts';

/** サーバーのエラーコードを、部屋の対象に合った言葉にする。子ども向けはひらがな */
const TEXT: Record<string, string> = {
  name_taken: 'その なまえは もう つかわれています。べつの なまえに してね',
  wrong_passcode: 'あいことばが ちがうみたい',
  room_full: 'この へやは いっぱいです',
  room_closed: 'この へやは おわりました',
  invalid_name: 'なまえは 1〜12もじで いれてね',
  invalid_body: 'メッセージが ながすぎるか、からっぽです',
  not_joined: 'もういちど なまえを いれて はいってね',
  not_found: 'この へやは みつかりません',
  // 添付ファイル
  unsupported_type: 'この しゅるいの ファイルは つけられません（しゃしん・txt・md・csv・pdf だけ）',
  file_too_large: 'ファイルが おおきすぎます（10MBまで）',
  empty_file: 'この ファイルは からっぽみたい',
  too_many_files: 'ファイルは 3こまで つけられます',
  no_file: 'ファイルを えらんでね',
  already_sent: 'もう おくった ファイルは けせません',
  // レート制限
  too_fast: 'ちょっと はやすぎるみたい。すこし まってから おくってね',
  kicked: 'この へやから でました。おとなの人に きいてね',
};

/** 大人向け。漢字まじりの、ふつうの案内文にする */
const ADULT_TEXT: Record<string, string> = {
  name_taken: 'その表示名はすでに使われています。別の名前を入力してください',
  wrong_passcode: '合言葉が正しくありません',
  room_full: 'この部屋は定員に達しています',
  room_closed: 'この部屋は終了しました',
  invalid_name: '表示名は1〜12文字で入力してください',
  invalid_body: 'メッセージが長すぎるか、空です',
  not_joined: 'もう一度表示名を入力して入室してください',
  not_found: 'この部屋は見つかりません',
  // 添付ファイル
  unsupported_type: 'この形式のファイルは添付できません（画像・txt・md・csv・pdf のみ）',
  file_too_large: 'ファイルが大きすぎます（10MBまで）',
  empty_file: 'このファイルは空のようです',
  too_many_files: '添付できるファイルは3件までです',
  no_file: 'ファイルを選択してください',
  already_sent: '送信済みのファイルは削除できません',
  // レート制限
  too_fast: '送信の間隔が短すぎます。少し待ってから送信してください',
  kicked: 'この部屋から退出しました。詳しくは主催者にお問い合わせください',
};

export function errorText(code: string, audience: Audience = 'kids'): string {
  if (audience === 'adult') {
    return ADULT_TEXT[code] ?? 'うまくいきませんでした。もう一度お試しください';
  }
  return TEXT[code] ?? 'うまく いかなかったみたい。もういちど ためしてね';
}

/**
 * AIに動いてもらえなかったとき、自分の画面にだけ出す。
 * 「おへんじ」と「いけん」は部屋のモードで、言葉づかいは部屋の対象で言い分ける。
 */
const AI_NOTICE_COMMON: Record<string, string> = {
  unavailable: 'いまは AIが おやすみちゅう。みんなだけで おはなし できるよ',
  turn_limit: 'この へやで AIに きける かいすうが いっぱいに なりました',
  rate_limited: 'AIに きくのは 1ぷんに 3かいまで。すこし まってから きいてね',
};

const AI_NOTICE_CHAT: Record<string, string> = {
  busy: 'いま AIは べつの おへんじを かいているよ。おわってから きいてね',
  filtered: 'いまの いいかたには、AIは おへんじ しないよ。ことばを かえて きいてみてね',
};

const AI_NOTICE_OPINION: Record<string, string> = {
  busy: 'いま AIが いけんを かいているよ。おわってから きいてね',
  filtered: 'いまの はなしには、AIは いけんを いわないよ。ことばを かえて はなしてみてね',
  no_messages: 'まだ だれも はなしていないみたい。すこし はなしてから きいてね',
};

const ADULT_AI_NOTICE_COMMON: Record<string, string> = {
  unavailable: '現在AIは利用できません。参加者同士での会話は続けられます',
  turn_limit: 'この部屋でAIを利用できる回数の上限に達しました',
  rate_limited: 'AIへの依頼は1分に3回までです。少し待ってからお試しください',
};

const ADULT_AI_NOTICE_CHAT: Record<string, string> = {
  busy: 'AIは別の回答を作成中です。完了してからもう一度お試しください',
  filtered: 'この内容にはAIは回答しません。表現を変えてお試しください',
};

const ADULT_AI_NOTICE_OPINION: Record<string, string> = {
  busy: 'AIが意見を作成中です。完了してからもう一度お試しください',
  filtered: 'この議論の内容にはAIは意見を述べません。表現を変えてお試しください',
  no_messages: 'まだ発言がありません。議論を始めてから意見を求めてください',
};

export function aiNoticeText(
  status: string,
  mode: AiMode,
  audience: Audience = 'kids',
): string | null {
  const adult = audience === 'adult';
  const byMode =
    mode === 'opinion'
      ? adult
        ? ADULT_AI_NOTICE_OPINION
        : AI_NOTICE_OPINION
      : adult
        ? ADULT_AI_NOTICE_CHAT
        : AI_NOTICE_CHAT;
  const common = adult ? ADULT_AI_NOTICE_COMMON : AI_NOTICE_COMMON;
  return byMode[status] ?? common[status] ?? null;
}

/** ai_error の理由。timeout と failed はサーバーが部屋ぜんたいに流すので、ここでは出さない */
const AI_ERROR_CHAT: Record<string, string> = {
  empty: 'AIが なにも いえなかったみたい。きき方を かえて もういちど きいてみてね',
};

const AI_ERROR_OPINION: Record<string, string> = {
  empty: 'AIが なにも いえなかったみたい。すこし はなしてから もういちど きいてみてね',
};

const ADULT_AI_ERROR_CHAT: Record<string, string> = {
  empty: 'AIから回答が得られませんでした。質問の仕方を変えてもう一度お試しください',
};

const ADULT_AI_ERROR_OPINION: Record<string, string> = {
  empty: 'AIから意見が得られませんでした。議論を進めてからもう一度お試しください',
};

export function aiErrorText(
  reason: string,
  mode: AiMode,
  audience: Audience = 'kids',
): string | null {
  const table =
    audience === 'adult'
      ? mode === 'opinion'
        ? ADULT_AI_ERROR_OPINION
        : ADULT_AI_ERROR_CHAT
      : mode === 'opinion'
        ? AI_ERROR_OPINION
        : AI_ERROR_CHAT;
  return table[reason] ?? null;
}
