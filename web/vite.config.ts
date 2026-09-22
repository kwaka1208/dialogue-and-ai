import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * index.html の %SITE_URL% を、ビルド時の SITE_URL に差し替える。
 * og:image は絶対URLでないとSNS側がプレビューを出さないが、ドメインは配置先ごとに違うので
 * ビルドのときに埋める。未設定なら相対パスとして残すだけで、画面自体は壊れない
 */
function siteUrl(baseUrl: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', baseUrl),
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
