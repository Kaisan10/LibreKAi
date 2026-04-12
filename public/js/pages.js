// Admin and legacy page content only. Static pages (privacy, terms, FAQ, API, etc.)
// live in public/js/pages/*.js and are loaded via routes-map.js; do not add them here.

// Admin: Basic settings page
export const adminBasicPageContent = `
<div class="legal-container">
  <div style="margin-bottom: 2rem;">
    <h2 style="font-size: 2rem; margin-bottom: 1rem;"><i class="fa-solid fa-sliders"></i> 基本設定</h2>
    <p style="color: var(--text-muted);">サイト名・メタ情報・提案カード・連携APIを管理します。</p>
  </div>
  <form id="admin-basic-form">
    <div class="admin-card admin-card-basic-meta" style="margin-bottom: 1.5rem;">
      <div class="admin-card-title">サイト名・タイトル・メタ情報 <span class="unsaved-dot hidden" id="admin-basic-meta-dot" aria-hidden="true"></span></div>
      <div class="admin-card-body">
        <div class="form-group">
          <label for="basic-site-title">サイト名／タイトル</label>
          <input type="text" id="basic-site-title" name="siteTitle" class="form-control" placeholder="例: KAi">
        </div>
        <div class="form-group">
          <label for="basic-meta-desc">meta description</label>
          <textarea id="basic-meta-desc" name="metaDescription" class="form-control" rows="2" placeholder="検索結果に表示される説明文"></textarea>
        </div>
        <div class="form-group">
          <label for="basic-meta-keywords">meta keywords</label>
          <input type="text" id="basic-meta-keywords" name="metaKeywords" class="form-control" placeholder="キーワード1, キーワード2">
        </div>
      </div>
    </div>
    <div class="admin-card" style="margin-bottom: 1.5rem;">
      <div class="admin-card-title">提案カード（サジェスト） <span class="unsaved-dot hidden" id="admin-basic-suggestion-dot" aria-hidden="true"></span></div>
      <div class="admin-card-body">
        <p class="admin-basic-suggestion-hint">チャット開始時に表示する提案ボタンです。</p>
        <div id="admin-basic-suggestion-list" class="admin-basic-suggestion-list"></div>
        <button type="button" id="admin-basic-add-card" class="btn-secondary admin-basic-add-card">
          <i class="fa-solid fa-plus"></i> カードを追加
        </button>
      </div>
    </div>
    <div class="admin-card" style="margin-bottom: 1.5rem;">
      <div class="admin-card-title">連携・API <span class="unsaved-dot hidden" id="admin-basic-integration-dot" aria-hidden="true"></span></div>
      <div class="admin-card-body">
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">短縮URL・Webhook・VOICEVOX 等の外部サービス連携設定を管理します。</p>
        <div id="admin-basic-integration-list" class="admin-integration-list">
          <div class="loading">読み込み中...</div>
        </div>
      </div>
    </div>
    <div class="admin-basic-form-actions">
      <button type="submit" id="admin-basic-save" class="btn-primary">保存</button>
      <button type="button" id="admin-basic-cancel" class="btn-secondary">キャンセル</button>
    </div>
  </form>
  <div id="admin-unsaved-bar" class="admin-unsaved-bar hidden">
    <span class="admin-unsaved-bar-text">変更を保存しますか？</span>
    <div class="admin-unsaved-bar-actions">
      <button type="button" id="admin-unsaved-cancel-btn" class="btn-secondary">キャンセル</button>
      <button type="button" id="admin-unsaved-save-btn" class="btn-primary">保存</button>
    </div>
  </div>
</div>
`;

