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

管理画面はフェーズ6で作る。それまでは開発用スクリプトで作る。

```bash
npm run room:new -w server -- --name "テストのへや" --passcode 1234
# → http://localhost:5173/r/xxxxxxxxxxxxxxxxxxxxxx が表示される
```

`ADMIN_TOKEN` を設定していれば管理APIからも作れる。

```bash
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

## 実装の進み具合

- [x] フェーズ0 土台（リポジトリ構成、DBスキーマ、疎通スクリプト）
- [x] フェーズ1 AI Engine 疎通確認（モデル選定まで完了）
- [x] フェーズ2 SSE でメッセージが流れる
- [x] フェーズ3 部屋と参加（入室・複数人の同時表示・在室者リスト）
- [x] フェーズ4 AI の合流（実機で確認ずみ）
- [ ] フェーズ5 添付ファイル
- [ ] フェーズ6 管理画面とレート制限
- [ ] フェーズ7 子ども向けの文言とデザイン調整
