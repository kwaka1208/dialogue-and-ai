import * as api from '../api.ts';
import type { Attachment } from '../types.ts';

interface AttachmentListProps {
  roomId: string;
  attachments: Attachment[];
}

/** 種類ごとの目印。文字だけだと何のファイルか分かりにくいので */
const ICON: Record<Attachment['kind'], string> = {
  image: '🖼',
  text: '📄',
  pdf: '📕',
  other: '📎',
};

export function fileSizeText(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** 発言にぶら下がる添付。画像はそのまま見せ、ほかはファイル名のリンクにする */
export function AttachmentList({ roomId, attachments }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <ul className="attachment-list">
      {attachments.map((attachment) => {
        const url = api.attachmentUrl(roomId, attachment.id);

        return (
          <li key={attachment.id} className="attachment">
            {attachment.kind === 'image' ? (
              <a href={url} target="_blank" rel="noreferrer">
                <img className="attachment-image" src={url} alt={attachment.originalName} />
              </a>
            ) : (
              <a className="attachment-file" href={url}>
                <span aria-hidden="true">{ICON[attachment.kind]}</span>
                <span className="attachment-name">{attachment.originalName}</span>
                <span className="attachment-size">{fileSizeText(attachment.size)}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
