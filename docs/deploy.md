# デプロイと運用

1台のサーバーに置いて、HTTPSで配るまでの手順。1コア/1GB の Ubuntu 24.04 を想定している。
手元で動かす手順は [`development.md`](./development.md)。

置き場所はこう分ける。

| | 場所 | 誰が書くか |
|---|---|---|
| アプリ | `/opt/kids-group-chat` | デプロイのときだけ。サービスからは読むだけ |
| データ | `/var/lib/kids-group-chat` | サービス（DBと添付ファイル） |
| 控え | `/var/backups/kids-group-chat` | cron |

アプリとデータを分けてあるので、デプロイでアプリを入れ替えてもDBには触らない。

---

## 1. サーバーの下ごしらえ

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential sqlite3

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x
```

`build-essential` は `better-sqlite3` のビルドに必要。ビルド済みバイナリが降りてくれば使われないが、
落ちてこなかったときにここで止まる。

スワップを2GB作る。メモリの見込みは300〜500MBで収まるが、`npm ci` と `vite build` が一時的に
食うので、無いと初回デプロイで OOM になる。

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

サービス用のユーザーを作る。ログインもシェルも要らない。

```bash
sudo groupadd --system kidschat
sudo useradd --system --gid kidschat --home /var/lib/kids-group-chat \
  --shell /usr/sbin/nologin kidschat
```

グループを先に作るのは、`useradd --system` だけだとプライマリグループが `nogroup` になり、
ユニットの `Group=kidschat` で起動に失敗することがあるため。

---

## 2. 初回デプロイ

```bash
sudo git clone https://github.com/kwaka1208/dojo-agent.git /opt/kids-group-chat
cd /opt/kids-group-chat
sudo npm ci
sudo npm run build
```

`npm ci` が `better-sqlite3` のインストールスクリプトをブロックしたら、承認してから作り直す。

```bash
sudo npm install-scripts approve better-sqlite3 esbuild fsevents
sudo npm rebuild better-sqlite3
```

`npm run build` は `web/dist` と `server/dist` を作る。フロントの静的ファイルは BFF が同じ
ポートから配るので、Webサーバー側に置くものは無い。

### .env を書く

```bash
sudo cp .env.example .env
sudo chown kidschat:kidschat .env
sudo chmod 600 .env
sudoedit /opt/kids-group-chat/.env   # または sudo nano /opt/kids-group-chat/.env
```

本番で埋めるのはこの5つ。

```env
NODE_ENV=production
SAKURA_AI_TOKEN=（AI Engine のトークン）
GOOGLE_CLIENT_ID=（下の「Googleログインの用意」で作る）
SUPER_ADMIN_EMAILS=（特権管理者のメールアドレス。カンマ区切り）
DATA_DIR=/var/lib/kids-group-chat
```

`SUPER_ADMIN_EMAILS` に書いた人だけが、最初に管理画面へ入れる。ここから他の管理者を登録していく
ので、空のままだと誰も入れない（本番では起動時に弾く）。

それと、`UPLOAD_DIR` の行を消す。

```bash
sudo sed -i '/^UPLOAD_DIR=/d' /opt/kids-group-chat/.env
```

消せば添付は `DATA_DIR` の下（`/var/lib/kids-group-chat/uploads`）に置かれる。`.env.example` のまま
`UPLOAD_DIR=./data/uploads` を残すと、相対パスはリポジトリの中を指すので
`/opt/kids-group-chat/server/data/uploads` を作ろうとして起動に失敗する（ユニットの
`ProtectSystem=strict` で `/opt` には書けない）。`DATA_DIR` を直しても `UPLOAD_DIR` のほうが
優先されるため、ここは見落としやすい。別の場所に置きたいときだけ、絶対パスで書く。

### Googleログインの用意

[Google Cloud コンソール](https://console.cloud.google.com/) の
「APIとサービス > 認証情報 > OAuth クライアント ID」を **ウェブ アプリケーション** として作り、
「承認済みの JavaScript 生成元」に公開URL（`https://kids.example.com`）を足す。
**末尾のスラッシュは付けない**。開発用の `http://localhost:5173` も入れておくと、同じクライアントIDで
両方まかなえる。

できたクライアントIDを `GOOGLE_CLIENT_ID` に入れる。クライアントシークレットは使わない
（ブラウザが受け取った ID トークンをBFF側で検証する方式のため）。

OAuth同意画面を「テスト中」のままにすると、テストユーザーに入れた人しかログインできない。
管理者が固定なら、むしろそのほうが安全。

