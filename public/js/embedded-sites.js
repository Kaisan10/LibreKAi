// Embedded Sites Page Initialization
// This file contains the JavaScript logic for the embedded sites management page.

let esEditingSiteId = null;
let esCurrentStep = 1;
let esSitesData = [];

export function initEmbeddedSites() {
    loadSites();
    setupEventListeners();
}

function setupEventListeners() {
    // Add Site Button
    const addSiteBtn = document.getElementById('es-add-site-btn');
    if (addSiteBtn) {
        addSiteBtn.addEventListener('click', () => openAddModal());
    }

    // Close Modal Button
    const closeModalBtn = document.getElementById('es-close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => closeAddModal());
    }

    // Tab Buttons
    document.querySelectorAll('.es-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Toggle Buttons
            document.querySelectorAll('.es-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle Content
            document.querySelectorAll('.es-tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById(`es-tab-${tabId}`);
            if (tabContent) tabContent.classList.add('active');

            // Update Preview Device
            const screen = document.getElementById('es-preview-screen');
            const label = document.getElementById('es-preview-mode-label');
            const icon = document.getElementById('es-preview-device-icon');

            if (tabId === 'mobile') {
                screen.classList.remove('desktop');
                screen.classList.add('mobile');
                label.textContent = 'モバイル';
                icon.className = 'fa-solid fa-mobile-screen-button';
            } else {
                screen.classList.remove('mobile');
                screen.classList.add('desktop');
                label.textContent = 'デスクトップ';
                icon.className = 'fa-solid fa-desktop';
            }
            updatePreview();
        });
    });

    // Form inputs for real-time preview
    const form = document.getElementById('es-add-site-form');
    if (form) {
        const previewInputs = ['pos_desktop', 'pos_mobile', 'offset_x_desktop', 'offset_y_desktop', 'offset_x_mobile', 'offset_y_mobile'];
        previewInputs.forEach(name => {
            const el = form.elements[name];
            if (el) {
                el.addEventListener('change', updatePreview);
                el.addEventListener('input', updatePreview);
            }
        });

        form.addEventListener('submit', handleFormSubmit);
    }

    // Copy Script Button
    const copyScriptBtn = document.getElementById('es-copy-script-btn');
    if (copyScriptBtn) {
        copyScriptBtn.addEventListener('click', copyGeneratedScript);
    }

    // Go to Step 3 Button
    const goToStep3Btn = document.getElementById('es-go-to-step-3-btn');
    if (goToStep3Btn) {
        goToStep3Btn.addEventListener('click', () => goToStep(3));
    }

    // Finish Button
    const finishBtn = document.getElementById('es-finish-btn');
    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            closeAddModal();
            loadSites();
        });
    }

    // Dynamic List Event Delegation
    const sitesList = document.getElementById('es-sites-list');
    if (sitesList) {
        sitesList.addEventListener('click', (e) => {
            const target = e.target;

            // Edit Button
            const editBtn = target.closest('.es-edit-btn');
            if (editBtn) {
                const id = editBtn.dataset.id;
                openEditModal(id);
                return;
            }

            // Delete Button
            const deleteBtn = target.closest('.es-delete-btn');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                deleteSite(id);
                return;
            }

            // Copy Script Box
            const scriptBox = target.closest('.es-embed-script-box');
            if (scriptBox) {
                const script = scriptBox.dataset.script;
                copyScript(script);
            }
        });
    }
}

// --- Stepper Logic ---
function goToStep(step) {
    document.querySelectorAll('.es-step-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.es-step').forEach(el => el.classList.remove('active', 'completed'));

    const stepContent = document.getElementById(`es-step-${step}`);
    if (stepContent) stepContent.classList.add('active');

    for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById(`es-step-indicator-${i}`);
        if (ind) {
            if (i === step) ind.classList.add('active');
            if (i < step) ind.classList.add('completed');
        }
    }
    esCurrentStep = step;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = {
        site_name: formData.get('site_name'),
        site_url: formData.get('site_url'),
        pos_desktop: formData.get('pos_desktop'),
        pos_mobile: formData.get('pos_mobile'),
        offset_x_desktop: formData.get('offset_x_desktop'),
        offset_y_desktop: formData.get('offset_y_desktop'),
        offset_x_mobile: formData.get('offset_x_mobile'),
        offset_y_mobile: formData.get('offset_y_mobile')
    };

    const isEdit = !!esEditingSiteId;
    const url = isEdit ? `/api/embedded-sites/${esEditingSiteId}` : '/api/embedded-sites';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || '保存に失敗しました');
        }

        const result = await res.json();
        const site = result.site;

        // Generate script with position attributes (+ one-time API key on create)
        const baseUrl = window.location.origin;
        const keyAttr = result.apiKey ? `\n    data-api-key="${result.apiKey}"` : '';
        const createdSiteScript = `<script src="${baseUrl}/embedded/widget.js"${keyAttr}
    data-position-desktop="${site.pos_desktop || 'bottom-right'}" 
    data-position-mobile="${site.pos_mobile || 'bottom-right'}" 
    data-offset-x-desktop="${site.offset_x_desktop || '20px'}" 
    data-offset-y-desktop="${site.offset_y_desktop || '20px'}" 
    data-offset-x-mobile="${site.offset_x_mobile || '20px'}" 
    data-offset-y-mobile="${site.offset_y_mobile || '20px'}" 
    referrerpolicy="strict-origin-when-cross-origin"><\/script>`;

        const generatedScriptEl = document.getElementById('es-generated-script');
        if (generatedScriptEl) generatedScriptEl.value = createdSiteScript;

        showToast(isEdit ? '設定を更新しました' : 'サイトを作成しました');
        goToStep(2);

    } catch (err) {
        showAlert('エラー', err.message);
    }
}

