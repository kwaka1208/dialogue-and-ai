/** DBに入れる時刻はすべてISO 8601 (UTC) の文字列で統一する */
export function nowIso(): string {
  return new Date().toISOString();
}

export function isoAfterHours(hours: number, from = new Date()): string {
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function isPast(iso: string, at = new Date()): boolean {
  return new Date(iso).getTime() <= at.getTime();
}