`NODE_ENV=production` にすると、cookie に `Secure` が付き、`GOOGLE_CLIENT_ID` と
`SAKURA_AI_TOKEN` の欠け、`SUPER_ADMIN_EMAILS` が空のままなのを起動時に弾く。systemd のユニットでも
`NODE_ENV=production` を渡しているので、`.env` に書き忘れても本番として動く（dotenv は既にある
環境変数を上書きしないので、両方に書いても食い違わない）。

### サービスを登録する

```bash
sudo cp /opt/kids-group-chat/deploy/kids-group-chat.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kids-group-chat
systemctl status kids-group-chat
curl -s localhost:8787/api/health
```

`{"ok":true,"aiConfigured":true,...}` が返れば起動している。`aiConfigured` が false なら
`SAKURA_AI_TOKEN` か `SAKURA_AI_MODEL` が読めていない。

`StateDirectory=kids-group-chat` が `/var/lib/kids-group-chat` を作って `kidschat` に渡すので、
ディレクトリを自分で掘る必要はない。

---

## 3. HTTPS を終端する

Caddy と nginx、どちらの設定例も `deploy/` に入れてある。新しく立てるなら Caddy のほうが短い。
すでに nginx で他のサイトを動かしているなら nginx で足す。

どちらでも、押さえるところは同じ2つ。

- **SSEをバッファさせない** — 溜めて送られると、AIの返事がまとめて一気に出る
- **アップロードのサイズ上限を上げる** — 添付は1ファイル10MBまで。nginx の既定（1MB）だと 413 になる

### Caddy

証明書を取るには、先にドメインのAレコードをサーバーのIPに向けておく。サーバーから引いて、
自分のサーバーのIPが返ることを確かめる。

```bash
dig +short kids.example.com
```

Cloudflare を使うなら、プロキシ（オレンジ雲）はグレー（DNS only）にする。オレンジのままだと
`104.x.x.x` や `172.67.x.x` が返り、証明書の取得でつまずく。

```bash
sudo apt install -y caddy   # Ubuntu 24.04 なら universe に入っている
sudo cp /opt/kids-group-chat/deploy/Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile   # kids.example.com を自分のドメインに置き換える
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
```

初回は `enable --now` を使う。パッケージを入れただけでは Caddy はまだ起動していないので、
`systemctl reload caddy` を打つと `Job for caddy.service failed.` で止まる。2回目以降、設定を
変えたときは `reload` でよい。

証明書は Caddy が自動で取る。取れているかはログで見る。

```bash
sudo journalctl -u caddy -n 40 --no-pager | grep -iE "certificate|error"
```

`certificate obtained successfully` が出れば完了。出ないときは上から順に見る。

1. Caddy が動いているか（`systemctl is-active caddy`）。`validate` を通しただけでは取得を試みてすらいない
2. 80 と 443 で待ち受けているか（`sudo ss -tlnp | grep -E ':(80|443)'`）
3. `dig` が自分のサーバーのIPを返すか。Cloudflare の雲がオレンジのままになっていないか
4. クラウド側のパケットフィルタ。コントロールパネルで 80/443 を塞いでいると、OS の外側で止まる

アクセスログは journald に出る（`journalctl -u caddy -f`）。ファイルに書かせたいときは
`log` の `output` を変えることになるが、パッケージは `/var/log/caddy` を作らないので、
ディレクトリを自分で作って `caddy` に渡すところまでやること。作らずにファイルを指定すると、
`opening log writer` で設定そのものが読み込めない。

### nginx

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /opt/kids-group-chat/deploy/nginx.conf /etc/nginx/sites-available/kids-group-chat
sudoedit /etc/nginx/sites-available/kids-group-chat   # ドメインを置き換える
sudo ln -s /etc/nginx/sites-available/kids-group-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d kids.example.com
```

`certbot` が `ssl_certificate` の行を書き換える。更新は certbot のタイマーが勝手にやる。

### ファイアウォール

`ufw` は入っていないことがある（`sudo ufw allow 80` が `command not found` になったら未インストール）。

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

`allow OpenSSH` を必ず最初に。これを飛ばして `enable` すると、その場で SSH が切れる。

8787 は開けない。外からは 443 だけで、BFF には Caddy / nginx が localhost 経由で渡す。
塞ぐまでは 8787 が外から素通しなので、HTTPS が通ったら早めにここまでやること。有効にしたあと、
HTTPS がまだ通ることと、外から 8787 に繋がらなくなったことの両方を確かめる。

```bash
curl -i https://kids.example.com/api/health   # 通る
curl -m 5 http://（サーバーのIP）:8787/api/health   # 繋がらない
```

---

## 4. 動いているか確かめる

```bash
curl -s https://kids.example.com/api/health
```

ブラウザで `https://kids.example.com/admin` を開き、`SUPER_ADMIN_EMAILS` に書いたGoogleアカウントで
ログインして部屋を1つ作る。初回ログインで、そのアカウントが管理者として自動登録される。
他の先生に渡すときは、管理画面の「管理者アカウント」からメールアドレスを登録する。
別の端末（できればスマホ）で部屋のURLを開き、次の3つを見る。