// Minimal admin pages used only to provide containers; detailed UI is built by admin.js
const adminDashboardPageContent = `
<div class="legal-container">
  <div class="admin-dashboard-header" style="margin-bottom: 2rem;">
    <div class="admin-dashboard-header-title">
      <h2 style="font-size: 2rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-chart-line"></i> システム統計</h2>
      <p style="color: var(--text-muted); margin: 0;">サービスの使用状況とパフォーマンスを確認します。</p>
    </div>
    <div class="admin-range-toolbar">
      <button type="button" class="range-btn active" data-range="1D">1日</button>
      <button type="button" class="range-btn" data-range="1W">1週間</button>
      <button type="button" class="range-btn" data-range="1M">1か月</button>
      <button type="button" class="range-btn" data-range="1Y">1年</button>
    </div>
  </div>
  <div class="admin-stats-grid">
    <div class="admin-stat-card">
      <h3>総リクエスト数</h3>
      <div id="stat-total-requests">--</div>
    </div>
    <div class="admin-stat-card">
      <h3>平均応答時間</h3>
      <div id="stat-avg-response">--</div>
    </div>
    <div class="admin-stat-card">
      <h3>最も使われているモデル</h3>
      <div id="stat-top-model">--</div>
    </div>
  </div>
  <div class="admin-charts-grid">
    <div class="admin-chart-card">
      <h3>モデル別利用状況</h3>
      <canvas id="modelUsageChart"></canvas>
    </div>
    <div class="admin-chart-card">
      <h3>応答時間の推移</h3>
      <canvas id="responseTimeChart"></canvas>
    </div>
  </div>
</div>
`;

const adminModelsPageContent = `
<div class="legal-container">
  <div style="margin-bottom: 1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
    <div>
      <h2 style="font-size: 2rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-gears"></i> モデル管理</h2>
      <p style="color: var(--text-muted); margin: 0;">利用可能なモデル一覧と設定を管理します。</p>
    </div>
    <div class="tag-search-container">
      <i class="fa-solid fa-magnifying-glass tag-search-icon"></i>
      <input type="text" id="admin-models-search" class="tag-search-input" placeholder="モデルを検索...">
    </div>
  </div>
  <div id="admin-models-list"><div class="loading">読み込み中...</div></div>
  <button id="admin-add-model-btn" class="btn-primary" style="margin-top:1.5rem;"><i class="fa-solid fa-plus"></i> モデルを追加</button>
</div>
<div id="admin-model-modal" class="modal-overlay hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h2 id="admin-model-modal-title">モデルを編集</h2>
      <button id="admin-close-model-modal-btn" class="btn-icon-only"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="admin-model-form">
      <div class="form-group">
        <label>モデルID</label>
        <input type="text" name="modelId" class="form-control">
      </div>
      <div class="form-group">
        <label>名前</label>
        <input type="text" name="name" class="form-control">
      </div>
      <div class="form-group">
        <label>API URL または ファイルパス</label>
        <input type="text" name="apiUrl" class="form-control">
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:1rem;">
        <button type="button" id="admin-cancel-model-btn" class="btn-secondary">キャンセル</button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>
  </div>
</div>
`;

const adminUsersPageContent = `
<div class="legal-container">
  <div style="margin-bottom: 2rem;">
    <h2 style="font-size: 2rem; margin-bottom: 1rem;"><i class="fa-solid fa-users"></i> ユーザー管理</h2>
    <p style="color: var(--text-muted);">ユーザーの権限設定や一覧を確認します。</p>
  </div>
  <div class="admin-users-toolbar" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
    <span id="admin-user-count" style="font-weight: 600; color: var(--text-muted);">0 名のユーザー</span>
    <button type="button" id="admin-sort-name" class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;">名前で並べ替え</button>
    <button type="button" id="admin-sort-date" class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;">登録日で並べ替え</button>
  </div>
  <div class="admin-table-container">
    <table class="admin-table" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: left;">ユーザー</th>
          <th style="text-align: left;">権限</th>
          <th style="text-align: left;">Pro</th>
          <th style="text-align: left;">登録日</th>
          <th style="text-align: right;">操作</th>
        </tr>
      </thead>
      <tbody id="admin-users-list-body">
        <tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">読み込み中...</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div id="admin-user-role-modal" class="modal-overlay hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h2>権限を変更</h2>
      <button type="button" id="admin-close-user-role-modal-btn" class="btn-icon-only" aria-label="閉じる"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="admin-user-role-form">
      <input type="hidden" name="id">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
        <img id="admin-user-role-avatar" src="" alt="" class="user-avatar-sm" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
        <div>
          <div id="admin-user-role-name" style="font-weight: 600;"></div>
          <div id="admin-user-role-username" style="font-size: 0.875rem; color: var(--text-muted);"></div>
        </div>
      </div>
      <div class="form-group">
        <label>権限</label>
        <select name="role" class="form-control">
          <option value="member">メンバー</option>
          <option value="admin">管理者</option>
        </select>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
        <button type="button" id="admin-cancel-user-role-btn" class="btn-secondary">キャンセル</button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>
  </div>
</div>
`;

