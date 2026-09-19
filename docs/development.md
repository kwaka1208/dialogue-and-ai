# 開発環境

手元で動かして直すための手順。本番に置く手順は [`deploy.md`](./deploy.md)。

---

## 1. 前提

- Node 22 以上（`package.json` の `engines` で縛っている）
- git

DBは SQLite なので、別に立てるものは無い。AI Engine のトークンも無くても始められる（AIだけが
黙って、子ども同士のチャットは動く）。

---

## 2. 初回セットアップ

```bash
git clone https://github.com/kwaka1208/dojo-agent.git
cd dojo-agent
npm install
cp .env.example .env
```

`better-sqlite3` はネイティブモジュールなので、npm がインストールスクリプトをブロックした場合は
承認してから作り直す。

```bash
npm install-scripts approve better-sqlite3 esbuild fsevents
npm rebuild better-sqlite3
```

`.env` はリポジトリのルート（`.env.example` と同じ場所）に置く。`npm run -w server` のスクリプトは
cwd が `server/` になるが、`config.ts` がルートの `.env` も見るようにしてある。

### .env に何を入れるか

| | 開発で必要か | 入れるもの |
|---|---|---|
| `SAKURA_AI_TOKEN` | 任意 | さくらのクラウドのコントロールパネルで AI Engine のトークンを発行する。未設定ならAIが黙ったままチャットだけ動く |
| `SAKURA_AI_MODEL` | そのまま | `.env.example` の既定値（`preview/Qwen3-VL-30B-A3B-Instruct`）でよい |
| `GOOGLE_CLIENT_ID` | `/admin` を触るなら必要 | 下の「Googleログインの用意」を見る。未設定だと `/api/admin` が 503 を返す |
| `SUPER_ADMIN_EMAILS` | `/admin` を触るなら必要 | 自分のGoogleアカウントのメールアドレス。ここに書いた人だけが最初に入れる |
| `ADMIN_SESSION_TTL_HOURS` | そのまま | ログインが切れるまでの時間。未設定なら12時間 |
| `DATA_DIR` / `UPLOAD_DIR` | そのまま | 既定で `server/data` の下にDBと添付ファイルができる。`.gitignore` 済み |
| `NG_WORDS_FILE` | 任意 | 未設定なら `server/src/lib/word-filter.ts` の既定のリストを使う |

### Googleログインの用意

