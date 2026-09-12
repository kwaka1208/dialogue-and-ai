# kids-group-chat

子どもたちが、URLひとつで入れるチャットの部屋。その部屋に、AIがひとりの参加者として同席する。

設計の背景と仕様は [`kids-group-chat-handoff.md`](./kids-group-chat-handoff.md) を参照。
（`hermes-kids-chat-handoff.md` は Hermes Agent を組み込む前提だった前版で、現在は不採用。）

## 構成

```
.
├── server/   BFF (Node 22 + TypeScript + Hono + SQLite)
└── web/      フロント (Vite + React + TypeScript)
```

サーバーは1台。本番ではフロントの静的ファイルも BFF が配る。

## セットアップ

```bash
npm install
cp .env.example .env   # 値を埋める
```

`.env` はリポジトリのルート（`.env.example` と同じ場所）に置く。`server` 配下のスクリプトは
cwd が `server/` になるが、`config.ts` がルートの `.env` も見るようにしてある。

`better-sqlite3` はネイティブモジュールなので、npm がインストールスクリプトをブロックした場合は
`npm install-scripts approve better-sqlite3 esbuild fsevents` のあと `npm rebuild better-sqlite3` を実行する。

## 開発

```bash
npm run dev          # BFF (:8787) と Vite (:5173) を同時に起動
npm run dev:server
npm run dev:web
npm run typecheck
```

Vite の dev サーバーは `/api` へのリクエストを BFF に転送する。

## 部屋を作る

`.env` に `ADMIN_TOKEN` を設定し、ブラウザで `/admin` を開いて、そのトークンで入る。
部屋の作成・一覧・設定変更・ログ閲覧・参加者の強制退出・削除はここでできる。

トークンは sessionStorage に置くので、タブを閉じれば消える。子どもが使う端末では開いたままにしない。

コマンドからも作れる。

```bash
npm run room:new -w server -- --name "テストのへや" --passcode 1234
# → http://localhost:5173/r/xxxxxxxxxxxxxxxxxxxxxx が表示される

curl -X POST http://localhost:8787/api/admin/rooms \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"テストのへや","passcode":"1234","capacity":5}'
```

## 使うモデル

フェーズ1で3つ試して `preview/Qwen3-VL-30B-A3B-Instruct` に決めた。

| | gpt-oss-120b | preview/Qwen3-VL-30B | llm-jp-3.1-8x13b |
|---|---|---|---|
| 最初のチャンクまで | 1.3秒 | 0.3秒 | 0.4秒 |
| 子ども向けの日本語 | 自然・短め | 自然・短め | 講義口調で758文字 |
| 誰に返すかの判断 | 3人全員に返した | 呼びかけた子だけに返した | － |
| 画像入力 | 読めない | 読める | － |

`llm-jp` は system prompt をほとんど守らなかった。`gpt-oss-120b` は正式提供で品質も十分だが、
宛先を絞れず画像も読めないので、フェーズ5の添付を考えると preview 版を採る。preview が廃止
されたら `gpt-oss-120b` に戻し、画像はファイル名だけ伝える方式に切り替える。

`gpt-oss-120b` の画像は注意がいる。`image_url` を送っても HTTP 200 が返るので対応して
いるように見えるが、本文は「画像が確認できません」になる。疎通スクリプトはステータスでは
なく応答本文で判定している。

Qwen3-VL は履歴の「なまえ: 本文」という形を真似て、自分の返事にも `はなこ: ` と接頭辞を
付けてくる。画面には発言者名が別に出るので、`stripSpeakerPrefix` で落としている。落とすのは
履歴にある発言者名と `AI` だけなので、`ヒント: ` のような本文は残る。

## AI Engine の疎通確認

`.env` に `SAKURA_AI_TOKEN` を設定してから実行する。

```bash
npm run check:ai -w server            # まとめて確認
npm run check:ai -w server -- models  # モデル一覧
npm run check:ai -w server -- stream  # ストリーミング
npm run check:ai -w server -- names   # 「なまえ: 本文」形式の理解
npm run check:ai -w server -- image   # 画像入力の可否
```

## AIが返事をするとき

次のどれかで、AIが1回だけ返事をする。

- 入力欄の「AIにきく」ボタン
- 本文が `@AI` で始まるとき
- 部屋が「毎回返す」モード (`replyMode: always`) のとき

同時に走る生成は部屋に1本まで。ほかの子が呼びかけた場合は断る。生成中は「とめる」ボタンが出て、
押すとそこまでの本文を残して終わる。`SAKURA_AI_TOKEN` が未設定なら、AIは黙ったまま子ども同士の
チャットだけが動く。