const adminPluginsPageContent = `
<div class="legal-container">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
    <div>
      <h2 style="font-size: 2rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-puzzle-piece"></i> プラグイン管理</h2>
      <p style="color: var(--text-muted); margin: 0;">認証・ポイントシステム等のプラグインを管理します。</p>
    </div>
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <button id="admin-plugins-multi-select-btn" class="btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">複数選択</button>
      <button id="admin-plugins-add-btn" class="btn-primary" style="padding: 0.5rem 1rem;"><i class="fa-solid fa-plus"></i> 追加</button>
    </div>
  </div>
  <div id="admin-plugins-toolbar" class="admin-plugins-toolbar hidden">
    <span id="admin-plugins-selected-count" style="font-size: 0.9rem;"></span>
    <button id="admin-plugins-disable-selected-btn" class="btn-secondary" style="padding: 0.4rem 1rem; font-size: 0.85rem;"><i class="fa-solid fa-toggle-off"></i> 選択を無効化</button>
    <button id="admin-plugins-cancel-select-btn" class="btn-secondary" style="padding: 0.4rem 1rem; font-size: 0.85rem;">キャンセル</button>
  </div>
  <div id="admin-plugins-container"><div class="loading">読み込み中...</div></div>
  <input type="file" id="admin-plugins-file-input" accept=".js,.zip" style="display:none;">
</div>
`;

const adminAuthPageContent = `
<div class="legal-container">
  <div style="margin-bottom: 2rem;">
    <h2 style="font-size: 2rem; margin-bottom: 1rem;"><i class="fa-solid fa-key"></i> ログインと認証</h2>
    <p style="color: var(--text-muted);">認証プロバイダーの設定を管理します。</p>
  </div>
  <div id="admin-auth-container"><div class="loading">読み込み中...</div></div>
</div>
`;

const adminFeaturesPageContent = `
<div class="legal-container">
  <div style="margin-bottom: 2rem;">
    <h2 style="font-size: 2rem; margin-bottom: 1rem;"><i class="fa-solid fa-toggle-on"></i> 機能管理</h2>
    <p style="color: var(--text-muted);">各機能をどの権限で使えるか設定します。</p>
  </div>
  <div id="admin-features-container"><div class="loading">読み込み中...</div></div>
</div>
`;

// Used by admin page modules only. Static pages use their own modules via routes-map.js.
export const pagesMeta = {
  '/admin': {
    title: '管理者パネル - KAi',
    content: adminDashboardPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
  '/admin/models': {
    title: 'モデル管理 - 管理者パネル',
    content: adminModelsPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
  '/admin/users': {
    title: 'ユーザー管理 - 管理者パネル',
    content: adminUsersPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
  '/admin/basic': {
    title: '基本設定 - 管理者パネル',
    content: adminBasicPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
  '/admin/plugins': {
    title: 'プラグイン管理 - 管理者パネル',
    content: adminPluginsPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
  '/admin/auth': {
    title: 'ログインと認証 - 管理者パネル',
    content: adminAuthPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
  '/admin/features': {
    title: '機能管理 - 管理者パネル',
    content: adminFeaturesPageContent,
    css: '/css/admin.css',
    isAdmin: true,
  },
};