function copyGeneratedScript() {
    const scriptField = document.getElementById('es-generated-script');
    if (scriptField) {
        scriptField.select();
        document.execCommand('copy');
        showToast('コピーしました！');
    }
}

// --- Main Page Logic ---
async function loadSites() {
    try {
        const response = await fetch('/api/embedded-sites');
        if (response.status === 401 || response.status === 403) {
            if (typeof window.showProModal === 'function') {
                window.showProModal('埋め込みサイト管理はProプラン専用の機能です。');
            } else {
                window.location.href = '/pages/pro';
            }
            return;
        }
        const data = await response.json();
        esSitesData = data.sites || [];
        renderSites(esSitesData);
    } catch (error) {
        console.error('Error:', error);
        const sitesList = document.getElementById('es-sites-list');
        if (sitesList) {
            sitesList.innerHTML = '<div style="text-align:center; color:red;">読み込みエラーが発生しました</div>';
        }
    }
}

function renderSites(sites) {
    const list = document.getElementById('es-sites-list');
    if (!list) return;

    if (sites.length === 0) {
        list.innerHTML = `
            <div class="es-empty-state">
                <i class="fa-solid fa-plus-circle" style="font-size: 3rem; margin-bottom: 1rem; color: var(--primary-color);"></i>
                <h3>最初のサイトを追加しましょう</h3>
                <p>「サイトを追加」ボタンから埋め込みコードを発行できます。</p>
            </div>
        `;
        return;
    }

    list.innerHTML = sites.map(site => {
        const script = getEmbedScript(site);
        const safeScript = escapeHtml(script).replace(/'/g, "\\'");
        return `
        <div class="es-site-card">
            <div class="es-site-header">
                <div>
                    <div class="es-site-name">${escapeHtml(site.site_name || '名称未設定')}</div>
                    <div class="es-site-url">${escapeHtml(site.site_url)}</div>
                </div>
                <span class="es-status-badge ${site.is_active ? 'active' : 'inactive'}">
                    ${site.is_active ? '有効' : '無効'}
                </span>
            </div>
            
            <div style="margin-top: auto;">
                <small style="display:block; margin-bottom: 4px; color: var(--text-muted);">埋め込みコード</small>
                <div class="es-embed-script-box" data-script='${script}'>
                    ${escapeHtml(script)}
                    <div class="es-copy-hint"><i class="fa-solid fa-copy"></i> Click to Copy</div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 1rem; gap: 8px;">
                <button class="btn-secondary es-edit-btn" data-id="${site.id}" style="padding: 4px 12px; font-size: 0.8rem;">
                    編集
                </button>
                <button class="btn-icon-only es-delete-btn" data-id="${site.id}" title="削除" style="color: var(--error-color);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
        `}).join('');
}

function getEmbedScript(site) {
    const baseUrl = window.location.origin;
    return `<script src="${baseUrl}/embedded/widget.js" 
    data-api-key="YOUR_EMBEDDED_API_KEY"
    data-position-desktop="${site.pos_desktop || 'bottom-right'}" 
    data-position-mobile="${site.pos_mobile || 'bottom-right'}" 
    data-offset-x-desktop="${site.offset_x_desktop || '20px'}" 
    data-offset-y-desktop="${site.offset_y_desktop || '20px'}" 
    data-offset-x-mobile="${site.offset_x_mobile || '20px'}" 
    data-offset-y-mobile="${site.offset_y_mobile || '20px'}" 
    referrerpolicy="strict-origin-when-cross-origin"><\/script>`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message) {
    const toast = document.getElementById('es-toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }
}

// Modal Controls
function openAddModal() {
    const modalTitle = document.getElementById('es-modal-title');
    if (modalTitle) modalTitle.textContent = '新しいサイトを追加';
    esEditingSiteId = null;

    const modal = document.getElementById('es-add-modal');
    if (modal) modal.classList.remove('hidden');

    const form = document.getElementById('es-add-site-form');
    if (form) form.reset();

    // Reset to desktop tab
    document.querySelectorAll('.es-tab-btn').forEach(b => b.classList.remove('active'));
    const desktopTabBtn = document.querySelector('.es-tab-btn[data-tab="desktop"]');
    if (desktopTabBtn) desktopTabBtn.classList.add('active');

    document.querySelectorAll('.es-tab-content').forEach(c => c.classList.remove('active'));
    const desktopTabContent = document.getElementById('es-tab-desktop');
    if (desktopTabContent) desktopTabContent.classList.add('active');

    // Reset preview screen
    const screen = document.getElementById('es-preview-screen');
    const label = document.getElementById('es-preview-mode-label');
    const icon = document.getElementById('es-preview-device-icon');
    if (screen) {
        screen.classList.remove('mobile');
        screen.classList.add('desktop');
    }
    if (label) label.textContent = 'デスクトップ';
    if (icon) icon.className = 'fa-solid fa-desktop';

    updatePreview();
    goToStep(1);
}

function openEditModal(id) {
    esEditingSiteId = id;
    const site = esSitesData.find(s => s.id === id);
    if (!site) return;

    const modalTitle = document.getElementById('es-modal-title');
    if (modalTitle) modalTitle.textContent = 'サイトを編集';

    const form = document.getElementById('es-add-site-form');
    if (form) {
        form.elements['site_name'].value = site.site_name || '';
        form.elements['site_url'].value = site.site_url || '';
        form.elements['pos_desktop'].value = site.pos_desktop || 'bottom-right';
        form.elements['pos_mobile'].value = site.pos_mobile || 'bottom-right';
        form.elements['offset_x_desktop'].value = site.offset_x_desktop || '20px';
        form.elements['offset_y_desktop'].value = site.offset_y_desktop || '20px';
        form.elements['offset_x_mobile'].value = site.offset_x_mobile || '20px';
        form.elements['offset_y_mobile'].value = site.offset_y_mobile || '20px';
    }

    const modal = document.getElementById('es-add-modal');
    if (modal) modal.classList.remove('hidden');

    // Reset to desktop tab
    document.querySelectorAll('.es-tab-btn').forEach(b => b.classList.remove('active'));
    const desktopTabBtn = document.querySelector('.es-tab-btn[data-tab="desktop"]');
    if (desktopTabBtn) desktopTabBtn.classList.add('active');

    document.querySelectorAll('.es-tab-content').forEach(c => c.classList.remove('active'));
    const desktopTabContent = document.getElementById('es-tab-desktop');
    if (desktopTabContent) desktopTabContent.classList.add('active');

    const screen = document.getElementById('es-preview-screen');
    const label = document.getElementById('es-preview-mode-label');
    const icon = document.getElementById('es-preview-device-icon');
    if (screen) {
        screen.classList.remove('mobile');
        screen.classList.add('desktop');
    }
    if (label) label.textContent = 'デスクトップ';
    if (icon) icon.className = 'fa-solid fa-desktop';

    updatePreview();
    goToStep(1);
}

function updatePreview() {
    const form = document.getElementById('es-add-site-form');
    if (!form) return;

    const mobileTabBtn = document.querySelector('.es-tab-btn[data-tab="mobile"]');
    const isMobile = mobileTabBtn && mobileTabBtn.classList.contains('active');
    const pos = isMobile ? form.elements['pos_mobile'].value : form.elements['pos_desktop'].value;
    const offXStr = isMobile ? form.elements['offset_x_mobile'].value : form.elements['offset_x_desktop'].value;
    const offYStr = isMobile ? form.elements['offset_y_mobile'].value : form.elements['offset_y_desktop'].value;

    // Parse offset values for preview (scale down by dividing by 5 for visual preview)
    const parseOffset = (str) => {
        if (!str) return '0px';
        if (str.includes('%')) return str;
        const num = parseFloat(str);
        if (isNaN(num)) return '0px';
        return (num / 5) + 'px'; // Scale down for preview
    };

    const offX = parseOffset(offXStr);
    const offY = parseOffset(offYStr);
    const widget = document.getElementById('es-preview-widget');

    if (!widget) return;

    // Reset all positions
    widget.style.top = 'auto';
    widget.style.bottom = 'auto';
    widget.style.left = 'auto';
    widget.style.right = 'auto';

    const [vertical, horizontal] = pos.split('-');

    if (vertical === 'top') {
        widget.style.top = offY;
    } else {
        widget.style.bottom = offY;
    }

    if (horizontal === 'left') {
        widget.style.left = offX;
    } else {
        widget.style.right = offX;
    }
}

function closeAddModal() {
    const modal = document.getElementById('es-add-modal');
    if (modal) modal.classList.add('hidden');
    esEditingSiteId = null;
}

function copyScript(script) {
    navigator.clipboard.writeText(script).then(() => {
        showToast('コピーしました！');
    });
}

async function deleteSite(id) {
    if (!confirm('本当に削除しますか？\nこの操作は取り消せません。')) return;

    try {
        const res = await fetch(`/api/embedded-sites/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadSites();
            showToast('削除しました');
        } else {
            showAlert('エラー', '削除に失敗しました');
        }
    } catch (e) {
        console.error(e);
    }
}