AI Engine を実際に叩かずに往復を試したいときは、OpenAI互換のSSEを返すモックを立てて
`SAKURA_AI_BASE_URL` をそこへ向ける。

## 添付ファイル

入力欄の「📎 ファイル」から付ける。1回の発言に3つまで、1ファイル10MBまで。

| 種類 | 画面 | AIへの渡し方 |
|---|---|---|
| 画像 (png / jpg / gif / webp) | タイムラインに表示 | いちばん新しい1枚だけを `image_url` で渡す |
| テキスト (txt / md / csv) | ファイル名のリンク | 中身を1万文字まで本文に添える |
| PDF | ファイル名のリンク | ファイル名だけ（テキスト抽出は未実装） |

拡張子の allowlist 方式で、表にない種類は受け付けない。種類の判断はブラウザが送ってくる
Content-Type ではなく拡張子で行い、配信するときも allowlist で決めた MIME を返す。画像以外は
`Content-Disposition: attachment` にして、ブラウザで開かせずに保存させる。

送信の流れは2段階になっている。

1. `POST /api/rooms/:id/attachments` でファイルだけ先に送る（この時点では上げた本人にしか見えない）
2. `POST /api/rooms/:id/messages` に `attachmentIds` を入れて発言する

送る前なら `DELETE /api/rooms/:id/attachments/:attachmentId` で取り消せる。取り消さないまま
放置されたものは、次の誰かのアップロード時に、6時間を過ぎていれば実体ごと片づける。

画像は1枚でもトークンを大きく食うので、AIに渡すのは履歴の中でいちばん新しい1枚だけにしている。
4MBを超える画像は渡さず、ファイル名だけ伝える。

## 管理画面

`/admin`。大人が見る画面なので、文言はひらがな寄りにしていない。

| できること | 補足 |
|---|---|
| 部屋の作成 | 名前・合言葉・定員・AIに聞ける回数・有効時間・返し方 |
| 一覧 | 残り時間、在室数、発言数、AIの使用量（`turnsUsed / turnLimit`）、URLのコピー |
| 設定変更 | 名前・定員・AIに聞ける回数・返し方。合言葉と期限は変えられない（期限は「4時間 延長」） |
| ログ閲覧 | 直近500件。発言者・時刻・本文・添付のファイル名 |
| エクスポート | 部屋・参加者・全メッセージをJSONで保存 |
| 強制退出 | 押し間違い防止に2回押させる。確認ダイアログは出さない |
| 削除 | 論理削除。会話ログはDBに残り、添付ファイルは実体ごと消える |

強制退出は `participants.kicked_at` に印を付ける。cookie が残っていても `403 kicked` で戻れず、
開いている画面はサーバー側から SSE を切って「この へやから でました」に差し替える。名前の行は
消さないので、同じ名前で入り直すこともできない。

部屋を消すと添付ファイルは戻らない。ログが要るなら先にエクスポートしておくこと。

## レート制限

| 単位 | 上限 | 超えたとき |
|---|---|---|
| 参加者ごとのAIへの呼びかけ | 毎分3回 | その発言は残り、AIだけが返事をしない |
| 参加者ごとの発言 | 毎分20回 | `429 too_fast` |
| 部屋ごとのAIへの呼びかけ | `turnLimit`（既定100回） | 管理画面で上限を上げれば続きから使える |

参加者ごとの制限はプロセス内メモリの直近1分の窓で数える。サーバーは1台なので分散は考えない。
再起動すると窓は消えるが、1分ぶんなので実害はない。部屋ごとの上限だけはDBの `turns_used` が持つ。

断る判定は、数を消費しないものから順に見る。「AIが混んでいて断られた」ぶんで参加者の枠や部屋の
ターンが減らないようにするため。

## 実装の進み具合

- [x] フェーズ0 土台（リポジトリ構成、DBスキーマ、疎通スクリプト）
- [x] フェーズ1 AI Engine 疎通確認（モデル選定まで完了）
- [x] フェーズ2 SSE でメッセージが流れる
- [x] フェーズ3 部屋と参加（入室・複数人の同時表示・在室者リスト）
- [x] フェーズ4 AI の合流（実機で確認ずみ）
- [x] フェーズ5 添付ファイル（PDFのテキスト抽出は入れていない）
- [x] フェーズ6 管理画面とレート制限（部屋を消したときの添付の削除も入れた）
- [ ] フェーズ7 子ども向けの文言とデザイン調整
