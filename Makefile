# kids-group-chat のデプロイ
#
# 手順の中身は docs/deploy.md と docs/update.md。ここはその入口で、
# 実際に動くのは deploy/remote.sh。
#
#   手元から SSH 越しに:  make update HOST=kids.example.com
#   サーバーの上で直接  :  cd /opt/kids-group-chat && sudo make update
#
# HOST を付ければ SSH 越し、付けなければその場で実行する。
# sudo のパスワードは、その1回の実行につき最初に1度だけ聞かれる。
#
# ---------------------------------------------------------------------------
# 設定値の出どころ
# ---------------------------------------------------------------------------
#
# 強いものから順に、次の4つ。このファイルを書き換えなくても済むようにしてある。
#
#   1. コマンドライン    make update HOST=kids.example.com
#   2. 環境変数          export SAKURA_AI_TOKEN=...   (シェルの履歴に残らない)
#   3. .env              手元の .env から読む (git には上げない。.gitignore 済み)
#   4. 下に並べた既定値  置き場所やサービス名など、docs/deploy.md に合わせたもの
#
# この Makefile 自体には、HOST も秘密も書かなくてよい。
#
# .env から読むのは次の項目だけ。無ければ既定値を使う。
#
#   HOST SSH_USER SSH_PORT      接続先
#   SAKURA_AI_TOKEN             install で .env を作るときに使う
#   GOOGLE_CLIENT_ID
#   SUPER_ADMIN_EMAILS
#   DOMAIN CERTBOT_EMAIL        HTTPS の終端で使う
#   REPO BRANCH SERVICE         ふだんは書かなくてよい
#
# DATA_DIR / APP_DIR / BACKUP_DIR / PORT / NODE_ENV は、.env にあっても読まない。
# 手元の .env は開発用で DATA_DIR=./data と NODE_ENV=development が入っており、
# これをデプロイに持ち込むと添付の置き場所がリポジトリの中を指し、
# ProtectSystem=strict に阻まれて起動時に ENOENT で落ちるため。
# サーバーの .env は make install が .env.example から作るもので、以後は
# git pull でも触らない (docs/update.md の5章)。これも読まない。
#
# 値はクォートで囲まないこと。行末の「 #」から先はコメントとして落とす。
# 別のファイルを読ませたいときは SETTINGS で指す: make update SETTINGS=staging.env

SHELL := /bin/bash

SETTINGS ?= .env

# $(SETTINGS) から1項目だけ読む。無ければ空。
# -include で丸ごと取り込まないのは、DATA_DIR のような開発用の値まで
# 混ざってくるのを避けるため (上のコメント)
envval = $(strip $(shell [ -f '$(SETTINGS)' ] && sed -n -E 's/^[[:space:]]*$(1)[[:space:]]*=[[:space:]]*//p' '$(SETTINGS)' | sed -E 's/[[:space:]]+\#.*$$//' | tail -n 1))

# ---- 接続先 ---------------------------------------------------------------

HOST     ?= $(call envval,HOST)
SSH_USER ?= $(or $(call envval,SSH_USER),ubuntu)
SSH_PORT ?= $(or $(call envval,SSH_PORT),22)
SSH_OPTS ?=

# ---- 置き場所 (docs/deploy.md に合わせてある) -----------------------------

