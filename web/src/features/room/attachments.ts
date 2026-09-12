/**
 * 添付の上限と、選べるファイルの種類。
 * ほんとうの判定はサーバー（server/src/lib/uploads.ts）がする。ここは選ぶ前の案内用なので、
 * 片方を変えたらもう片方も直すこと。
 */

export const MAX_FILES_PER_MESSAGE = 3;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPT_ATTRIBUTE = '.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.pdf';
