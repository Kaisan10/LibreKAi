// /pages/pro/settings – Proプラン設定ページ

export const content = `
<div class="legal-container pro-page">
  <div id="pro-settings-container"><div class="loading">読み込み中...</div></div>
</div>
`;
export const title = 'Proプラン設定 - KAi';
export const description = 'Proプランの自動更新や解約の設定ができます。';
export const keywords = 'KAi, Proプラン, 設定';

export async function init() {
    if (typeof window.initProSettingsPage === 'function') window.initProSettingsPage();
}