1. [Google Cloud コンソール](https://console.cloud.google.com/) でプロジェクトを作る（既存でもよい）
2. 「APIとサービス > OAuth同意画面」を設定する（外部・テスト中のままでよい。テストユーザーに自分を入れる）
3. 「APIとサービス > 認証情報 > 認証情報を作成 > OAuth クライアント ID」で **ウェブ アプリケーション** を選ぶ
4. 「承認済みの JavaScript 生成元」に `http://localhost:5173` を足す（本番は公開URL。**末尾のスラッシュは付けない**）
5. できたクライアントIDを `.env` の `GOOGLE_CLIENT_ID` に入れる

クライアントシークレットは使わない。ブラウザが受け取った ID トークン（JWT）をBFFに渡し、
BFF側が `google-auth-library` で署名・発行者・宛先・期限を確かめる方式にしてある。

「承認済みのリダイレクト URI」は空のままでよい。リダイレクトを使わないため。

参加者の cookie に秘密鍵は要らない。入室のときにランダムなトークンを作って渡し、DBにはその
SHA-256 だけを持つ方式なので、署名用の鍵を置く場所が無い。

---

## 3. 開発サーバー

```bash
npm run dev          # BFF (:8787) と Vite (:5173) を同時に起動
npm run dev:server   # BFFだけ
npm run dev:web      # Viteだけ
```

触るのは Vite 側の `http://localhost:5173`。`/api` へのリクエストは Vite が BFF に転送するので、
CORS は出てこない。BFFは `tsx watch` なので、保存すれば勝手に再起動する。

---

## 4. 通しで動かしてみる

**1. 部屋を作る**

`http://localhost:5173/admin` を開き、`SUPER_ADMIN_EMAILS` に書いたGoogleアカウントで
ログインして作る。コマンドからも作れる。

```bash
npm run room:new -w server -- --name "テストのへや" --passcode 1234
# → 部屋コード（6桁）と http://localhost:5173/r/xxxxxxxxxxxxxxxxxxxxxx が表示される
```

| オプション | 既定 |
|---|---|
| `--name` | `テストのへや` |
| `--passcode` | なし（合言葉なしで入れる） |
| `--capacity` | 20 |
| `--hours` | 4 |
| `--opinion` | 付けると意見モードの部屋になる。省略すると会話モード |
| `--always` | 会話モードのときだけ効く。付けると `replyMode: always`（毎回AIが返す） |
| `--owner` | 所有者にする管理者のメールアドレス。省略すると所有者なしになり、管理画面では特権管理者にしか見えない |

APIを直接叩くこともできるが、管理APIは cookie のセッションが要る。ブラウザで一度ログインしてから
開発者ツールの Network でリクエストをコピーするのが早い。

```bash
# ブラウザの cookie をそのまま使う例
curl -X POST http://localhost:8787/api/admin/rooms \
  -H "Cookie: kgc_admin_session=<ブラウザから取った値>" -H 'Content-Type: application/json' \
  -d '{"name":"テストのへや","passcode":"1234","capacity":5}'
```

**2. 部屋に入る**

`http://localhost:5173/` を開いて6桁の部屋コードを入れると、入室画面（`/r/:id`）に移る。
URLを直接開いてもよい。

コードは部屋を作ると自動で付く。6桁を足す前に作った部屋には、次の起動時に採番される
（`ensureRoomCodes`。ログに「n 個の部屋に部屋コードを採番しました」と出る）。

**3. 2人で入る**

参加者の cookie は部屋ごと（`path=/api/rooms/:id`）に1つしか持てない。同じブラウザの同じ
プロファイルで同じ部屋に2人目として入ると、**cookie が上書きされて1人目の画面が使えなくなる**
（サーバー側の参加者は2人とも残るが、ブラウザは1人目のトークンを持っていない）。2人分の画面を
同時に開くには、シークレットウィンドウか別のブラウザを使う。

**4. 動きを確かめる**

- 片方の発言がもう片方にすぐ出るか（SSEが通っている）
- 在室者の人数が2人になるか
- 会話モードの部屋で「AIに きく」を押すと、返事が少しずつ出るか（`SAKURA_AI_TOKEN` を
  入れている場合）
- 意見モードの部屋では、`@AI` と書いてもAIが返事をしないこと。2人で何往復かしてから
  「AIに いけんを きく」を押すと、「◯◯さんが AIに いけんを ききました」のあとに意見が出るか
- 📎 から画像を1枚付けて送ると、タイムラインに出てAIがその中身に触れるか

**5. 作り直す**

DBと添付を消してやり直したいとき。

```bash
rm -rf server/data
```

次の起動でスキーマから作り直す。マイグレーションは `server/src/db/index.ts` が起動時に流す。

---

## 5. AI Engine の疎通確認

`.env` に `SAKURA_AI_TOKEN` を設定してから実行する。フェーズ1でモデルを選ぶのに使ったもので、
モデルを変えるときや「AIが黙っている」ときの切り分けに使える。

```bash
npm run check:ai -w server            # まとめて確認
npm run check:ai -w server -- models  # モデル一覧
npm run check:ai -w server -- stream  # ストリーミング
npm run check:ai -w server -- names   # 「なまえ: 本文」形式の理解
npm run check:ai -w server -- image   # 画像入力の可否
```

`image` はステータスコードではなく応答本文で判定している。`gpt-oss-120b` は `image_url` を
送っても HTTP 200 を返すが、本文は「画像が確認できません」になるため。

モデルごとの比較結果は [README の「使うモデル」](../README.md#使うモデル) にある。

### AI Engine を叩かずに往復を試す

無料枠を使いたくないとき、OpenAI互換のSSEを返すモックを立てて `SAKURA_AI_BASE_URL` をそこへ
向ける。ストリーミングの見え方や「とめる」の挙動はこれで確かめられる。

---

## 6. 型チェックとビルド

```bash
npm run typecheck    # server と web の tsc --noEmit
npm run build        # web/dist と server/dist を作る
```

本番と同じ形（BFFが静的ファイルも配る）をローカルで見るとき。

```bash
npm run build
npm start            # node server/dist/index.js → http://localhost:8787
```

`NODE_ENV=production` を付けると cookie に `Secure` が付く。最近のブラウザは
`http://localhost` を安全な文脈として扱うので手元では入れるが、LANの別端末から
`http://192.168.x.x:8787` で開くと cookie が保存されず入室できない。実機で試すなら、
`NODE_ENV` は付けずに起動する。

自動テストはまだ無い。いまの網は `typecheck` と手で触ることだけ。

---

## 7. よくあるつまずき

| 症状 | 見るところ |
|---|---|
| `npm install` で `better-sqlite3` が失敗する | 2章のインストールスクリプトの承認。それでも駄目なら Node のバージョン |
| AIが黙ったまま | `curl -s localhost:8787/api/health` の `aiConfigured`。false ならトークンかモデル名 |
| `/admin` に入れない | `.env` の `GOOGLE_CLIENT_ID` と `SUPER_ADMIN_EMAILS`。BFFを再起動したか（`.env` は起動時にしか読まない） |
| Googleのログインボタンが出ない | Google Cloud の「承認済みの JavaScript 生成元」に `http://localhost:5173` が入っているか。ブラウザのコンソールに GSI のエラーが出る |
| ログインすると「登録されていません」 | `SUPER_ADMIN_EMAILS` のアドレスと、実際にログインしたGoogleアカウントが一致しているか |
| 作ったはずの部屋が一覧に出ない | 他の管理者が作った部屋は見えない。CLI で `--owner` なしに作った部屋は特権管理者にしか見えない |
| 1人目の画面が急に「入り直して」になる | 同じブラウザで同じ部屋に2人目として入り、cookie が上書きされた（4章） |
| 発言が相手に出ない | ブラウザの Network で `/stream` がつながったままか。BFFの再起動で切れたなら再読み込み |
| AIの返事が途中で止まる | サーバーのログに `[ai]` の行が出ていないか。タイムアウトは60秒 |
| 強制退出した名前で入り直せない | 仕様。`participants` の行は残すので、同じ名前では戻れない |
