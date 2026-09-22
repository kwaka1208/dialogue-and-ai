#!/usr/bin/env bash
#
# サーバーの上で動くデプロイ本体。手元から直接叩くものではなく、Makefile が呼ぶ。
#
#   make install HOST=kids.example.com ...   手元から SSH 越しに
#   sudo make update                         サーバーに入って、その場で
#
# 中身は docs/deploy.md と docs/update.md の手順をそのまま並べたもの。
# 何度流しても同じ結果になるように、済んでいる作業は飛ばす。
#
#   remote.sh <サブコマンド> [設定ファイル]
#
# 設定ファイルは Makefile が書く KEY='値' の並び。秘密 (SAKURA_AI_TOKEN など) を
# コマンドライン引数に置かないための受け渡しで、読んだらすぐ消す。

set -euo pipefail

CMD="${1:-}"
CONF="${2:-}"

if [ -z "$CMD" ]; then
	echo "使い方: remote.sh <サブコマンド> [設定ファイル]" >&2
	exit 2
fi

if [ -n "$CONF" ]; then
	if [ ! -f "$CONF" ]; then
		echo "設定ファイルが見つかりません: $CONF" >&2
		exit 2
	fi
	# shellcheck disable=SC1090
	. "$CONF"
	rm -f "$CONF"
fi

# ---- 既定値 ---------------------------------------------------------------

APP_DIR="${APP_DIR:-/opt/dialogue-and-ai}"
DATA_DIR="${DATA_DIR:-/var/lib/dialogue-and-ai}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dialogue-and-ai}"
SERVICE="${SERVICE:-dialogue-and-ai}"
REPO="${REPO:-https://github.com/kwaka1208/dialogue-and-ai.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-8787}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
SWAP_FILE="${SWAP_FILE:-/swapfile}"
APT_UPGRADE="${APT_UPGRADE:-1}"
FORCE_NPM_CI="${FORCE_NPM_CI:-}"
LOG_LINES="${LOG_LINES:-50}"
FOLLOW="${FOLLOW:-}"

SAKURA_AI_TOKEN="${SAKURA_AI_TOKEN:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
SUPER_ADMIN_EMAILS="${SUPER_ADMIN_EMAILS:-}"
DOMAIN="${DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
REF="${REF:-}"

SVC_USER=kidschat
SVC_GROUP=kidschat
UNIT="/etc/systemd/system/${SERVICE}.service"

# ---- 表示まわり -----------------------------------------------------------

