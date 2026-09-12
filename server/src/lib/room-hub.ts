import type { ServerEvent } from '../types.js';

export interface Connection {
  participantId: string;
  displayName: string;
  push: (event: ServerEvent) => void;
}

/**
 * 部屋ごとの購読者。プロセス内メモリで持つ。
 * サーバーは1台なので分散は考えない。再起動すれば全員つなぎ直す。
 */
const connections = new Map<string, Set<Connection>>();

/** いま画面を開いている参加者。同じ子が複数タブを開いていても1人として数える */
export function presenceOf(roomId: string): Array<{ id: string; displayName: string }> {
  const set = connections.get(roomId);
  if (!set) return [];
  const byId = new Map<string, string>();
  for (const conn of set) byId.set(conn.participantId, conn.displayName);
  return [...byId].map(([id, displayName]) => ({ id, displayName }));
}

export function publish(roomId: string, event: ServerEvent): void {
  const set = connections.get(roomId);
  if (!set) return;
  for (const conn of set) conn.push(event);
}

/** 接続を登録し、解除用の関数を返す。presence の増減は自動で全員に配る */
export function addConnection(roomId: string, conn: Connection): () => void {
  let set = connections.get(roomId);
  if (!set) {
    set = new Set();
    connections.set(roomId, set);
  }
  set.add(conn);
  publish(roomId, { type: 'presence', participants: presenceOf(roomId) });

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    set.delete(conn);
    if (set.size === 0) connections.delete(roomId);
    publish(roomId, { type: 'presence', participants: presenceOf(roomId) });
  };
}

/** その参加者がいまどこかの画面を開いているか */
export function isConnected(roomId: string, participantId: string): boolean {
  const set = connections.get(roomId);
  if (!set) return false;
  for (const conn of set) {
    if (conn.participantId === participantId) return true;
  }
  return false;
}
