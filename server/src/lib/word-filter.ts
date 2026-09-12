/**
 * 簡易的なNGワード判定。ハンドオフ10章の「最後の網ではない」フィルタ。
 *
 * 引っかかった発言も部屋には出す。大人が同じ部屋にいて声をかけられる状態を前提にしているので、
 * 会話を止めるより、見えたまま印が残るほうが扱いやすい。やることは2つだけ。
 *
 * - その発言ではAIを動かさない
 * - 管理画面のログに印を付ける
 *
 * 語のリストは出発点でしかない。集まる子どもと場に合わせて、`NG_WORDS_FILE` で差し替える。
 */
import fs from 'node:fs';
import { config } from '../config.js';

/**
 * 既定のリスト。短いひらがなは別の語の一部に紛れ込む（「わたしねむい」に「しね」が入る）ので、
 * ひらがなは3文字以上の形だけを並べている。
 */
const DEFAULT_NG_WORDS = [
  // 暴力・自傷
  '死ね',
  'しねよ',
  'しねばいい',
  '殺す',
  '殺し',
  'ころす',
  'ころして',
  'ころしたい',
  '自殺',
  'じさつ',
  'くたばれ',
  // 性的
  'せっくす',
  'ちんこ',
  'まんこ',
  'えろい',
  // 人を傷つける言い方
  'きえろ',
  'うんこやろう',
];

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;

/**
 * 表記のゆれを畳む。全角と半角、カタカナとひらがな、あいだに挟んだ記号を同じ形にする。
 *
 * 空白は落とさない。「し ね」のような書き方は拾えなくなるが、落とすと「わたし ねむい」まで
 * 引っかかる。ここは拾い漏れるほうを選ぶ。
 */
export function normalizeForFilter(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => {
      const code = char.charCodeAt(0);
      return code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCharCode(code - 0x60)
        : char;
    })
    .replace(/[\p{P}\p{S}ー〜]/gu, '');
}

function loadWords(): string[] {
  const source = config.ngWordsFile;
  if (!source) return DEFAULT_NG_WORDS;

  let text: string;
  try {
    text = fs.readFileSync(source, 'utf8');
  } catch {
    console.warn(`NG_WORDS_FILE を読めませんでした: ${source}。既定のリストを使います。`);
    return DEFAULT_NG_WORDS;
  }

  // 1行1語。# から先はコメント
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line !== '');
}

let words: string[] | null = null;

/** 正規化ずみのリスト。最初に呼ばれたときだけ読む */
function ngWords(): string[] {
  if (words) return words;
  words = loadWords().map(normalizeForFilter).filter((word) => word !== '');
  return words;
}

/** テストと、起動時のログのために開けてある */
export function resetNgWords(): void {
  words = null;
}

export function containsNgWord(body: string): boolean {
  if (body.trim() === '') return false;
  const normalized = normalizeForFilter(body);
  return ngWords().some((word) => normalized.includes(word));
}

export function ngWordCount(): number {
  return ngWords().length;
}
