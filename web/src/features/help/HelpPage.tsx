import { Link } from 'react-router-dom';

/**
 * 子ども向けの使い方。読むのは部屋に入る前後の子どもなので、
 * 画面と同じひらがな寄りの言葉で書く。大人向けの説明は /admin/help に分けてある。
 */
export function HelpPage() {
  return (
    <main className="centered-page help-page">
      <h1 className="help-title">つかいかた</h1>
      <p>ここは、みんなで はなす へやだよ。AIも いっしょに いるよ。</p>

      <section className="help-section">
        <h2 className="help-heading">1. へやに はいる</h2>
        <p>はいりかたは 2つ あるよ。どちらでも おなじ へやに はいれるよ。</p>
        <ul className="help-list">
          <li>
            <b>ばんごうを いれる</b>
            ：おとなの人に おしえてもらった <b>6けたの すうじ</b>を、
            <Link to="/">さいしょの ページ</Link>で いれる
          </li>
          <li>
            <b>URLを ひらく</b>：もらった URLを ひらくだけ
          </li>
        </ul>
        <p>
          つぎに <b>なまえ</b>を いれるよ。1〜12もじで、ほんとうの なまえで なくても いいよ。
          「あいことば」を きかれたら、おとなの人に おしえてもらった 4けたの すうじを いれてね。
        </p>
      </section>

      <section className="help-section">
        <h2 className="help-heading">2. はなす</h2>
        <p>
          したの はこに メッセージを かいて、<b>「おくる」</b>を おすと、みんなの がめんに でるよ。
        </p>
        <p>だれが はなしたかは、はなしの あたまの マークで わかるよ。</p>
        <ul className="help-list">
          <li>🙂 じぶん</li>
          <li>🧒 ほかの子</li>
          <li>🤖 AI</li>
        </ul>
      </section>

      <section className="help-section">
        <h2 className="help-heading">3. AIに きく</h2>
        <p>へやによって、AIの きき方が ちがうよ。じぶんの へやに ある ボタンを つかってね。</p>
        <ul className="help-list">
          <li>
            <b>🤖 AIに きく</b>（メッセージの よこ）：かいた メッセージを AIに よんでもらって、
            おへんじを もらう
          </li>
          <li>
            <b>🤖 AIに いけんを きく</b>（はなしの した）：ここまでの みんなの はなしを 見て、
            AIが いけんを いう。この ボタンだけの へやも あるよ
          </li>
        </ul>
        <p>
          AIが かいている とちゅうで やめてほしい ときは、<b>「■ とめる」</b>を おすと、
          そこまでで おわるよ。
        </p>
        <p className="help-sub">
          AIに きけるのは すこし ずつだよ。つづけて なんども きくと、
          「すこし まってから きいてね」と でるよ。まって また きいてみてね。
        </p>
      </section>

      <section className="help-section">
        <h2 className="help-heading">4. ファイルを つける</h2>
        <p>
          <b>📎 ファイル</b>を おすと、しゃしんや ファイルを つけられるよ。
          1かいに <b>3こまで</b>、1つ <b>10MBまで</b>。
        </p>
        <ul className="help-list">
          <li>しゃしん（png・jpg・gif・webp）：はなしの なかに でるよ</li>
          <li>もじの ファイル（txt・md・csv）・pdf：ファイルの なまえが でるよ</li>
        </ul>
        <p className="help-sub">おくる まえなら、×を おして やめられるよ。</p>
      </section>

      <section className="help-section">
        <h2 className="help-heading">5. へやから でる</h2>
        <p>
          みぎ うえの <b>「でる」</b>を おして、もういちど おすと でられるよ。
          まちがえて おしても、5びょう さわらなければ もとに もどるよ。
        </p>
      </section>

      <section className="help-section">
        <h2 className="help-heading">6. こまったとき</h2>
        <table className="help-table">
          <tbody>
            <tr>
              <th>はいれない</th>
              <td>
                ばんごうや あいことばを もういちど かくにんしてね。
                へやが おわっていたり、いっぱいの ことも あるよ
              </td>
            </tr>
            <tr>
              <th>なまえが つかえない</th>
              <td>おなじ なまえの 子が いるみたい。すこし かえて いれてね</td>
            </tr>
            <tr>
              <th>AIが なにも いわない</th>
              <td>
                AIが おやすみちゅうか、ほかの子の おへんじを かいて いるところ。
                すこし まってから きいてみてね
              </td>
            </tr>
            <tr>
              <th>とちゅうで とまった</th>
              <td>ページを よみこみ なおしてみてね。それでも だめなら おとなの人に いってね</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="help-section help-promise">
        <h2 className="help-heading">やくそく</h2>
        <ul className="help-list">
          <li>ほんとうの じゅうしょ・でんわばんごう・がっこうの なまえは かかない</li>
          <li>ひとが いやな きもちに なることは かかない</li>
          <li>こまったこと・いやなことが あったら、すぐ おとなの人に いう</li>
        </ul>
        <p className="help-sub">
          はなした ことは、おとなの人が あとから 見られるように なっているよ。
        </p>
      </section>

      <p className="help-back">
        <Link to="/">← へやの ばんごうを いれる</Link>
      </p>
    </main>
  );
}
