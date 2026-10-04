/**
 * 部屋画面の文言。部屋の対象 (子ども向け / 大人向け) で言い分ける。
 *
 * 子ども向けは、小学生が読めるようにひらがなと分かち書きにする。
 * 大人向けは、ふつうの漢字まじりの表記にして、大人が使って違和感のない画面にする。
 *
 * エラーやAIのお知らせの文言は messages.ts にある。
 */
import type { Audience } from './types.ts';

export interface RoomCopy {
  // 入室前・入室できないとき
  roomClosed: string;
  kicked: string;
  // 入室フォーム
  nameLabel: string;
  namePlaceholder: string;
  nameHint: string;
  passcodeLabel: string;
  passcodePlaceholder: string;
  joining: string;
  join: string;
  promiseTitle: string;
  promiseLines: string[];
  // ヘッダー
  reconnecting: string;
  participantCount: (count: number) => string;
  me: string;
  leave: string;
  leaveConfirm: string;
  // タイムライン
  loadError: string;
  jumpToLatest: string;
  aiSpeakerChat: string;
  aiSpeakerOpinion: string;
  self: string;
  unknownSpeaker: string;
  thinking: string;
  stop: string;
  // 意見モードのボタン
  askOpinion: string;
  askOpinionHint: string;
  askOpinionTitle: string;
  askOpinionBusy: string;
  aiResting: string;
  // 入力欄
  placeholder: string;
  placeholderClosed: string;
  inputLabel: string;
  send: string;
  sendNoAi: string;
  askAi: string;
  askAiTitle: string;
  askAiBusy: string;
  attach: string;
  attachTitle: string;
  attachLimit: (max: number) => string;
  uploading: string;
  removeFileTitle: string;
  removeFileLabel: (name: string) => string;
}

const KIDS: RoomCopy = {
  roomClosed: 'この へやは おわりました',
  kicked: 'この へやから でました。おとなの人に きいてね。',
  nameLabel: 'なまえ',
  namePlaceholder: 'たろう',
  nameHint: '1〜12もじ。ほんとうの なまえで なくても いいよ',
  passcodeLabel: 'あいことば',
  passcodePlaceholder: '4けたの すうじ',
  joining: 'はいっています…',
  join: 'はいる',
  promiseTitle: 'やくそく',
  promiseLines: [
    'ここで はなしたことは、おとなが あとから ぜんぶ よめます。',
    'じゅうしょ・がっこうの なまえ・でんわばんごうは かかないでね。',
  ],
  reconnecting: 'つなぎなおしています…',
  participantCount: (count) => `いま ${count}人`,
  me: '（あなた）',
  leave: 'でる',
  leaveConfirm: 'ほんとうに でる？',
  loadError: 'いままでの はなしを よみこめませんでした',
  jumpToLatest: '↓ あたらしい はなし',
  aiSpeakerChat: 'AI',
  aiSpeakerOpinion: 'AIの いけん',
  self: 'じぶん',
  unknownSpeaker: 'だれか',
  thinking: 'かんがえちゅう',
  stop: '■ とめる',
  askOpinion: '🤖 AIに いけんを きく',
  askOpinionHint: 'ここまでの みんなの はなしを 見て、AIが いけんを いいます',
  askOpinionTitle: 'ここまでの はなしについて AIの いけんを きく',
  askOpinionBusy: 'AIが いけんを かいているよ',
  aiResting: 'いまは AIが おやすみちゅう',
  placeholder: 'メッセージを かこう',
  placeholderClosed: 'この へやは おわりました',
  inputLabel: 'メッセージ',
  send: 'いう',
  sendNoAi: 'おくる',
  askAi: '🤖 AIに きく',
  askAiTitle: 'AIに こたえてもらう',
  askAiBusy: 'AIが おへんじを かいているよ',
  attach: '📎 ファイル',
  attachTitle: 'ファイルを つける',
  attachLimit: (max) => `ファイルは ${max}こまで`,
  uploading: 'おくってます…',
  removeFileTitle: 'この ファイルを やめる',
  removeFileLabel: (name) => `${name} を やめる`,
};

const ADULT: RoomCopy = {
  roomClosed: 'この部屋は終了しました',
  kicked: 'この部屋から退出しました。詳しくは主催者にお問い合わせください。',
  nameLabel: '表示名',
  namePlaceholder: '山田',
  nameHint: '1〜12文字。本名でなくてもかまいません',
  passcodeLabel: '合言葉',
  passcodePlaceholder: '4桁の数字',
  joining: '入室中…',
  join: '入室する',
  promiseTitle: 'ご利用にあたって',
  promiseLines: [
    'この部屋での発言は、主催者があとから閲覧できます。',
    '個人情報や社外秘の情報は書き込まないでください。',
  ],
  reconnecting: '再接続しています…',
  participantCount: (count) => `参加中 ${count}人`,
  me: '（あなた）',
  leave: '退出',
  leaveConfirm: '退出しますか？',
  loadError: 'これまでの発言を読み込めませんでした',
  jumpToLatest: '↓ 最新の発言へ',
  aiSpeakerChat: 'AI',
  aiSpeakerOpinion: 'AIの意見',
  self: '自分',
  unknownSpeaker: '不明な参加者',
  thinking: '考え中',
  stop: '■ 停止',
  askOpinion: '🤖 AIの意見を聞く',
  askOpinionHint: 'ここまでの議論を踏まえて、AIが意見を述べます',
  askOpinionTitle: 'ここまでの議論についてAIの意見を聞く',
  askOpinionBusy: 'AIが意見を作成中です',
  aiResting: '現在AIは利用できません',
  placeholder: 'メッセージを入力',
  placeholderClosed: 'この部屋は終了しました',
  inputLabel: 'メッセージ',
  send: '送信',
  sendNoAi: '送信',
  askAi: '🤖 AIに質問',
  askAiTitle: 'このメッセージを送ってAIに回答してもらう',
  askAiBusy: 'AIが回答を作成中です',
  attach: '📎 ファイル',
  attachTitle: 'ファイルを添付',
  attachLimit: (max) => `ファイルは${max}件まで`,
  uploading: '送信中…',
  removeFileTitle: 'このファイルを取り消す',
  removeFileLabel: (name) => `${name} を取り消す`,
};

const COPY: Record<Audience, RoomCopy> = { kids: KIDS, adult: ADULT };

export function copyFor(audience: Audience): RoomCopy {
  return COPY[audience];
}
