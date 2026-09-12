import { useCallback, useEffect, useRef, useState } from 'react';

/** この距離より下にいれば「いちばん下にいる」とみなす */
const BOTTOM_THRESHOLD_PX = 80;

interface StickToBottom {
  /** スクロールする箱に付ける */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 箱のいちばん下に置く目印に付ける */
  bottomRef: React.RefObject<HTMLDivElement | null>;
  atBottom: boolean;
  jumpToBottom: () => void;
}

/**
 * 新しい発言が増えたら下まで送る。ただし、上に戻って読んでいるあいだは動かさない。
 * 引っぱられると前の発言を読み返せないので、戻るかどうかは読んでいる子に任せる。
 *
 * `key` が変わったときに追いかける。件数だけでは足りない（AIの本文は件数が
 * 増えないまま伸びる）ので、呼ぶ側で末尾の長さも混ぜた文字列を渡す。
 */
export function useStickToBottom(key: string): StickToBottom {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  // ブラウザのスクロール位置という外部状態の購読
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = (): void => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      setAtBottom(distance < BOTTOM_THRESHOLD_PX);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!atBottom) return;
    const element = scrollRef.current;
    if (!element) return;

    // 1画面より離れているとき (開いた直後など) は一気に飛ばす。
    // その距離を滑らかに送ろうとすると、最後まで届かないまま止まることがある
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    bottomRef.current?.scrollIntoView({
      behavior: distance > element.clientHeight ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [key, atBottom]);

  return { scrollRef, bottomRef, atBottom, jumpToBottom };
}
