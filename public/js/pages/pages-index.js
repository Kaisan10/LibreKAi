// Full pages list content – kept in this module, not in pages.js.

const contentHtml = `
<div class="legal-container pages-list-page">
  <h1>ページ一覧</h1>
  <p class="section-desc">KAiの各種情報や管理ページにアクセスできます。</p>
  <div class="pages-grid">
    <a href="/pages/privacy" class="page-card spa-link" data-path="/pages/privacy">
      <div class="page-card-icon"><i class="fa-solid fa-shield-halved"></i></div>
      <div class="page-card-info">
        <h3>プライバシーポリシー</h3>
        <p>ユーザーデータの取り扱いについて</p>
      </div>
      <div class="page-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    </a>
    <a href="/pages/terms" class="page-card spa-link" data-path="/pages/terms">
      <div class="page-card-icon"><i class="fa-solid fa-file-contract"></i></div>
      <div class="page-card-info">
        <h3>利用規約</h3>
        <p>サービス利用に関する重要事項</p>
      </div>
      <div class="page-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    </a>
    <a href="/pages/embedded-sites" class="page-card spa-link" data-path="/pages/embedded-sites">
      <div class="page-card-icon"><i class="fa-solid fa-share-nodes"></i></div>
      <div class="page-card-info">
        <h3>埋め込みサイト管理</h3>
        <p>外部サイト用ウィジェットの設定</p>
      </div>
      <div class="page-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    </a>
    <a href="/blogs" class="page-card spa-link" data-path="/blogs">
      <div class="page-card-icon"><i class="fa-solid fa-blog"></i></div>
      <div class="page-card-info">
        <h3>ブログ</h3>
        <p>最新情報や開発日記</p>
      </div>
      <div class="page-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
    </a>
  </div>
</div>
`;

export const content = contentHtml;
export const title = 'ページ一覧 - KAi';
export const description = 'KAiの各種情報や管理ページの一覧です。プライバシーポリシー、利用規約、Proプラン、API管理などにアクセスできます。';
export const keywords = 'KAi, ページ一覧, 管理, 情報';
