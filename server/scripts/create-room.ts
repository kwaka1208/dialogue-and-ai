/**
 * 開発用に部屋をひとつ作る。管理画面ができるまでの代用。
 *
 *   npm run room:new -w server
 *   npm run room:new -w server -- --name "ロボットのへや" --passcode 1234 --always
 *   npm run room:new -w server -- --name "そうだんのへや" --opinion
 *   npm run room:new -w server -- --owner admin@example.com
 *   npm run room:new -w server -- --model preview/gemma-4-31B-it --prompt-file ./prompt.txt
 *
 * --opinion を付けると意見モードの部屋になる。付けなければ会話モード。
 * --always は会話モードでだけ効く (AIが毎回返事をする)。
 * --model と --prompt-file は、いま選んでいるモードのぶんに入る。
 * 省略すれば既定 (.env と prompt.ts) のままになる。
 * --owner を付けないと所有者不明の部屋になり、管理画面では特権管理者にしか見えない。
 */
import fs from 'node:fs';
import { createRoom } from '../src/repos/rooms.js';
import { findAccountByEmail } from '../src/repos/admin-accounts.js';
import { config } from '../src/config.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const ownerEmail = flag('owner');
const owner = ownerEmail ? findAccountByEmail(ownerEmail) : null;
if (ownerEmail && !owner) {
  console.error(`管理者アカウントが見つかりません: ${ownerEmail}`);
  console.error('先に管理画面から登録するか、そのアカウントで一度ログインしてください。');
  process.exit(1);
}

const aiMode = process.argv.includes('--opinion') ? 'opinion' : 'chat';

const promptFile = flag('prompt-file');
if (promptFile && !fs.existsSync(promptFile)) {
  console.error(`system prompt のファイルが見つかりません: ${promptFile}`);
  process.exit(1);
}
const systemPrompt = promptFile ? fs.readFileSync(promptFile, 'utf8') : undefined;
const model = flag('model');

const room = createRoom({
  name: flag('name') ?? 'テストのへや',
  passcode: flag('passcode') ?? null,
  aiMode,
  replyMode: process.argv.includes('--always') ? 'always' : 'mention',
  // 選んだモードのぶんにだけ入れる。もう一方は既定のまま
  chatModel: aiMode === 'chat' ? model : undefined,
  opinionModel: aiMode === 'opinion' ? model : undefined,
  chatSystemPrompt: aiMode === 'chat' ? systemPrompt : undefined,
  opinionSystemPrompt: aiMode === 'opinion' ? systemPrompt : undefined,
  capacity: flag('capacity') ? Number(flag('capacity')) : undefined,
  expiresInHours: flag('hours') ? Number(flag('hours')) : undefined,
  createdBy: owner?.id ?? null,
});

console.log(`部屋を作りました: ${room.name}`);
console.log(`  部屋コード: ${room.code}`);
console.log(`  URL       : http://localhost:5173/r/${room.id}`);
console.log(`  合言葉    : ${room.passcodeHash ? (flag('passcode') ?? '(設定あり)') : 'なし'}`);
console.log(`  AIのモード: ${room.aiMode === 'opinion' ? '意見' : '会話'}`);
// 意見モードでは、AIが口を開くのは「いけんを きく」を押されたときだけ
if (room.aiMode === 'chat') console.log(`  返答モード: ${room.replyMode}`);
console.log(`  モデル    : ${model ?? '既定 (.env)'}`);
console.log(`  プロンプト: ${promptFile ?? '既定 (prompt.ts)'}`);
console.log(`  所有者    : ${owner ? owner.email : 'なし (特権管理者だけが見られます)'}`);
console.log(`  期限      : ${room.expiresAt}`);
console.log(`  DB        : ${config.dbPath}`);
