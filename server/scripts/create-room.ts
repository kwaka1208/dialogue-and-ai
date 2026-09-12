/**
 * 開発用に部屋をひとつ作る。管理画面ができるまでの代用。
 *
 *   npm run room:new -w server
 *   npm run room:new -w server -- --name "ロボットのへや" --passcode 1234 --always
 */
import { createRoom } from '../src/repos/rooms.js';
import { config } from '../src/config.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const room = createRoom({
  name: flag('name') ?? 'テストのへや',
  passcode: flag('passcode') ?? null,
  replyMode: process.argv.includes('--always') ? 'always' : 'mention',
  capacity: flag('capacity') ? Number(flag('capacity')) : undefined,
  expiresInHours: flag('hours') ? Number(flag('hours')) : undefined,
});

console.log(`部屋を作りました: ${room.name}`);
console.log(`  URL       : http://localhost:5173/r/${room.id}`);
console.log(`  合言葉    : ${room.passcodeHash ? (flag('passcode') ?? '(設定あり)') : 'なし'}`);
console.log(`  返答モード: ${room.replyMode}`);
console.log(`  期限      : ${room.expiresAt}`);
console.log(`  DB        : ${config.dbPath}`);
