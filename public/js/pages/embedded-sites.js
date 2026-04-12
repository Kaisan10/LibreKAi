// Full embedded sites page content including modal – kept in this module, not in pages.js.
// embedded-sites.js (logic) expects: es-add-site-btn, es-sites-list, es-add-modal, es-close-modal-btn,
// es-modal-title, es-add-site-form, es-tab-btn, es-tab-desktop, es-tab-mobile, es-preview-screen,
// es-preview-mode-label, es-preview-device-icon, es-preview-widget, es-step-1/2/3, es-step-indicator-1/2/3,
// es-generated-script, es-copy-script-btn, es-go-to-step-3-btn, es-finish-btn, es-toast.

const contentHtml = `
<div class="es-container">
  <header class="es-header">
    <div>
      <h1><i class="fa-solid fa-share-nodes"></i> 埋め込みサイト管理</h1>
      <p style="color: var(--text-muted);">あなたのサイトにKAiを追加しましょう</p>
    </div>
    <button id="es-add-site-btn" class="btn-primary">
      <i class="fa-solid fa-plus"></i> サイトを追加
    </button>
  </header>
  <div id="es-sites-list" class="es-sites-grid">
    <div class="loading">読み込み中...</div>
  </div>
</div>

<!-- Add/Edit Site Modal -->
<div id="es-add-modal" class="modal-overlay hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h2 id="es-modal-title">新しいサイトを追加</h2>
      <button id="es-close-modal-btn" class="btn-icon-only" type="button" aria-label="閉じる"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div class="es-stepper">
        <div id="es-step-indicator-1" class="es-step active">
          <div class="es-step-circle">1</div>
          <span>設定</span>
        </div>
        <div id="es-step-indicator-2" class="es-step">
          <div class="es-step-circle">2</div>
          <span>コード取得</span>
        </div>
        <div id="es-step-indicator-3" class="es-step">
          <div class="es-step-circle">3</div>
          <span>完了</span>
        </div>
      </div>

      <form id="es-add-site-form">
        <div id="es-step-1" class="es-step-content active">
          <div class="es-form-group">
            <label for="es-site-name">サイト名</label>
            <input type="text" id="es-site-name" name="site_name" class="es-form-control form-control" placeholder="例: 会社サイト">
          </div>
          <div class="es-form-group">
            <label for="es-site-url">サイトURL</label>
            <input type="url" id="es-site-url" name="site_url" class="es-form-control form-control" placeholder="https://example.com">
          </div>

          <div class="es-tabs">
            <button type="button" class="es-tab-btn active" data-tab="desktop"><i class="fa-solid fa-desktop"></i> デスクトップ</button>
            <button type="button" class="es-tab-btn" data-tab="mobile"><i class="fa-solid fa-mobile-screen-button"></i> モバイル</button>
          </div>

          <div id="es-tab-desktop" class="es-tab-content active">
            <div class="es-form-group">
              <label>表示位置（デスクトップ）</label>
              <select name="pos_desktop" class="es-form-control form-control">
                <option value="bottom-right">右下</option>
                <option value="bottom-left">左下</option>
                <option value="top-right">右上</option>
                <option value="top-left">左上</option>
              </select>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="es-form-group">
                <label>X方向オフセット</label>
                <input type="text" name="offset_x_desktop" class="es-form-control form-control" placeholder="20px" value="20px">
              </div>
              <div class="es-form-group">
                <label>Y方向オフセット</label>
                <input type="text" name="offset_y_desktop" class="es-form-control form-control" placeholder="20px" value="20px">
              </div>
            </div>
          </div>
          <div id="es-tab-mobile" class="es-tab-content">
            <div class="es-form-group">
              <label>表示位置（モバイル）</label>
              <select name="pos_mobile" class="es-form-control form-control">
                <option value="bottom-right">右下</option>
                <option value="bottom-left">左下</option>
                <option value="top-right">右上</option>
                <option value="top-left">左上</option>
              </select>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="es-form-group">
                <label>X方向オフセット</label>
                <input type="text" name="offset_x_mobile" class="es-form-control form-control" placeholder="20px" value="20px">
              </div>
              <div class="es-form-group">
                <label>Y方向オフセット</label>
                <input type="text" name="offset_y_mobile" class="es-form-control form-control" placeholder="20px" value="20px">
              </div>
            </div>
          </div>

          <div class="es-preview-container">
            <div class="es-preview-header">
              <span>プレビュー</span>
              <span id="es-preview-mode-label">デスクトップ</span>
              <i id="es-preview-device-icon" class="fa-solid fa-desktop"></i>
            </div>
            <div id="es-preview-screen" class="es-preview-screen desktop">
              <div id="es-preview-widget" class="es-preview-widget" style="bottom: 20px; right: 20px;">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              </div>
            </div>
          </div>
          <div style="margin-top: 1rem;">
            <button type="submit" class="btn-primary">保存してコードを表示</button>
          </div>
        </div>

        <div id="es-step-2" class="es-step-content">
          <div class="es-guide-box">
            <p>以下のコードをあなたのサイトの &lt;body&gt; の末尾付近に貼り付けてください。</p>
            <p style="margin-top: 0.5rem; font-size: 0.9rem;">`data-api-key` は一度だけ表示されます。安全な場所で管理してください。</p>
          </div>
          <div class="es-form-group">
            <textarea id="es-generated-script" class="es-code-block form-control" rows="8" readonly></textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <button type="button" id="es-copy-script-btn" class="btn-primary"><i class="fa-regular fa-copy"></i> コピー</button>
            <button type="button" id="es-go-to-step-3-btn" class="btn-secondary">次へ</button>
          </div>
        </div>

        <div id="es-step-3" class="es-step-content">
          <div class="es-guide-box">
            <p><i class="fa-solid fa-check-circle" style="color: var(--primary-color);"></i> 設定が完了しました。モーダルを閉じて一覧で埋め込みコードを確認できます。</p>
          </div>
          <button type="button" id="es-finish-btn" class="btn-primary">完了</button>
        </div>
      </form>
    </div>
  </div>
</div>

<div id="es-toast" class="hidden" style="position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: var(--card-bg); padding: 0.75rem 1.5rem; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000;"></div>
`;

export const content = contentHtml;
export const title = '埋め込みサイト管理 - KAi';
export const css = '/css/embedded-sites.css';
export const description = '自分のサイトにKAiを埋め込むための管理ページです。サイトの追加やウィジェットのカスタマイズが可能です。';
export const keywords = 'KAi, 埋め込み, ウィジェット, サイト連携';

export async function init() {
    const module = await import('/js/embedded-sites.js');
    if (module.initEmbeddedSites) module.initEmbeddedSites();
}
