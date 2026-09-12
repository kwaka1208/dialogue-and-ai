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
};

export function errorText(code: string): string {
  return TEXT[code] ?? 'うまく いかなかったみたい。もういちど ためしてね';
}
