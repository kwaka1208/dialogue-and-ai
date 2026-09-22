import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * index.html の %SITE_URL% を、ビルド時の SITE_URL に差し替える。
 * og:url と og:image は絶対URLでないとSNS側が受け取らないが、ドメインは配置先ごとに違うので
 * ビルドのときに埋める。
 *
 * SITE_URL が無いときは、絶対URLが要るタグ (abs-url ブロック) をまとめて落とす。
 * %SITE_URL% を空にして残すと og:image が相対パス、og:url が "/" になり、どちらも
 * 「設定されているが無効」という、いちばん気づきにくい形になるため。
 * 落としてもプレビューが出ないだけで、画面自体は壊れない
 */
const ABS_URL_BLOCK = /[ \t]*<!-- abs-url:start -->[\s\S]*?<!-- abs-url:end -->\n?/;

function siteUrl(baseUrl: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => {
      if (!baseUrl) {
        console.warn(
          '[site-url] SITE_URL が未設定です。og:url と og:image を出力しません ' +
            '(リンクを貼ってもプレビューは出ません)。.env に SITE_URL を書いてビルドし直してください',
        );
        return html.replace(ABS_URL_BLOCK, '');
      }
      return html.replaceAll('%SITE_URL%', baseUrl);
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env はリポジトリの直下に1つだけ置く決まりなので、web/ ではなく親を見る。
  // 読むのは SITE_URL だけ。他の環境変数はフロントに混ぜない
  const env = loadEnv(mode, '..', ['SITE_URL']);

  return {
    plugins: [react(), siteUrl((env.SITE_URL ?? '').replace(/\/$/, ''))],
    server: {
      port: 5173,
      proxy: {
        // 開発中は BFF に転送する。本番では BFF が静的ファイルごと配信する
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
