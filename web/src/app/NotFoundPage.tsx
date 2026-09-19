import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="centered-page">
      <h1>ページが みつかりません</h1>
      <p>URLを もういちど かくにんしてね。</p>
      <p>
        <Link to="/">へやの ばんごうを いれる</Link>
      </p>
    </main>
  );
}