APP_DIR    ?= /opt/kids-group-chat
DATA_DIR   ?= /var/lib/kids-group-chat
BACKUP_DIR ?= /var/backups/kids-group-chat
SERVICE    ?= $(or $(call envval,SERVICE),kids-group-chat)
REPO       ?= $(or $(call envval,REPO),https://github.com/kwaka1208/dojo-agent.git)
BRANCH     ?= $(or $(call envval,BRANCH),main)
PORT       ?= 8787

# ---- install のときだけ要るもの -------------------------------------------
# .env にあれば .env から。環境変数でも渡せる (export すれば履歴に残らない)

SAKURA_AI_TOKEN    ?= $(call envval,SAKURA_AI_TOKEN)
GOOGLE_CLIENT_ID   ?= $(call envval,GOOGLE_CLIENT_ID)
SUPER_ADMIN_EMAILS ?= $(call envval,SUPER_ADMIN_EMAILS)

# ---- そのほか -------------------------------------------------------------

DOMAIN        ?= $(call envval,DOMAIN)
CERTBOT_EMAIL ?= $(call envval,CERTBOT_EMAIL)
REF           ?=
FORCE_NPM_CI  ?=
APT_UPGRADE   ?= 1
LOG_LINES     ?= 50
FOLLOW        ?=

# サーバー側にスクリプトを置く場所 (SSH_USER のホームの下)
STAGE ?= .kids-group-chat-deploy

MAKEFILE_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
SSH_TARGET   := $(SSH_USER)@$(HOST)
SSH_FLAGS    := -p $(SSH_PORT) $(SSH_OPTS)
SCP_FLAGS    := -q -P $(SSH_PORT) $(SSH_OPTS)

# deploy/remote.sh を呼ぶ。
#   $(1) サブコマンド
#   $(2) root で走らせるなら sudo、読むだけなら空
#
# 秘密 (SAKURA_AI_TOKEN など) は引数に置かない。600 の設定ファイルに書いて渡し、
# remote.sh が読んだ直後に消す。ps に出ないのはこのため。
define run
	@set -eu; \
	umask 077; \
	conf="$$(mktemp "$${TMPDIR:-/tmp}/kgc-deploy.XXXXXX")"; \
	trap 'rm -f "$$conf"' EXIT HUP INT TERM; \
	{ \
		printf "APP_DIR='%s'\n"            '$(APP_DIR)'; \
		printf "DATA_DIR='%s'\n"           '$(DATA_DIR)'; \
		printf "BACKUP_DIR='%s'\n"         '$(BACKUP_DIR)'; \
		printf "SERVICE='%s'\n"            '$(SERVICE)'; \
		printf "REPO='%s'\n"               '$(REPO)'; \
		printf "BRANCH='%s'\n"             '$(BRANCH)'; \
		printf "PORT='%s'\n"               '$(PORT)'; \
		printf "SAKURA_AI_TOKEN='%s'\n"    '$(SAKURA_AI_TOKEN)'; \
		printf "GOOGLE_CLIENT_ID='%s'\n"   '$(GOOGLE_CLIENT_ID)'; \
		printf "SUPER_ADMIN_EMAILS='%s'\n" '$(SUPER_ADMIN_EMAILS)'; \
		printf "DOMAIN='%s'\n"             '$(DOMAIN)'; \
		printf "CERTBOT_EMAIL='%s'\n"      '$(CERTBOT_EMAIL)'; \
		printf "REF='%s'\n"                '$(REF)'; \
		printf "FORCE_NPM_CI='%s'\n"       '$(FORCE_NPM_CI)'; \
		printf "APT_UPGRADE='%s'\n"        '$(APT_UPGRADE)'; \
		printf "LOG_LINES='%s'\n"          '$(LOG_LINES)'; \
		printf "FOLLOW='%s'\n"             '$(FOLLOW)'; \
	} > "$$conf"; \
	if [ -n '$(HOST)' ]; then \
		ssh $(SSH_FLAGS) $(SSH_TARGET) 'mkdir -p $(STAGE) && chmod 700 $(STAGE)'; \
		scp $(SCP_FLAGS) '$(MAKEFILE_DIR)/deploy/remote.sh' $(SSH_TARGET):$(STAGE)/remote.sh; \
		scp $(SCP_FLAGS) "$$conf" $(SSH_TARGET):$(STAGE)/conf; \
		ssh -t $(SSH_FLAGS) $(SSH_TARGET) '$(2) bash $(STAGE)/remote.sh $(1) $(STAGE)/conf'; \
		ssh $(SSH_FLAGS) $(SSH_TARGET) 'rm -rf $(STAGE)'; \
	else \
		$(2) bash '$(MAKEFILE_DIR)/deploy/remote.sh' $(1) "$$conf"; \
	fi
endef

.DEFAULT_GOAL := help
.PHONY: help install update rollback restart status health logs backup backup-cron \
        https-caddy https-nginx _need-install-vars _need-domain _need-ref _need-abs-paths

## ----------------------------------------------------------------------------

help:
	@echo ''
	@echo 'kids-group-chat のデプロイ'
	@echo ''
	@echo '  make install HOST=... SAKURA_AI_TOKEN=... GOOGLE_CLIENT_ID=... SUPER_ADMIN_EMAILS=...'
	@echo '                        新規インストール。すでに入っていれば何もせず止まる'
	@echo '  make update  HOST=...  控えを取ってから git pull → build → 再起動'
	@echo ''
	@echo '  make status  HOST=...  サービスの状態と /api/health'
	@echo '  make health  HOST=...  /api/health だけ'
	@echo '  make logs    HOST=...  journalctl (FOLLOW=1 で追いかける、LOG_LINES=200 で行数)'
	@echo '  make restart HOST=...  再起動 (.env を書き換えたときなど)'
	@echo '  make backup  HOST=...  控えを1回取る'
	@echo '  make backup-cron HOST=...       控えを日に1回まわす (cron.d に置く)'
	@echo '  make rollback HOST=... REF=abc1234   前のコミットに戻す'
	@echo ''
	@echo '  make https-caddy HOST=... DOMAIN=kids.example.com'
	@echo '  make https-nginx HOST=... DOMAIN=kids.example.com [CERTBOT_EMAIL=you@example.com]'
	@echo ''
	@echo '  HOST を付けると SSH 越しに、付けないとその場で実行する。'
	@echo '  サーバーの上でやるなら: cd $(APP_DIR) && sudo make update'
	@echo ''
	@echo '  HOST・DOMAIN・秘密は手元の .env からも読む (DATA_DIR などは読まない)。'
	@echo '  .env に書いておけば、引数なしで make install / make update と打てる。'
	@echo '  環境変数でも渡せる: export SAKURA_AI_TOKEN=...; make install'
	@echo ''
	@echo '  ファイアウォール (ufw) は SSH が切れるので自動化していない。'
	@echo '  docs/deploy.md の3章を見て手でやること。'
	@echo ''

## 新規インストール。すでに入っていれば何もしない
install: _need-abs-paths _need-install-vars
	$(call run,install,sudo)

## 入っているものを更新する
update: _need-abs-paths
	$(call run,update,sudo)

## 前のコミットに戻す (DBは戻らない)
rollback: _need-abs-paths _need-ref
	$(call run,rollback,sudo)

restart:
	$(call run,restart,sudo)

backup:
	$(call run,backup,sudo)

backup-cron:
	$(call run,backup-cron,sudo)

https-caddy: _need-domain
	$(call run,https-caddy,sudo)

https-nginx: _need-domain
	$(call run,https-nginx,sudo)

# 読むだけなので sudo は付けない (パスワードを聞かれない)
status:
	$(call run,status,)

health:
	$(call run,health,)

logs:
	$(call run,logs,)

## ----------------------------------------------------------------------------

_need-install-vars:
	@missing=''; \
	[ -n '$(SAKURA_AI_TOKEN)' ]    || missing="$$missing SAKURA_AI_TOKEN"; \
	[ -n '$(GOOGLE_CLIENT_ID)' ]   || missing="$$missing GOOGLE_CLIENT_ID"; \
	[ -n '$(SUPER_ADMIN_EMAILS)' ] || missing="$$missing SUPER_ADMIN_EMAILS"; \
	if [ -n "$$missing" ]; then \
		echo "install には次の指定が要ります:$$missing" >&2; \
		echo '' >&2; \
		echo '  make install HOST=kids.example.com \' >&2; \
		echo '    SAKURA_AI_TOKEN=xxx \' >&2; \
		echo '    GOOGLE_CLIENT_ID=yyy.apps.googleusercontent.com \' >&2; \
		echo '    SUPER_ADMIN_EMAILS=you@example.com' >&2; \
		exit 1; \
	fi

# deploy.env に開発用の相対パスが紛れ込んだときに、気づかず流してしまわないように
_need-abs-paths:
	@for pair in 'APP_DIR=$(APP_DIR)' 'DATA_DIR=$(DATA_DIR)' 'BACKUP_DIR=$(BACKUP_DIR)'; do \
		case "$${pair#*=}" in \
			/*) ;; \
			*) echo "$${pair%%=*} は絶対パスで指定してください (いまは $${pair#*=})" >&2; exit 1 ;; \
		esac; \
	done

_need-domain:
	@[ -n '$(DOMAIN)' ] || { echo 'DOMAIN を指定してください (例: DOMAIN=kids.example.com)' >&2; exit 1; }

_need-ref:
	@[ -n '$(REF)' ] || { echo 'REF を指定してください (例: REF=abc1234)。make logs や git log で控えたコミット' >&2; exit 1; }
