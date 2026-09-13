/** 管理画面の表示用の整形。大人が読む画面なので、ひらがな寄りにはしない */

export function dateTimeText(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeText(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/** 期限までの残り。過ぎていたら「終了」 */
export function remainingText(expiresAt: string, now = Date.now()): string {
  const minutes = Math.floor((new Date(expiresAt).getTime() - now) / 60_000);
  if (minutes <= 0) return '終了';
  if (minutes < 60) return `あと${minutes}分`;
  return `あと${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

