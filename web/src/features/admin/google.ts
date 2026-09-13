/**
 * Google Identity Services (GIS) の読み込みと、ログインボタンの描画。
 *
 * スクリプトはログイン画面を開いたときだけ足す。
 * 子どもが使う部屋の画面には Google のスクリプトを一切載せたくないため。
 */

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'small' | 'medium' | 'large';
      text?: 'signin_with' | 'signup_with' | 'continue_with';
      shape?: 'rectangular' | 'pill';
      locale?: string;
      width?: number;
    },
  ) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let loading: Promise<GoogleAccountsId> | null = null;

/** GIS のスクリプトを1回だけ読み込む。読めたら accounts.id を返す */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);

  loading ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => {
      const id = window.google?.accounts.id;
      if (id) resolve(id);
      else reject(new Error('Google のログインを初期化できませんでした'));
    });
    script.addEventListener('error', () =>
      reject(new Error('Google のログインを読み込めませんでした')),
    );

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    // 失敗を握ったままだと、再読み込みしても永遠に同じエラーになる
    loading = null;
    throw error;
  });

  return loading;
}

/** 指定の要素に Google のログインボタンを描く。押すと credential (ID トークン) が返る */
export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<void> {
  const accountsId = await loadGoogleIdentity();

  accountsId.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    // 管理画面なので、勝手にログインさせず必ず本人にボタンを押させる
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  accountsId.renderButton(parent, {
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    locale: 'ja',
  });
}

/** ログアウト時に呼ぶ。次に開いたとき、前のアカウントで自動的に入らないようにする */
export function forgetGoogleAccount(): void {
  window.google?.accounts.id.disableAutoSelect();
}
