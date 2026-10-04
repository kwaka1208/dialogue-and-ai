/**
 * 部屋に流すお知らせ (kind='system' の発言) の文言。
 * 部屋の対象で言い分ける。子ども向けはひらがな、大人向けは漢字まじり。
 */
import type { AiMode, Audience } from '../types.js';

interface NoticeWords {
  joined: (name: string) => string;
  left: (name: string) => string;
  askedOpinion: (name: string) => string;
  /** AIが答えられなかったとき。モードで「返事」と「意見」を言い分ける */
  failed: Record<AiMode, { timeout: string; error: string }>;
}

const NOTICES: Record<Audience, NoticeWords> = {
  kids: {
    joined: (name) => `${name} さんが はいりました`,
    left: (name) => `${name} さんが でていきました`,
    askedOpinion: (name) => `${name} さんが AIに いけんを ききました`,
    failed: {
      chat: {
        timeout: 'AIの おへんじが おそいので やめました。もういちど きいてみてね',
        error: 'いま AIと おはなし できないみたい。すこし してから もういちど きいてね',
      },
      opinion: {
        timeout: 'AIの いけんが おそいので やめました。もういちど きいてみてね',
        error: 'いま AIに いけんを きけないみたい。すこし してから もういちど きいてね',
      },
    },
  },
  adult: {
    joined: (name) => `${name} さんが入室しました`,
    left: (name) => `${name} さんが退出しました`,
    askedOpinion: (name) => `${name} さんがAIに意見を求めました`,
    failed: {
      chat: {
        timeout: 'AIの応答に時間がかかりすぎたため中断しました。もう一度お試しください',
        error: '現在AIが応答できません。しばらくしてからもう一度お試しください',
      },
      opinion: {
        timeout: 'AIの意見の生成に時間がかかりすぎたため中断しました。もう一度お試しください',
        error: '現在AIに意見を求められません。しばらくしてからもう一度お試しください',
      },
    },
  },
};

export function noticesFor(audience: Audience): NoticeWords {
  return NOTICES[audience];
}
