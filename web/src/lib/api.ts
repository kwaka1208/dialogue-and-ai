/** サーバーが返すエラーコードをそのまま持ち歩く。画面側で文言に変換する */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    // 管理セッションと参加者の cookie はどちらも同一オリジン。明示しておく
    credentials: 'same-origin',
    ...init,
    headers: {
      // FormData のときは境界つきの Content-Type をブラウザに決めさせる
      ...(typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? 'unknown_error');
  }

  return (await res.json()) as T;
}
