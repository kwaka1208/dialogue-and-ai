/**
 * 添付ファイルの受け入れ判定と保存。
 * ハンドオフ 4.4（拡張子は allowlist 方式、実行可能形式は受け付けない）に対応する。
 *
 * 種類の判断は「拡張子」だけで行う。ブラウザが送ってくる Content-Type は信用せず、
 * 保存も配信もこの表で決めた MIME を使う。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { randomId } from './ids.js';
import type { AttachmentKind } from '../types.js';

/** 1ファイルあたりの上限 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 1回の発言に付けられる数 */
export const MAX_FILES_PER_MESSAGE = 3;

/** AIに渡すテキストの上限。これを超えたぶんは打ち切る */
export const MAX_EXTRACTED_CHARS = 10_000;

interface AllowedType {
  mimeType: string;
  kind: AttachmentKind;
}

const ALLOWED: Record<string, AllowedType> = {
  '.png': { mimeType: 'image/png', kind: 'image' },
  '.jpg': { mimeType: 'image/jpeg', kind: 'image' },
  '.jpeg': { mimeType: 'image/jpeg', kind: 'image' },
  '.gif': { mimeType: 'image/gif', kind: 'image' },
  '.webp': { mimeType: 'image/webp', kind: 'image' },
  '.txt': { mimeType: 'text/plain; charset=utf-8', kind: 'text' },
  '.md': { mimeType: 'text/plain; charset=utf-8', kind: 'text' },
  '.csv': { mimeType: 'text/plain; charset=utf-8', kind: 'text' },
  '.pdf': { mimeType: 'application/pdf', kind: 'pdf' },
};

/** input[type=file] の accept に渡す文字列 */
export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED).join(',');

export type RejectReason = 'unsupported_type' | 'file_too_large' | 'empty_file';

export class UploadRejected extends Error {
  constructor(readonly reason: RejectReason) {
    super(reason);
    this.name = 'UploadRejected';
  }
}

/** 拡張子から扱いを引く。表にないものは弾く */
export function typeOf(fileName: string): AllowedType {
  const type = ALLOWED[path.extname(fileName).toLowerCase()];
  if (!type) throw new UploadRejected('unsupported_type');
  return type;
}

/** 保存ずみの行から種類を引く。表から外れた拡張子は「その他」として扱う */
export function kindOf(fileName: string): AttachmentKind {
  return ALLOWED[path.extname(fileName).toLowerCase()]?.kind ?? 'other';
}

/** 保存名に使われないよう、パス区切りと制御文字を落とす */
export function cleanFileName(raw: string): string {
  const base = path.basename(raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base.slice(0, 120) || 'file';
}

export interface StoredFile {
  /** uploadDir からの相対パス */
  storedPath: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  originalName: string;
  extractedText: string | null;
}

/**
 * 受け取ったファイルを部屋ごとのディレクトリに保存する。
 * 保存名はランダムなので、同じ名前のファイルが来てもぶつからない。
 */
export async function storeFile(roomId: string, file: File): Promise<StoredFile> {
  const originalName = cleanFileName(file.name);
  const { mimeType, kind } = typeOf(originalName);

  if (file.size === 0) throw new UploadRejected('empty_file');
  if (file.size > MAX_FILE_BYTES) throw new UploadRejected('file_too_large');

  const buffer = Buffer.from(await file.arrayBuffer());
  // Content-Length を信じずに、実際に読めたサイズでもう一度見る
  if (buffer.byteLength > MAX_FILE_BYTES) throw new UploadRejected('file_too_large');

  const storedPath = path.join(roomId, `${randomId(24)}${path.extname(originalName).toLowerCase()}`);
  const absolute = path.join(config.uploadDir, storedPath);

  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);

  return {
    storedPath,
    mimeType,
    kind,
    size: buffer.byteLength,
    originalName,
    extractedText: kind === 'text' ? extractText(buffer) : null,
  };
}

/**
 * テキスト系の中身を読む。UTF-8 以外は文字化けするが、
 * 子どもが上げるファイルはほぼ UTF-8 なので変換はしない。
 */
function extractText(buffer: Buffer): string {
  const text = buffer.toString('utf8').replace(/\u0000/g, '');
  return text.length > MAX_EXTRACTED_CHARS
    ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n…(ながいので ここまで)`
    : text;
}

export function absolutePathOf(storedPath: string): string {
  return path.join(config.uploadDir, storedPath);
}

export async function readStoredFile(storedPath: string): Promise<Buffer> {
  return fs.readFile(absolutePathOf(storedPath));
}

/** 発言に紐づかないまま捨てられた添付を、実体ごと消す */
export async function removeStoredFile(storedPath: string): Promise<void> {
  await fs.rm(absolutePathOf(storedPath), { force: true });
}

/**
 * 部屋ごとの保存ディレクトリを、中身ごと消す。部屋を削除するときに呼ぶ。
 * storedPath の先頭が部屋IDなので、部屋の添付はここにまとまっている。
 */
export async function removeRoomDir(roomId: string): Promise<void> {
  // roomId は base62 のランダム文字列だが、パスに使う前に念のため確かめる
  if (!/^[0-9A-Za-z]+$/.test(roomId)) return;
  await fs.rm(path.join(config.uploadDir, roomId), { recursive: true, force: true });
}
