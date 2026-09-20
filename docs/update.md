# 更新をサーバーに反映する

一度置いたあと、直した内容を本番に持っていくまでの手順。はじめて置くときは
[`deploy.md`](./deploy.md)、手元で直す手順は [`development.md`](./development.md)。

流れはこの5つ。手元で確かめてから push し、サーバーでは pull して作り直して再起動する。

```
手元: typecheck / build で確かめる → commit → push
サーバー: 控えを取る → git pull → npm ci → npm run build → systemctl restart → 確かめる
```

`git pull` は `.env` と `dist/` と `data/` に触らない（すべて `.gitignore` 済み）。アプリだけが
入れ替わり、DBと添付ファイルは `/var/lib/kids-group-chat` に残る。

---

## 0. いつやるか

再起動すると、開いている画面のSSEは**全部切れる**。子どもの画面はつなぎ直すが、部屋を使っている
最中にはやらないこと。イベントの当日なら、始める前か終わったあとにする。

サーバーは SIGTERM を受けてから次の順で畳むので、生成中の返事が消えることはない。

1. 生成中のAIの返事を中断して、そこまでの本文をDBに保存する
2. 開いているSSEを閉じる
3. DBを閉じて終わる

在室者リストはプロセス内メモリなので再起動で消えるが、子どもがつなぎ直せば戻る。

---

## 1. 手元で確かめる

サーバーで初めてビルドが落ちると復旧が面倒なので、型とビルドは手元で通しておく。

```bash
npm run typecheck    # server と web の tsc --noEmit
npm run build        # web/dist と server/dist を作る
```

本番と同じ形（BFFが静的ファイルも配る）で触っておく。

```bash
npm start            # node server/dist/index.js → http://localhost:8787
```

