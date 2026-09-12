/**
 * モデルの出力から Markdown の飾りを落とす。
 *
 * 画面は本文をそのまま文字として出すので (MessageItem)、`**つよい**` のような
 * 記法は記号のまま子どもに見えてしまう。system prompt でも「記号でかざらない」と
 * 書いているが、破られる前提でここでも落とす。
 *
 * 落とすのは飾りだと確実に言えるものだけ。単独の `*` は `2*3` のような本文を
 * 壊すので残す。バッククォートも同じ理由で触らない。
 */

/** 行頭の飾り。見出しと箇条書きだけ見る */
const LINE_LEAD = /^(?:#{1,6}[ \t]+|[-*+][ \t]+)/;

/** 続きが来れば行頭の飾りになるかもしれない形。`###` や `-` だけで届いたとき */
const PARTIAL_LEAD = /^(?:#{1,6}|[-*+])[ \t]*$/;

/** '###### ' の長さ。これを超えたら飾りではない */
const LEAD_MAX = 7;

export interface PlainTextFilter {
  /** 届いた差分のうち、飾りを落として確定できたぶんを返す */
  push(chunk: string): string;
  /** 判定待ちで抱えていたぶんを吐き出す。ストリームの終わりに1回だけ呼ぶ */
  flush(): string;
}

/**
 * ストリーミング用。1文字ずつ見て、判定がつかない末尾だけ次の差分まで持ち越す。
 * 持ち越すのは長くても LEAD_MAX 文字なので、表示が目に見えて遅れることはない。
 */
export function createPlainTextFilter(): PlainTextFilter {
  let buffer = '';
  let atLineStart = true;

  const consume = (final: boolean): string => {
    let out = '';
    let i = 0;

    while (i < buffer.length) {
      if (atLineStart) {
        const rest = buffer.slice(i);
        const lead = LINE_LEAD.exec(rest);

        if (lead) {
          // 箇条書きは中黒にする。見出しの記号はそのまま消す
          if (/^[-*+]/.test(lead[0])) out += '・';
          i += lead[0].length;
          atLineStart = false;
          continue;
        }
        // 飾りになりうる形のまま途切れている。続きが来るまで待つ
        if (!final && rest.length < LEAD_MAX && PARTIAL_LEAD.test(rest)) break;

        atLineStart = false;
        continue; // 同じ位置を本文として見なおす
      }

      const char = buffer[i]!;

      if (char === '\n') {
        out += char;
        atLineStart = true;
        i += 1;
        continue;
      }

      if (char === '*' || char === '_') {
        const next = buffer[i + 1];
        // 2文字目が来ないと太字かどうか決められない
        if (next === undefined && !final) break;
        if (next === char) {
          i += 2;
          continue;
        }
        out += char;
        i += 1;
        continue;
      }

      out += char;
      i += 1;
    }

    buffer = buffer.slice(i);
    return out;
  };

  return {
    push(chunk: string): string {
      if (chunk === '') return '';
      buffer += chunk;
      return consume(false);
    },
    flush(): string {
      return consume(true);
    },
  };
}

/** ストリームではない文字列をまとめて処理する */
export function toPlainText(text: string): string {
  const filter = createPlainTextFilter();
  return filter.push(text) + filter.flush();
}