1. 名前と合言葉で入れるか
2. 2人で入って、お互いの発言がすぐ出るか（SSEが通っている）
3. 「AIにきく」で返事が**少しずつ**出るか（まとめて一気に出るならバッファされている）

3がまとめて出たら、Webサーバー側の設定を見直す。Caddy なら `flush_interval -1`、
nginx なら `proxy_read_timeout` と `Connection ''` のあたり。

写真を1枚送って、AIがその中身に触れて返せば添付も通っている。

---

## 5. 更新デプロイ

手元で直したものを反映する手順。控えの取り方から戻し方まで含めた詳しい版は
[`update.md`](./update.md) にある。

```bash
cd /opt/kids-group-chat
sudo git pull
sudo npm ci
sudo npm run build
sudo systemctl restart kids-group-chat
```

再起動すると、開いている画面のSSEは全部切れる。子どもの画面はつなぎ直すが、**部屋を使っている
最中はやらないこと**。

再起動のとき、サーバーは SIGTERM を受けてから次の順で畳む。

1. 生成中のAIの返事を中断して、そこまでの本文をDBに保存する
2. 開いているSSEを閉じる
3. DBを閉じて終わる

在室者リストはプロセス内メモリなので再起動で消えるが、子どもがつなぎ直せば戻る。

---

## 6. 控えを取る

`backup.sh` は `sqlite3` コマンドを使う。1章で入れそこねていたら先に入れる。

```bash
sudo apt install -y sqlite3
sudo /opt/kids-group-chat/deploy/backup.sh
```

`/var/backups/kids-group-chat` に `db-*.sqlite.gz` と `uploads-*.tar.gz` を置く。14世代より
古いものは消える（`KEEP=30` のように変えられる）。

初回は手で1度まわして、`db-*` と `uploads-*` の**両方**ができることを見ておく。`uploads-*` が
できないのは、添付が `DATA_DIR` の下に置かれていないということ（2章の `UPLOAD_DIR` を見直す）。
まだ1枚も送っていないだけ、ということもある。

日に1回まわす。

```bash
echo '30 4 * * * root /opt/kids-group-chat/deploy/backup.sh' | sudo tee /etc/cron.d/kids-group-chat-backup
sudo chmod 644 /etc/cron.d/kids-group-chat-backup
```

同じサーバーの中に置くだけでは、サーバーごと失うと戻せない。イベントのログを残すなら、
控えを手元に落としておくこと。

```bash
scp server:/var/backups/kids-group-chat/db-20260912-043000.sqlite.gz .
```

### 戻すとき

```bash
sudo systemctl stop kids-group-chat
sudo gunzip -c /var/backups/kids-group-chat/db-20260912-043000.sqlite.gz \
  | sudo tee /var/lib/kids-group-chat/kids-group-chat.sqlite > /dev/null
sudo tar xzf /var/backups/kids-group-chat/uploads-20260912-043000.tar.gz \
  -C /var/lib/kids-group-chat
sudo chown -R kidschat:kidschat /var/lib/kids-group-chat
sudo systemctl start kids-group-chat
```

WAL のファイル（`-wal` / `-shm`）が残っていると、戻した本体と食い違う。止めてから入れ替えれば、
`.backup` で取った写しに WAL のぶんも入っているので、古い WAL は消してよい。

DBには管理者アカウントも入っている（`admin_accounts`）。戻すと、その控えを取った時点の登録状態に
戻る。あとから登録した管理者は消えるので、控えより後に増やしたぶんは登録し直すこと。ログインの
セッションは戻した時点で全部切れるが、入り直せばよいだけなので、気にしなくてよい。特権管理者は
`.env` の `SUPER_ADMIN_EMAILS` で決まるので、DBを戻しても影響を受けない。

---

## 7. イベント当日の運用

**前日まで**

- サーバーが起きているか（`systemctl status kids-group-chat`）
- AI Engine の当月の使用量に余裕があるか（コントロールパネルで見る）
- NGワードのリストを、集まる子どもに合わせて見直す（`.env` の `NG_WORDS_FILE`）
- 当日 `/admin` を触る人のアカウントが登録ずみで、本人が**当日までに一度ログインできている**か。
  登録しただけでは、Googleアカウントの取り違えや OAuth同意画面のテストユーザー漏れに気づけない