自動テストは無いので、ここで手で触ったぶんが唯一の網になる。直した場所に応じて、部屋を1つ作って
2人で発言する、AIに呼びかける、画像を1枚送る、あたりまで通す（[`development.md` の4章](./development.md#4-通しで動かしてみる)）。

---

## 2. push する

```bash
git status
git add -A
git commit -m "（直した内容）"
git push origin main
```

`.env` は `.gitignore` 済みなので上がらない。**`.env.example` に項目を足したときは、サーバーの
`.env` に手で足す作業が別に要る**（5章）。あとで気づけるように、コミットメッセージに書いておく。

---

## 3. サーバーで控えを取る

反映する前に1回まわしておく。DBの形が変わる更新のときは特に。

```bash
ssh （サーバー）
sudo /opt/kids-group-chat/deploy/backup.sh
```

いまのコミットも控えておく。戻すときにこれが要る。

```bash
cd /opt/kids-group-chat
sudo git rev-parse --short HEAD    # 例: 6ae87f1 → メモしておく
```

---

## 4. 反映する

```bash
cd /opt/kids-group-chat
sudo git pull
sudo npm ci
sudo npm run build
sudo systemctl restart kids-group-chat
```

それぞれ何のためにあるか。

| | 何をするか | 飛ばせるか |
|---|---|---|
| `git pull` | ソースを新しくする | 飛ばせない |
| `npm ci` | `package-lock.json` のとおりに入れ直す | 依存が変わっていなければ飛ばせる（下記） |
| `npm run build` | `web/dist` と `server/dist` を作り直す | 飛ばせない。サーバーは `dist` しか読まない |
| `systemctl restart` | 新しい `dist` と `.env` を読み直す | 飛ばせない |

`npm ci` は `node_modules` を消して入れ直すので、1コア/1GB のサーバーでは数分かかる。依存が
変わっていなければ飛ばしてよい。控えておいたコミットと比べて判断する。

```bash
sudo git diff 6ae87f1 HEAD --stat -- package-lock.json
```

差分が出なければ `npm ci` は要らない。出たら流す。迷ったら流しておけば間違いにはならない。

フロントだけ直したときも `npm run build` は両方作る。片方だけにする理由は無いので分けない。

`.env` を書き換えただけのときも `systemctl restart` が要る。`.env` は起動時にしか読まれない。

---

## 5. `.env` に項目が増えたとき

`git pull` はサーバーの `.env` に触らない。`.env.example` に足した項目は、手で書き写す。

```bash
sudo git diff 6ae87f1 HEAD -- .env.example
sudoedit /opt/kids-group-chat/.env
sudo systemctl restart kids-group-chat
```

3つ気をつける。

- **`UPLOAD_DIR` は足さない。** 相対パスのまま入るとリポジトリの中を指し、`ProtectSystem=strict`
  に阻まれて起動時に `ENOENT` で落ちる（[`deploy.md` の2章](./deploy.md#env-を書く)）
- **所有者と権限を保つ。** `sudoedit` なら変わらないが、`cp` や `tee` で作り直したときは戻す
- **フェーズ9への更新では `ADMIN_TOKEN` が使えなくなる。** 管理画面はGoogleログインに変わった。
  `GOOGLE_CLIENT_ID` と `SUPER_ADMIN_EMAILS` を足してから再起動しないと、起動時に弾かれる。
  用意のしかたは [`deploy.md` の2章](./deploy.md#googleログインの用意)。`ADMIN_TOKEN` の行は
  読まれなくなるので、消してよい

```bash
sudo chown kidschat:kidschat /opt/kids-group-chat/.env
sudo chmod 600 /opt/kids-group-chat/.env
ls -l /opt/kids-group-chat/.env
```

DBの列を足す変更は、起動時に `server/src/db/index.ts` が流すので、手でまわすものは無い。

フェーズ9で `rooms` に所有者の列が増えたが、それまでにあった部屋は所有者なしとして残る。
管理画面では特権管理者にだけ見え、他の管理者からは見えなくなる。

フェーズ12で `rooms` に部屋ごとのモデルと system prompt の列が増えた。既存の部屋はどれも NULL
（＝既定のまま）で入るので、見た目も振る舞いも今までどおりになる。

---

## 6. 反映されたか確かめる

```bash
systemctl status kids-group-chat
curl -s localhost:8787/api/health
sudo journalctl -u kids-group-chat -n 30 --no-pager
```

`{"ok":true,"aiConfigured":true,...}` が返れば起動している。`aiConfigured` が false なら
`SAKURA_AI_TOKEN` か `SAKURA_AI_MODEL` が読めていない。

外からも見る。

```bash
curl -s https://kids.example.com/api/health
```

ブラウザで `/admin` に入って部屋を1つ作り、直した場所に応じて確かめる。触るのが3つより増えたら、
[`deploy.md` の4章](./deploy.md#4-動いているか確かめる)と同じ通し（2人で発言・AIに呼びかけ・画像1枚）をやっておく。

更新の前から画面を開いたままの人がいたら、**再読み込みしてもらう**。フロントのファイル名は
ビルドのたびに変わるので、古い画面のままだと読み込みに失敗する。部屋に入り直す必要はない。

確かめ終わったら、確認用に作った部屋は消しておく。

---

## 7. 戻すとき

アプリを前のコミットに戻して、同じように作り直す。

```bash
cd /opt/kids-group-chat
sudo git log --oneline -5
sudo git reset --hard 6ae87f1     # 3章で控えたコミット
sudo npm ci
sudo npm run build
sudo systemctl restart kids-group-chat
```

`npm ci` は、依存が変わる更新を戻すときだけ要る（4章と同じ判断）。

**DBは戻らない。** アプリを戻しても、そのあいだに増えた発言や添付はそのまま残る。列を足しただけの
変更なら、古いアプリは余分な列を見ないので、たいていはアプリを戻すだけで足りる。DBまで戻すのは
[`deploy.md` の6章](./deploy.md#戻すとき)。戻した時点より後の会話は消えるので、先に
`/admin` からエクスポートしておくこと。

直したものを改めて入れるときは、`git pull` すれば `main` の先頭に戻る。

---

## 8. つまずくところ

| 症状 | 見るところ |
|---|---|
| `git pull` が「Your local changes would be overwritten」 | サーバー上で直接直したファイルがある。`sudo git status` で見て、要らなければ `sudo git checkout -- （ファイル）` |
| `npm ci` が `better-sqlite3` のスクリプトをブロックする | `sudo npm install-scripts approve better-sqlite3 esbuild fsevents` のあと `sudo npm rebuild better-sqlite3` |
| Node を上げた直後に起動しない | `better-sqlite3` が前のバージョン向けのまま。`sudo npm rebuild better-sqlite3` |
| `npm ci` や `npm run build` の途中で固まる・落ちる | メモリ。`free -h` でスワップが効いているか（[`deploy.md` の1章](./deploy.md#1-サーバーの下ごしらえ)） |
| 起動してすぐ落ちる | `journalctl` に「本番環境では次の環境変数が必須です」が出ていないか。`.env` の埋め忘れ |
| `ENOENT: mkdir '/opt/.../server/data/uploads'` | `.env` に `UPLOAD_DIR` の相対パスが入った（5章） |
| 画面が真っ白・ファイルが404 | 更新前から開いていた画面。再読み込みする |
| `/api/admin` が503 | `GOOGLE_CLIENT_ID` が読めていない。`.env` の所有者が `kidschat` か（5章） |
| 更新後に管理画面へ入れない | フェーズ9でGoogleログインに変わった。`GOOGLE_CLIENT_ID` と `SUPER_ADMIN_EMAILS` を足したか（5章） |
| 更新後に部屋が一覧から消えた | それまでの部屋は所有者なしになる。特権管理者でログインすれば見える |
| 「古い attachments テーブルにデータが残っています」 | フェーズ5より前のDB。手で移すか、控えを取ってから作り直す |

ほかの症状は [`deploy.md` の8章](./deploy.md#8-困ったときに見る場所)にまとめてある。

```bash
sudo journalctl -u kids-group-chat -f
```
