// Full tags list page content – kept in this module, not in pages.js.
// initTagsListPage() expects #tagsGrid.

const contentHtml = `
<div class="legal-container">
  <h1>タグ一覧</h1>
  <p class="section-desc">会話に付けられたタグの一覧です。タグをクリックするとそのタグの会話を表示できます。</p>
  <div id="tagsGrid" class="tags-grid"></div>
</div>
`;

export const content = contentHtml;
export const title = 'タグ一覧 - KAi';
export const description = 'KAiで使われているタグの一覧です。タグごとに過去の会話をブラウズできます。';
export const keywords = 'KAi, タグ, 履歴';

export async function init() {
    if (typeof window.initTagsListPage === 'function') window.initTagsListPage();
}