**始める前**

1. `/admin` で部屋を作る。定員・AIに聞ける回数・有効時間をその場に合わせる。部屋は**作った人のもの**
   になるので、当日その部屋を見る人が自分でログインして作る（特権管理者なら誰の部屋でも見られる）
2. 部屋のURLをコピーして、QRコードにするか短いURLにする
3. 大人が先に1人入っておく

**やっている間**

- 大人が同じ部屋にいる。これが一番効く
- AIの返事が止まったら、`/admin` のログと `journalctl -u kids-group-chat -n 50` を見る
- AIに聞ける回数が尽きたら、`/admin` の設定で上げる

**終わったら**

1. `/admin` からログをJSONでエクスポートする（部屋を消すと添付ファイルは戻らない）
2. ログに目を通す。「要確認」の印が付いた行は必ず見る
3. 部屋を消す。論理削除なので会話はDBに残り、添付ファイルは実体ごと消える

---

## 8. 困ったときに見る場所

```bash
# サーバーのログ。AIの失敗はここに詳しく出る
sudo journalctl -u kids-group-chat -f
sudo journalctl -u kids-group-chat --since '1 hour ago' | grep '\[ai\]'

# 起動しない
systemctl status kids-group-chat
sudo journalctl -u kids-group-chat -n 50 --no-pager

# メモリとスワップ
free -h
systemctl show kids-group-chat -p MemoryCurrent

# HTTPS側
sudo journalctl -u caddy -n 50    # または sudo tail -f /var/log/nginx/error.log
```

| 症状 | 見るところ |
|---|---|
| 起動してすぐ落ちる | ログに「本番環境では次の環境変数が必須です」が出ていないか。`.env` の埋め忘れ |
| `ENOENT: mkdir '/opt/.../server/data/uploads'` で落ちる | `.env` の `UPLOAD_DIR` が相対パスのまま残っている（2章） |
| `systemctl reload caddy` が失敗する | 初回はまだ起動していない。`sudo systemctl enable --now caddy`（3章） |
| Caddy が `opening log writer` で設定を読めない | `Caddyfile` の `log` がファイル出力になっている。`output stderr` にする |
| 証明書が取れない | Caddy が起動しているか、`dig` が自分のIPを返すか、パケットフィルタ（3章） |
| `/api/admin` が503 | `GOOGLE_CLIENT_ID` が読めていない。`.env` の所有者が `kidschat` になっているか |
| Googleのログインボタンが出ない | 「承認済みの JavaScript 生成元」に公開URLが入っているか。末尾のスラッシュは付けない |
| ログインで「登録されていません」 | `SUPER_ADMIN_EMAILS` のアドレスと、ログインしたGoogleアカウントが一致しているか |
| AIが黙ったまま | `/api/health` の `aiConfigured`。false ならトークンかモデル名 |
| AIの返事がまとめて出る | Webサーバーのバッファ設定（3章） |
| 添付が413 | nginx の `client_max_body_size` |
| 入り直せない | 強制退出した子は同じ名前で入れない（仕様）。別の名前で入る |
| ディスクが埋まった | `du -sh /var/lib/kids-group-chat/uploads` と控えの世代数 |

`MemoryMax=600M` を超えると systemd がプロセスを殺して再起動する。何度も起きるなら、
`journalctl` で `oom` を探して原因を見る。

---

## メモ

- 部屋のURLは秘密として扱う。アクセスログにURLを残さない設定にしてある（Caddyfile の `format filter`、nginx の `access_log off`）。変えるなら、ログをいつ消すかも決めること。Caddy のログは journald に出るので、残る期間は journald の設定に従う（`journalctl --vacuum-time=14d`）
- `/admin` はGoogleアカウントでのログインが必須で、入れるのは登録ずみのアカウントだけ。セッションは HttpOnly cookie で、既定12時間（`ADMIN_SESSION_TTL_HOURS`）で切れる。子どもが使う端末では開いたままにしない
- 管理者に渡すのは「管理画面に入れる権利」であって、他人の部屋までは見えない。すべての部屋を見られるのは `SUPER_ADMIN_EMAILS` に書いた特権管理者だけ
- 管理者を辞めさせるときは、管理画面から無効化または削除する。その場で開いているセッションも切れる。特権管理者を外すときは `.env` を直して再起動する
- サーバーは1台という前提で作ってある。在室者リストと参加者ごとのレート制限はプロセス内メモリで持っているので、2台に増やすと壊れる
