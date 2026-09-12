import { useEffect, useState } from 'react';

interface LeaveButtonProps {
  onLeave: () => void;
}

/** 聞き返しが消えるまでの時間。押しっぱなしの状態を残さない */
const RESET_MS = 5000;

/**
 * 部屋から出るボタン。押し間違いで会話が切れないように2回押させる。
 * 管理画面の強制退出と同じやり方で、確認ダイアログは出さない。
 */
export function LeaveButton({ onLeave }: LeaveButtonProps) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), RESET_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  const handleClick = (): void => {
    if (!asking) {
      setAsking(true);
      return;
    }
    setAsking(false);
    onLeave();
  };

  return (
    <button
      className={`text-button ${asking ? 'is-asking' : ''}`}
      type="button"
      onClick={handleClick}
    >
      {asking ? 'ほんとうに でる？' : 'でる'}
    </button>
  );
}
