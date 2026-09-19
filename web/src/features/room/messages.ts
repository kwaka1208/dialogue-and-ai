import type { AiMode } from './types.ts';

/** サーバーのエラーコードを、子どもに読める言葉にする */
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

export function errorText(code: string): string {
  return TEXT[code] ?? 'うまく いかなかったみたい。もういちど ためしてね';
}

/**
 * AIに動いてもらえなかったとき、自分の画面にだけ出す。
 * 「おへんじ」と「いけん」は部屋のモードで言い分ける。
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

export function aiNoticeText(status: string, mode: AiMode): string | null {
  const byMode = mode === 'opinion' ? AI_NOTICE_OPINION : AI_NOTICE_CHAT;
  return byMode[status] ?? AI_NOTICE_COMMON[status] ?? null;
}

/** ai_error の理由。timeout と failed はサーバーが部屋ぜんたいに流すので、ここでは出さない */
const AI_ERROR_CHAT: Record<string, string> = {
  empty: 'AIが なにも いえなかったみたい。きき方を かえて もういちど きいてみてね',
};

const AI_ERROR_OPINION: Record<string, string> = {
  empty: 'AIが なにも いえなかったみたい。すこし はなしてから もういちど きいてみてね',
};

export function aiErrorText(reason: string, mode: AiMode): string | null {
  return (mode === 'opinion' ? AI_ERROR_OPINION : AI_ERROR_CHAT)[reason] ?? null;
}
