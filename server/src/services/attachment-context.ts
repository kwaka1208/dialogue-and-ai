/**
 * 履歴に付いている添付を、AIに渡せる形に整える。
 *
 * - テキスト系 … 抽出ずみの中身を本文に添える
 * - 画像 … いちばん新しい1枚だけを data URI で渡す。
 *          子どもが何枚も上げても、見てほしいのはたいてい最後の1枚だし、
 *          画像はトークンを大きく食うので、ここで絞る
 * - PDF・その他 … ファイル名だけ伝える（PDFの抽出はフェーズ5では入れていない）
 */
import { listForMessages, type StoredAttachment } from '../repos/attachments.js';
import { readStoredFile } from '../lib/uploads.js';
import type { Message } from '../types.js';

/** 画像をAIに渡す上限。これを超える写真はファイル名だけ伝える */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface AttachmentPayload {
  originalName: string;
  /** 本文に添えるテキスト。無ければ null */
  text: string | null;
  /** 画像として渡すときの data URI。渡さないときは null */
  imageDataUrl: string | null;
}

export type AttachmentPayloads = Map<string, AttachmentPayload[]>;

/** 添付を読むのに失敗しても、AIの応答そのものは止めない */
async function toDataUrl(attachment: StoredAttachment): Promise<string | null> {
  if (attachment.size > MAX_IMAGE_BYTES) return null;
  try {
    const buffer = await readStoredFile(attachment.storedPath);
    return `data:${attachment.mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error(`[ai] 添付 ${attachment.id} を読めませんでした: ${String(error)}`);
    return null;
  }
}

/** 発言id → その発言の添付、という形で返す */
export async function buildAttachmentPayloads(history: Message[]): Promise<AttachmentPayloads> {
  const withAttachments = history.filter((message) => message.attachments.length > 0);
  if (withAttachments.length === 0) return new Map();

  const byMessage = listForMessages(withAttachments.map((message) => message.id));

  // いちばん新しい画像を1枚だけ選ぶ。履歴は古い順なので、後ろから探す
  const newestImage = [...byMessage.values()]
    .flat()
    .filter((attachment) => attachment.kind === 'image')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);

  const imageDataUrl = newestImage ? await toDataUrl(newestImage) : null;

  const payloads: AttachmentPayloads = new Map();
  for (const [messageId, attachments] of byMessage) {
    payloads.set(
      messageId,
      attachments.map((attachment) => ({
        originalName: attachment.originalName,
        text: attachment.extractedText,
        imageDataUrl: attachment.id === newestImage?.id ? imageDataUrl : null,
      })),
    );
  }

  return payloads;
}