if [ -t 1 ]; then
	C_STEP=$'\033[1;34m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_OK=$'\033[1;32m'; C_OFF=$'\033[0m'
else
	C_STEP=''; C_WARN=''; C_ERR=''; C_OK=''; C_OFF=''
fi

step() { printf '\n%s==> %s%s\n' "$C_STEP" "$*" "$C_OFF"; }
info() { printf '    %s\n' "$*"; }
skip() { printf '    %s (済んでいるので飛ばす)\n' "$*"; }
warn() { printf '%s[注意] %s%s\n' "$C_WARN" "$*" "$C_OFF" >&2; }
ok()   { printf '%s%s%s\n' "$C_OK" "$*" "$C_OFF"; }
die()  { printf '%s[中止] %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }

need_root() {
	[ "$(id -u)" -eq 0 ] || die "root で実行してください (make 経由なら sudo が付きます)"
	# 手元の Mac などで流してしまったときに、何かを触る前に止める
	if ! command -v systemctl >/dev/null 2>&1; then
		die "systemd のあるサーバーで実行してください ($(uname -s) の上で動いています。HOST= を付け忘れていませんか)"
	fi
}

need_var() {
	local name="$1"
	[ -n "${!name:-}" ] || die "$name が指定されていません"
}

# ---- 部品 -----------------------------------------------------------------

# .env の1項目を書き換える。無ければ足す。
# 値の中身をそのまま扱いたいので、awk には環境変数で渡す (sed だと / や & の逃がしが要る)
set_env() {
	local key="$1" val="$2" file="$3"
	ENV_KEY="$key" ENV_VAL="$val" awk '
		BEGIN { k = ENVIRON["ENV_KEY"]; v = ENVIRON["ENV_VAL"] }
		$0 ~ "^" k "=" { print k "=" v; found = 1; next }
		{ print }
		END { if (!found) print k "=" v }
	' "$file" > "$file.tmp"
	mv "$file.tmp" "$file"
}

installed() {
	[ -e "$APP_DIR" ] || [ -e "$UNIT" ]
}

# 起動を待つ。上がりきる前に curl を打つと落ちたように見えるので、少し粘る
wait_health() {
	local i out
	for i in $(seq 1 20); do
		if out="$(curl -fsS -m 3 "http://localhost:${PORT}/api/health" 2>/dev/null)"; then
			echo "$out"
			case "$out" in
				*'"aiConfigured":false'*)
					warn "aiConfigured が false。SAKURA_AI_TOKEN か SAKURA_AI_MODEL が読めていない" ;;
			esac
			return 0
		fi
		sleep 1
	done
	return 1
}

show_logs_tail() {
	echo
	journalctl -u "$SERVICE" -n 30 --no-pager || true
}

npm_in_app() {
	# npm は実行ユーザーのホームにキャッシュを作る。root で流す前提 (docs/deploy.md と同じ)
	( cd "$APP_DIR" && npm "$@" )
}

# better-sqlite3 はネイティブビルドが要る。npm がインストールスクリプトを
# 止めていると、ここのバイナリだけができない
build_native_if_needed() {
	local so="$APP_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
	if [ -f "$so" ]; then
		return 0
	fi
	warn "better-sqlite3 のネイティブビルドが無い。インストールスクリプトを承認して作り直す"
	npm_in_app install-scripts approve better-sqlite3 esbuild fsevents || true
	npm_in_app rebuild better-sqlite3
	[ -f "$so" ] || die "better-sqlite3 のビルドに失敗した。build-essential が入っているか確認すること"
}

git_in_app() { git -C "$APP_DIR" "$@"; }

# ---- サブコマンド ---------------------------------------------------------

cmd_install() {
	need_root

	step "すでに置かれていないか見る"
	if installed; then
		echo
		if [ -e "$APP_DIR" ]; then info "アプリがある: $APP_DIR"; fi
		if [ -e "$UNIT" ]; then info "ユニットがある: $UNIT"; fi
		die "すでにインストールされています。入れ替えるなら update を使ってください (make update)"
	fi
	info "まだ無い。新規インストールとして進める"

	need_var SAKURA_AI_TOKEN
	need_var GOOGLE_CLIENT_ID
	need_var SUPER_ADMIN_EMAILS

	install_packages
	install_node
	install_swap
	install_user

	step "リポジトリを置く: $APP_DIR ($REPO / $BRANCH)"
	if ! git clone --branch "$BRANCH" "$REPO" "$APP_DIR"; then
		die "clone に失敗した。ブランチ名が正しいか見ること (BRANCH=$BRANCH)"
	fi
	info "$(git_in_app rev-parse --short HEAD) $(git_in_app log -1 --format=%s)"

	step "依存を入れる (npm ci)"
	npm_in_app ci
	build_native_if_needed

	step "ビルドする (npm run build)"
	npm_in_app run build

	install_env
	install_service

	step "動いているか見る"
	if wait_health; then
		ok "起動しました"
	else
		show_logs_tail
		die "起動を確認できなかった。上のログを見ること"
	fi

	cat <<EOS

$(ok "インストールが終わりました。")

次にやること (自動化していない)

  1. HTTPS を終端する
       make https-caddy DOMAIN=kids.example.com    # 新しく立てるならこちら
       make https-nginx DOMAIN=kids.example.com    # すでに nginx が動いているなら
  2. ファイアウォール (SSH が切れる操作なので手でやる。docs/deploy.md の3章)
       sudo apt install -y ufw
       sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443
       sudo ufw enable
  3. 控えを日に1回まわす
       make backup-cron
  4. ブラウザで /admin に入り、SUPER_ADMIN_EMAILS のアカウントでログインして部屋を1つ作る
EOS
}

install_packages() {
	step "パッケージを入れる"
	export DEBIAN_FRONTEND=noninteractive
	apt-get update
	if [ "$APT_UPGRADE" = "1" ]; then
		apt-get -y -o Dpkg::Options::=--force-confold upgrade
	else
		skip "apt upgrade (APT_UPGRADE=0)"
	fi
	# build-essential は better-sqlite3 のビルド用、sqlite3 は backup.sh 用
	apt-get install -y git build-essential sqlite3 curl ca-certificates
}

install_node() {
	step "Node ${NODE_MAJOR} を用意する"
	local have=0
	if command -v node >/dev/null 2>&1; then
		have="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
	fi
	if [ "$have" -ge "$NODE_MAJOR" ] 2>/dev/null; then
		skip "Node $(node -v) が入っている"
		return
	fi
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
	DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
	info "node $(node -v) / npm $(npm -v)"
}

install_swap() {
	step "スワップを ${SWAP_SIZE} 作る"
	# 1コア1GBだと npm ci と vite build で足りなくなる
	if [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then
		skip "スワップが既に有効: $(swapon --show --noheadings | tr '\n' ' ')"
		return
	fi
	if [ ! -f "$SWAP_FILE" ]; then
		fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=2048
	fi
	chmod 600 "$SWAP_FILE"
	mkswap "$SWAP_FILE" >/dev/null
	swapon "$SWAP_FILE"
	if ! grep -q "^${SWAP_FILE} " /etc/fstab; then
		echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
	fi
	free -h
}

install_user() {
	step "サービス用のユーザーを作る ($SVC_USER)"
	# グループを先に作る。useradd --system だけだとプライマリグループが nogroup になり、
	# ユニットの Group=kidschat で起動に失敗することがある
	if getent group "$SVC_GROUP" >/dev/null; then
		skip "グループ $SVC_GROUP がある"
	else
		groupadd --system "$SVC_GROUP"
	fi
	if getent passwd "$SVC_USER" >/dev/null; then
		skip "ユーザー $SVC_USER がある"
	else
		useradd --system --gid "$SVC_GROUP" --home "$DATA_DIR" --shell /usr/sbin/nologin "$SVC_USER"
	fi
}

install_env() {
	step ".env を書く"
	local env_file="$APP_DIR/.env"
	cp "$APP_DIR/.env.example" "$env_file"

	set_env NODE_ENV production "$env_file"
	set_env PORT "$PORT" "$env_file"
	set_env DATA_DIR "$DATA_DIR" "$env_file"
	set_env SAKURA_AI_TOKEN "$SAKURA_AI_TOKEN" "$env_file"
	set_env GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID" "$env_file"
	set_env SUPER_ADMIN_EMAILS "$SUPER_ADMIN_EMAILS" "$env_file"

	# UPLOAD_DIR は消す。相対パスのまま残るとリポジトリの中を指し、
	# ProtectSystem=strict に阻まれて起動時に ENOENT で落ちる
	sed -i '/^UPLOAD_DIR=/d' "$env_file"

	chown "$SVC_USER:$SVC_GROUP" "$env_file"
	chmod 600 "$env_file"
	info "$(ls -l "$env_file")"
	info "秘密は伏せて表示する:"
	sed -E 's/^(SAKURA_AI_TOKEN|GOOGLE_CLIENT_ID)=.+/\1=****/' "$env_file" | grep -vE '^\s*(#|$)' | sed 's/^/      /'
}

install_service() {
	step "サービスを登録する ($SERVICE)"
	cp "$APP_DIR/deploy/dialogue-and-ai.service" "$UNIT"
	systemctl daemon-reload
	systemctl enable --now "$SERVICE"
	systemctl --no-pager --full status "$SERVICE" || true
}

cmd_update() {
	need_root
	[ -d "$APP_DIR/.git" ] || die "$APP_DIR にリポジトリが無い。まだ入っていないなら install を使ってください"

	step "控えを取る"
	if [ -f "$DATA_DIR/dialogue-and-ai.sqlite" ]; then
		DATA_DIR="$DATA_DIR" "$APP_DIR/deploy/backup.sh" "$BACKUP_DIR"
	else
		skip "DBがまだ無い ($DATA_DIR/dialogue-and-ai.sqlite)"
	fi

	local before after current
	before="$(git_in_app rev-parse --short HEAD)"
	current="$(git_in_app rev-parse --abbrev-ref HEAD)"
	step "いまのコミット: $before ($current)"
	info "戻すときは make rollback REF=$before"

	step "ソースを新しくする (origin/$BRANCH)"
	git_in_app fetch origin "$BRANCH"

	if [ "$current" != "$BRANCH" ]; then
		# 別のブランチを見ていたら乗り換える。detached HEAD もここで直る。
		# pull だと今いるブランチに origin/$BRANCH を混ぜてしまうので使わない
		warn "ブランチを切り替えます: $current -> $BRANCH"
		git_in_app checkout -B "$BRANCH" "origin/$BRANCH"
	else
		git_in_app merge --ff-only "origin/$BRANCH"
	fi
	after="$(git_in_app rev-parse --short HEAD)"

	if [ "$before" = "$after" ]; then
		ok "更新はありません ($BRANCH の $after のまま)。ビルドも再起動もしません"
		info ".env を書き換えただけなら make restart"
		return 0
	fi

	info "$before -> $after"
	git_in_app --no-pager log --oneline "$before..$after" | sed 's/^/      /'

	# .env は git pull では変わらない。項目が増えていたら手で足す作業が残る
	if ! git_in_app diff --quiet "$before" "$after" -- .env.example; then
		echo
		warn ".env.example に差分があります。必要なら $APP_DIR/.env に手で足して make restart"
		git_in_app --no-pager diff "$before" "$after" -- .env.example | sed 's/^/      /'
	fi

	apply_build "$before" "$after"
	restart_and_check "$before"
}

cmd_rollback() {
	need_root
	need_var REF
	[ -d "$APP_DIR/.git" ] || die "$APP_DIR にリポジトリが無い"

	local before
	before="$(git_in_app rev-parse --short HEAD)"
	step "$before から $REF に戻す"
	warn "DBは戻りません。会話や添付はそのまま残ります (戻すなら docs/deploy.md の6章)"
	git_in_app reset --hard "$REF"

	apply_build "$before" "$(git_in_app rev-parse --short HEAD)"
	restart_and_check "$before"
}

# 依存が変わっていたときだけ npm ci を流す。1コア1GBだと数分かかるので
apply_build() {
	local from="$1" to="$2"
	step "依存を見る (package-lock.json)"
	if [ -n "$FORCE_NPM_CI" ]; then
		info "FORCE_NPM_CI が指定されている"
		npm_in_app ci
		build_native_if_needed
	elif git_in_app diff --quiet "$from" "$to" -- package-lock.json; then
		skip "差分なし。npm ci は流さない"
	else
		info "差分あり。npm ci を流す"
		npm_in_app ci
		build_native_if_needed
	fi

	step "ビルドする (npm run build)"
	npm_in_app run build
}

restart_and_check() {
	local fallback="$1"
	step "再起動する"
	warn "開いている画面のSSEは全部切れます"
	systemctl restart "$SERVICE"

	step "動いているか見る"
	if wait_health; then
		ok "反映しました"
		info "更新の前から画面を開いたままの人は、再読み込みしてもらうこと"
	else
		show_logs_tail
		die "起動を確認できなかった。戻すなら make rollback REF=$fallback"
	fi
}

cmd_restart() {
	need_root
	systemctl restart "$SERVICE"
	wait_health || { show_logs_tail; die "起動を確認できなかった"; }
	ok "再起動しました"
}

cmd_status() {
	systemctl --no-pager --full status "$SERVICE" || true
	echo
	curl -fsS -m 3 "http://localhost:${PORT}/api/health" || echo "(health が返らない)"
	echo
}

cmd_health() {
	wait_health || die "health が返らない。make logs でログを見ること"
}

cmd_logs() {
	if [ -n "$FOLLOW" ]; then
		journalctl -u "$SERVICE" -f
	else
		journalctl -u "$SERVICE" -n "$LOG_LINES" --no-pager
	fi
}

cmd_backup() {
	need_root
	DATA_DIR="$DATA_DIR" "$APP_DIR/deploy/backup.sh" "$BACKUP_DIR"
	ls -1t "$BACKUP_DIR" | head -n 6 | sed 's/^/    /'
}

cmd_backup_cron() {
	need_root
	step "控えを日に1回まわす"
	local f=/etc/cron.d/dialogue-and-ai-backup
	printf '30 4 * * * root %s/deploy/backup.sh %s\n' "$APP_DIR" "$BACKUP_DIR" > "$f"
	chmod 644 "$f"
	info "$(cat "$f")"
	warn "同じサーバーの中に置くだけでは、サーバーごと失うと戻せません。手元にも落としておくこと"
}

cmd_https_caddy() {
	need_root
	need_var DOMAIN
	step "Caddy を入れる"
	DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
	# 他のサイトを載せている Caddyfile を上書きしてしまわないよう、控えを取る
	if [ -s /etc/caddy/Caddyfile ]; then
		cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)"
		info "いまの Caddyfile を .bak-* に控えた"
	fi
	sed "s/kids\.example\.com/$DOMAIN/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
	caddy validate --config /etc/caddy/Caddyfile
	# 入れただけでは起動していないので、初回は enable --now。reload だと落ちる
	systemctl enable --now caddy
	systemctl reload caddy
	step "証明書が取れたか見る"
	sleep 5
	journalctl -u caddy -n 40 --no-pager | grep -iE "certificate|error" || info "(まだ何も出ていない)"
	cat <<EOS

  取れていないときは上から順に見る (docs/deploy.md の3章)
    1. systemctl is-active caddy
    2. sudo ss -tlnp | grep -E ':(80|443)'
    3. dig +short $DOMAIN が自分のIPを返すか (Cloudflare の雲はグレーに)
    4. クラウド側のパケットフィルタで 80/443 を塞いでいないか
EOS
}

cmd_https_nginx() {
	need_root
	need_var DOMAIN
	step "nginx と certbot を入れる"
	DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx

	local avail=/etc/nginx/sites-available/dialogue-and-ai
	local full="$avail.full"
	sed "s/kids\.example\.com/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > "$full"
	ln -sf "$avail" /etc/nginx/sites-enabled/dialogue-and-ai

	if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
		info "証明書がある。443 まで含めて入れる"
		cp "$full" "$avail"
	else
		# 証明書がまだ無いまま 443 の server ブロックを入れると nginx -t が落ちる。
		# 先に 80 だけで通してから certbot を走らせる
		info "証明書がまだ無い。まず 80 だけで通す"
		awk '/^server \{/ { n++ } n < 2' "$full" > "$avail"
		nginx -t
		systemctl reload nginx

		if [ -n "$CERTBOT_EMAIL" ]; then
			step "証明書を取る ($DOMAIN)"
			certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL"
			cp "$full" "$avail"
		else
			rm -f "$full"
			nginx -t
			systemctl reload nginx
			warn "証明書がまだ取れていない。80 だけで動いています"
			cat <<EOS

  次のどちらかで証明書を取ってから、もう一度 make https-nginx を流す

    sudo certbot --nginx -d $DOMAIN                      # 対話で取る
    make https-nginx DOMAIN=$DOMAIN CERTBOT_EMAIL=you@example.com

EOS
			return 0
		fi
	fi

	rm -f "$full"
	nginx -t
	systemctl reload nginx
	ok "nginx を入れ替えました (https://$DOMAIN)"
	info "certbot が ssl_certificate の行を書き換えることがある。更新は certbot のタイマー任せでよい"
}

# ---- 振り分け -------------------------------------------------------------

case "$CMD" in
	install)     cmd_install ;;
	update)      cmd_update ;;
	rollback)    cmd_rollback ;;
	restart)     cmd_restart ;;
	status)      cmd_status ;;
	health)      cmd_health ;;
	logs)        cmd_logs ;;
	backup)      cmd_backup ;;
	backup-cron) cmd_backup_cron ;;
	https-caddy) cmd_https_caddy ;;
	https-nginx) cmd_https_nginx ;;
	*) die "知らないサブコマンド: $CMD" ;;
esac
