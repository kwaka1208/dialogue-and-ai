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

/** AIへの呼びかけが受け付けられなかったとき、自分の画面にだけ出す */
const AI_NOTICE: Record<string, string> = {
  busy: 'いま AIは べつの おへんじを かいているよ。おわってから きいてね',
  unavailable: 'いまは AIが おやすみちゅう。みんなだけで おはなし できるよ',
  turn_limit: 'この へやで AIに きける かいすうが いっぱいに なりました',
  rate_limited: 'AIに きくのは 1ぷんに 3かいまで。すこし まってから きいてね',
};

export function aiNoticeText(status: string): string | null {
  return AI_NOTICE[status] ?? null;
}

/** ai_error の理由。timeout と failed はサーバーが部屋ぜんたいに流すので、ここでは出さない */
const AI_ERROR: Record<string, string> = {
  empty: 'AIが なにも いえなかったみたい。きき方を かえて もういちど きいてみてね',
};

export function aiErrorText(reason: string): string | null {
  return AI_ERROR[reason] ?? null;
}
