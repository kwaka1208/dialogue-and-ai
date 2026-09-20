import { Link } from 'react-router-dom';
import { useAdminSession } from '../admin/hooks/useAdminSession.ts';
import loginPng from './screenshots/01-login.webp';
import headerPng from './screenshots/02-header.webp';
import accountsPng from './screenshots/03-accounts.webp';
import createRoomPng from './screenshots/04-create-room.webp';
import roomListPng from './screenshots/05-room-list.webp';
import roomDetailPng from './screenshots/06-room-detail.webp';
import roomSettingsPng from './screenshots/07-room-settings.webp';
import messageLogPng from './screenshots/08-message-log.webp';

interface FigureProps {
  src: string;
  alt: string;
  caption: string;
  /**
   * 撮ったときの画面上の幅(px)。写真ごとに拡大率が違うので、これで実寸に戻して並びを揃える。
   * 画面が狭いときは 100% が優先されるので、はみ出すことはない。
   */
  width: number;
}

/**
 * 画面写真。alt は読み上げ用に何が写っているかだけを書き、
 * どこを見るかは caption に書く（読み上げでも二重にならないように分ける）。
 */
function Figure({ src, alt, caption, width }: FigureProps) {
  return (
    <figure className="help-figure" style={{ maxWidth: `${width}px` }}>
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/**
 * 管理者向けの使い方。読むのは大人なので、管理画面と同じ漢字混じりで書く。
 * 上限の実数は config.ts が持っていて変わりうるので、ここには焼き付けず
 * ログイン中のセッションから引く。ログアウト中はその段だけ出さない。
 */
export function AdminHelpPage() {
  const { auth } = useAdminSession();
  const session = auth.status === 'signed_in' ? auth.session : null;

  return (
    <main className="admin-page help-page">
      <header className="admin-header">
        <h1 className="admin-title">管理画面の使い方</h1>
        <div className="admin-header-right">
          <Link to="/admin">管理画面へ戻る</Link>
        </div>
      </header>

      <p className="notice">
        このページは大人向けです。子どもに渡す説明は
        <Link to="/help"> 子ども向けの使い方 </Link>
        にあります。
      </p>

      <section className="admin-section">
        <h2 className="admin-section-title">全体の流れ</h2>
        <ol className="help-steps">
          <li>管理画面にGoogleアカウントでログインする</li>
          <li>部屋を作る（名前・AIのモードなどを決める）</li>
          <li>部屋コード（6桁）かURLを子どもに渡す</li>
          <li>会話のあいだは、ログや在室者を見ながら見守る</li>
          <li>終わったら、必要ならエクスポートしてから部屋を削除する</li>
        </ol>
        <Figure
          src={headerPng}
          width={1010}
          alt="管理画面のヘッダー。左に「管理画面」、右に「使い方」リンク、ログイン中の名前、特権管理者のしるし、ログアウトボタン"
          caption="ログインするとこの帯が上に出ます。このページはここの「使い方」から開けます。"
        />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">ログインと権限</h2>
        <p>
          ログインできるのは、あらかじめ登録されたGoogleアカウントだけです。権限は2種類あります。
        </p>
        <Figure
          src={loginPng}
          width={530}
          alt="管理画面のログイン画面。「Google でログイン」ボタンだけが置かれている"
          caption="未ログインで /admin を開くとこの画面になります。登録されていないアカウントでは入れません。"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>特権管理者</th>
              <th>管理者</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>決まり方</td>
              <td>サーバーの設定（SUPER_ADMIN_EMAILS）</td>
              <td>特権管理者がこの画面から登録する</td>
            </tr>
            <tr>
              <td>見える部屋</td>
              <td>すべて（作った管理者も一覧に出る）</td>
              <td>自分が作った部屋だけ</td>
            </tr>
            <tr>
              <td>アカウントの登録・無効化・削除</td>
              <td>できる</td>
              <td>できない</td>
            </tr>
          </tbody>
        </table>
        <p className="help-sub">
          管理者を増やすときは、特権管理者が「管理者アカウント」でメールアドレスを登録します。
          登録された人は、自分のGoogleアカウントでログインできるようになります。
          無効化すると行は残るので、あとから有効に戻せます。削除するとその人の部屋は
          「所有者なし」で残り、以後は特権管理者だけが管理できます。
        </p>
        <Figure
          src={accountsPng}
          width={980}
          alt="管理者アカウントの登録欄と一覧。メールアドレス、名前、権限、最終ログインの列があり、管理者の行には「無効にする」「削除」ボタンが出ている"
          caption="「管理者アカウント」は特権管理者にだけ出ます。特権管理者の行には無効化・削除のボタンが出ません。"
        />
        <p className="help-sub">
          ログインの状態は既定で12時間で切れます。アカウントを無効化・削除すると、
          その人が開いている画面もその場でログアウトします。
        </p>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">部屋を作る</h2>
        <p>「部屋を作る」で項目を埋めて、「作る」を押します。</p>
        <Figure
          src={createRoomPng}
          width={914}
          alt="部屋を作るフォーム。部屋の名前、合言葉、定員、AIに聞ける回数、有効時間、AIのモード、AIの返し方、モデル、system prompt の入力欄が並んでいる"
          caption="モデルと system prompt は空欄のままで構いません。空欄が「既定を使う」の意味になります。"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>決め方</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>部屋の名前</td>
              <td>子どもの画面の見出しに出ます。あとから変えられます</td>
            </tr>
            <tr>
              <td>合言葉（4桁・任意）</td>
              <td>
                入室時に聞かれます。<b>あとから変えられません</b>。
                人に見られたくない部屋では設定してください
              </td>
            </tr>
            <tr>
              <td>定員</td>
              <td>同時に入れる人数。あとから変えられます</td>
            </tr>
            <tr>
              <td>AIに聞ける回数</td>
              <td>
                その部屋でAIを呼べる合計回数。使い切ったら、この数を上げれば続きから使えます
              </td>
            </tr>
            <tr>
              <td>有効時間</td>
              <td>
                過ぎると部屋は閉じます。<b>あとから変えられません</b>が、
                部屋の詳細から「4時間 延長」できます
              </td>
            </tr>
            <tr>
              <td>AIのモード</td>
              <td>会話モードか意見モード。あとから変えられます</td>
            </tr>
            <tr>
              <td>AIの返し方</td>
              <td>会話モードのときだけ選べます</td>
            </tr>
          </tbody>
        </table>
        <p className="help-sub">
          初期値はフォームにあらかじめ入っています。迷ったらそのままで構いません。
          合言葉と有効時間だけは後から変えられないので、ここで決めてください。
        </p>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">子どもに部屋を渡す</h2>
        <p>渡し方は2つあります。どちらでも同じ部屋に入ります。</p>
        <ul className="help-list">
          <li>
            <b>部屋コード（6桁）</b>：一覧と詳細に出ます。「コードをコピー」でその6桁だけ取れます。
            黒板に書いたり読み上げたりして渡します
          </li>
          <li>
            <b>URL</b>：詳細の「URLをコピー」で取れます。QRコードやチャットで渡します
          </li>
        </ul>
        <Figure
          src={roomListPng}
          width={922}
          alt="部屋の一覧。各行に6桁の部屋コード、部屋の名前、残り時間、在室数、発言数、AIの使用量、モード、作った管理者が並び、右に「コードをコピー」「URLをコピー」ボタンがある"
          caption="行をクリックすると下に詳細が開きます。作った管理者の列は特権管理者にだけ出ます。"
        />
        <p className="help-sub">
          コードは部屋を作ったときに自動で採番されます。期限が切れた部屋のコードは使えなくなり、
          あとで別の部屋に回ります。
        </p>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">AIのモードを選ぶ</h2>
        <p>どちらを選んでも、子ども同士のチャットは同じように動きます。違うのはAIの動き方です。</p>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>会話モード</th>
              <th>意見モード</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>AIの立ち位置</td>
              <td>部屋の話し相手</td>
              <td>ひとりの参加者。会話には割り込まない</td>
            </tr>
            <tr>
              <td>AIが口を開くきっかけ</td>
              <td>「🤖 AIに きく」ボタン、@AI で始まる発言、または「毎回返す」設定</td>
              <td>「🤖 AIに いけんを きく」ボタンだけ</td>
            </tr>
            <tr>
              <td>誰に向けて話すか</td>
              <td>呼びかけた子ひとり</td>
              <td>部屋のみんな</td>
            </tr>
            <tr>
              <td>向く場面</td>
              <td>質問したり、相手をしてもらったりする</td>
              <td>話し合いの途中で、別の見方を出してもらう</td>
            </tr>
          </tbody>
        </table>
        <p className="help-sub">
          「AIの返し方」は会話モードのときだけ効きます。<b>呼ばれたら返す</b>が既定で、
          <b>毎回返す</b>にすると子どもの発言すべてにAIが反応します。意見モードでは使わないので、
          画面にも出てきません。
        </p>
        <p className="help-sub">
          意見モードでは、誰がAIを呼んだかが部屋の全員に見えるよう、意見の前に
          「◯◯さんが AIに いけんを ききました」が出ます。
        </p>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">AIの中身を部屋ごとに変える</h2>
        <p>
          モデルと system prompt は、部屋ごとに差し替えられます。会話モードと意見モードで別々に
          持つので、モードを切り替えても、それぞれの設定は残ります。
        </p>
        <ul className="help-list">
          <li>
            <b>空欄のままなら既定</b>です。いちど書いたものを空に戻せば、また既定に戻ります
          </li>
          <li>
            モデルは一覧から選びます。一覧を取れないときは、モデル名を直接入力する形に切り替わります
          </li>
          <li>
            system prompt は4000文字まで。「既定を読み込んで編集する」を押すと、
            既定の文面が入力欄に入るので、そこから直せます
          </li>
        </ul>
        <Figure
          src={roomSettingsPng}
          width={918}
          alt="部屋の詳細の設定欄。部屋の名前、定員、AIに聞ける回数、AIのモード、AIの返し方、モデル、system prompt を変えられる"
          caption="部屋の詳細の「設定」。ここで変えたあとは、いちばん下の「設定を保存」を押します。"
        />
        <p className="help-sub">
          既定でうまくいっているなら、触る必要はありません。いまの設定は部屋の詳細の「AIの中身」で
          確認できます。
        </p>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">部屋を見守る・片づける</h2>
        <Figure
          src={roomDetailPng}
          width={918}
          alt="部屋の詳細の上部。期限、在室、発言、AIのモード、AIの中身、AIの使用、添付、部屋コード、合言葉、作った人が並び、下に「4時間 延長」「ログをエクスポート」「部屋を削除」のボタンがある"
          caption="部屋の詳細の上部。その場で要るものはここに揃っています。"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>できること</th>
              <th>場所と補足</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>一覧で状態を見る</td>
              <td>残り時間・在室数・発言数・AIの使用量が出ます</td>
            </tr>
            <tr>
              <td>会話ログを読む</td>
              <td>
                部屋の詳細の「会話ログ」。直近500件。気をつけたい言葉が入っていた行には
                「要確認」が付きます
              </td>
            </tr>
            <tr>
              <td>期限を延ばす</td>
              <td>詳細の「4時間 延長」。何度でも押せます</td>
            </tr>
            <tr>
              <td>設定を変える</td>
              <td>
                詳細の「設定」。名前・定員・AIに聞ける回数・AIのモード・返し方・モデル・
                system prompt
              </td>
            </tr>
            <tr>
              <td>エクスポート</td>
              <td>部屋・参加者・全メッセージをJSONで保存します</td>
            </tr>
            <tr>
              <td>強制退出</td>
              <td>
                詳細の「参加者」。押し間違い防止に2回押させます。出された子は同じ名前では戻れません
              </td>
            </tr>
            <tr>
              <td>部屋を削除</td>
              <td>
                2回押すと削除。<b>添付ファイルは実体ごと消えて戻りません</b>。
                残したいものがあれば、先にエクスポートしてください
              </td>
            </tr>
          </tbody>
        </table>
        <Figure
          src={messageLogPng}
          width={918}
          alt="会話ログ。時刻・発言者・本文が1行ずつ並び、最後の行には赤い「要確認」の印が付いて背景が薄い赤になっている"
          caption="気をつけたい言葉が入っていた行には「要確認」が付き、背景の色も変わります。この写真は説明のために、当たり障りのない語を気をつけたい言葉として設定した状態です。"
        />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">上限と、気をつけること</h2>
        {session ? (
          <p>
            AIに聞けるのは1人あたり毎分 {session.rateLimits.aiTurnsPerMinute} 回、発言は毎分{' '}
            {session.rateLimits.messagesPerMinute}{' '}
            回までです。部屋ごとの合計は「AIに聞ける回数」で決まります。上限に当たっても発言は
            ふつうに部屋へ出て、AIが返事をしないだけです。
          </p>
        ) : (
          <p>
            AIへの呼びかけと発言には、1人あたり毎分の上限があります。実際の値は、
            ログインすると管理画面の上部に出ます。
          </p>
        )}
        <ul className="help-list">
          <li>
            <b>気をつけたい言葉</b>に当たると、AIはその話に触れず、ログに「要確認」が付きます。
            発言そのものは、ふつうに部屋へ出ます。印が付いたことは子どもの画面には出ません
          </li>
          <li>
            言葉の網は最後の砦ではありません。<b>大人が同席して見守る</b>前提で使ってください
          </li>
          <li>
            他の管理者が作った部屋は見えません。共同で運用するときは、
            誰が部屋を作ったかを決めておいてください
          </li>
        </ul>
      </section>

      <p className="help-back">
        <Link to="/admin">← 管理画面へ戻る</Link>
      </p>
    </main>
  );
}
