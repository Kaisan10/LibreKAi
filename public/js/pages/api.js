// Full API management page content – kept in this module, not in pages.js.
// initApiPage() in index.js expects these element IDs: api-login-prompt, api-pro-prompt, api-content,
// api-key-display, api-key-create, api-key-value, api-key-create-btn, api-key-copy-btn, api-key-delete-btn,
// api-usage-count, api-success-count, api-failure-count, api-completion-count, api-models-count, api-last-used, apiUsageChart.

const contentHtml = `
<div class="legal-container api-page">
  <h1><i class="fa-solid fa-code"></i> API管理</h1>
  <p class="section-desc">APIキーの作成・管理と利用状況の確認ができます。Proプランが必要です。</p>

  <div id="api-login-prompt" class="api-login-prompt hidden">
    <p>API管理を利用するにはログインしてください。</p>
  </div>

  <div id="api-pro-prompt" class="api-pro-prompt hidden">
    <div class="pro-required-banner">
      <i class="fa-solid fa-crown"></i>
      <div>
        <h3>Proプランが必要です</h3>
        <p>APIキーの作成・管理はProプランにご加入の方が利用できます。</p>
      </div>
    </div>
  </div>

  <div id="api-content" class="hidden">
    <div class="api-key-section">
      <h2>APIキー</h2>
      <div id="api-key-display" class="hidden">
        <div class="api-stat-value-group">
          <span id="api-key-value" class="api-key-value"></span>
          <button type="button" id="api-key-copy-btn" class="btn-secondary" style="margin-left: 0.5rem;"><i class="fa-regular fa-copy"></i></button>
          <button type="button" id="api-key-delete-btn" class="btn-secondary"><i class="fa-solid fa-trash-can"></i> 削除</button>
        </div>
        <p class="api-key-warning"><i class="fa-solid fa-triangle-exclamation"></i> このキーは一度しか表示されません。安全な場所に保存してください。</p>
      </div>
      <div id="api-key-create" class="api-key-create">
        <p>APIキーがまだありません。作成すると外部アプリからKAiのAPIを利用できます。</p>
        <button type="button" id="api-key-create-btn" class="btn-primary"><i class="fa-solid fa-plus"></i> APIキーを作成</button>
      </div>
    </div>

    <div class="api-usage-section">
      <h2>利用状況</h2>
      <div class="api-usage-stats">
        <div class="api-stat">
          <span class="api-stat-label">リクエスト数</span>
          <span id="api-usage-count" class="api-stat-value">0</span>
        </div>
        <div class="api-stat">
          <span class="api-stat-label">成功</span>
          <span id="api-success-count" class="api-stat-value">0</span>
        </div>
        <div class="api-stat">
          <span class="api-stat-label">失敗</span>
          <span id="api-failure-count" class="api-stat-value">0</span>
        </div>
        <div class="api-stat">
          <span class="api-stat-label">回答済み</span>
          <span id="api-completion-count" class="api-stat-value">0</span>
        </div>
        <div class="api-stat">
          <span class="api-stat-label">利用モデル数</span>
          <span id="api-models-count" class="api-stat-value">0</span>
        </div>
        <div class="api-stat">
          <span class="api-stat-label">最終利用</span>
          <span id="api-last-used" class="api-stat-value">-</span>
        </div>
      </div>
      <div style="margin-top: 1.5rem; display: none;" id="api-usage-chart-wrap">
        <canvas id="apiUsageChart" height="200"></canvas>
      </div>
    </div>
  </div>
</div>
`;

export const content = contentHtml;
export const title = 'API管理 - KAi';
export const description = 'KAiのAPI管理ページです。APIキーの作成、管理、利用状況の統計確認ができます。';
export const keywords = 'KAi, API, APIキー, 開発者';

export async function init() {
    if (typeof window.initApiPage === 'function') window.initApiPage();
}
