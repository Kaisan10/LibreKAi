// 404 Not Found ページの実体: public/js/pages/not-found.js（ルートは routes-map.js の notFound）

const contentHtml = `
<div class="legal-container">
  <h1>ページが見つかりません</h1>
  <p class="section-desc">お探しのページは存在しないか、移動した可能性があります。</p>
  <p><a href="/" class="spa-link btn-primary" data-path="/">チャットに戻る</a></p>
</div>
`;

export const content = contentHtml;
export const title = 'ページが見つかりません - KAi';
export const description = 'お探しのページは見つかりませんでした。URLをご確認ください。';
export const keywords = '404, 見つからない, エラー';
