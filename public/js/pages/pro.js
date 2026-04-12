// Pro page wrapper – content is loaded by plugin via /api/app/page/pro. Kept in this module, not in pages.js.
// initProPage() expects #pro-page-container.

const contentHtml = `
<div class="legal-container pro-page">
  <div id="pro-page-container"><div class="loading">読み込み中...</div></div>
</div>
`;

export const content = contentHtml;
export const title = 'Proプラン - KAi';
export const description = 'Proプランの詳細です。';
export const keywords = 'KAi, Proプラン';

export async function init() {
    if (typeof window.initProPage === 'function') window.initProPage();
}
