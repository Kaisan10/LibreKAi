// Full blog list page content – kept in this module, not in pages.js.
// initBlogPage() expects #blog-content-area.

const contentHtml = `
<div class="legal-container">
  <div id="blog-content-area"><div class="loading">読み込み中...</div></div>
</div>
`;

export const content = contentHtml;
export const title = 'ブログ一覧 - KAi';
export const description = 'KAiの最新情報や開発の様子をお伝えするブログです。';
export const keywords = 'KAi, ブログ, 開発日記, お知らせ';

export async function init() {
    if (typeof window.initBlogPage === 'function') window.initBlogPage();
}
