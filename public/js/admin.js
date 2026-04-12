import { setupSpaLinks, navigateTo } from './router.js';
import { escapeHtml, sanitizeAvatarUrl } from './sanitize.js';

let allModels = [];

export async function initAdminModelsPage() {
    const listContainer = document.getElementById('admin-models-list');
    const sidebarSearchInput = document.getElementById('admin-sidebar-search');
    const addBtn = document.getElementById('admin-add-model-btn');
    const modal = document.getElementById('admin-model-modal');
    const closeBtn = document.getElementById('admin-close-model-modal-btn');
    const cancelBtn = document.getElementById('admin-cancel-model-btn');
    const form = document.getElementById('admin-model-form');

    if (!listContainer) return;

    // --- Inner Functions ---

    async function fetchModels() {
        try {
            const res = await fetch('/api/admin/models');
            if (res.status === 403 || res.status === 401) {
                listContainer.innerHTML = '<div class="admin-error">管理者権限がないか、セッションが切れています。</div>';
                if (addBtn) addBtn.style.display = 'none';
                return;
            }
            allModels = await res.json();
            renderModels(allModels);
        } catch (e) {
            console.error('Failed to fetch models:', e);
            listContainer.innerHTML = '<div class="admin-error">読み込みに失敗しました。</div>';
        }
    }

    function renderModels(models) {
        if (!listContainer) return;
        if (!models || models.length === 0) {
            listContainer.innerHTML = '<div class="admin-error">モデルが登録されていません。</div>';
            return;
        }

        listContainer.className = 'pages-grid';
        listContainer.innerHTML = models.map(m => `
            <div class="page-card ${m.isActive ? '' : 'inactive'}" data-id="${m.id}" style="cursor: default;">
                <div class="page-card-icon" style="background: ${m.isActive ? 'linear-gradient(135deg, var(--primary-color), #8b5cf6)' : '#6e7681'};">
                    <i class="fa-solid fa-gears"></i>
                </div>
                <div class="page-card-info">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 1.1rem;">${escapeHtml(m.name)}</h3>
                        <span class="badge ${m.isActive ? 'active' : 'inactive'}" style="font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 10px; background: ${m.isActive ? '#238636' : '#6e7681'}; color: white;">${m.isActive ? '有効' : '無効'}</span>
                    </div>
                    <p style="margin: 0.5rem 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                        ID: <code>${escapeHtml(m.id)}</code><br>
                        File: <code>${escapeHtml(m.modelFile)}</code>
                    </p>
                    <div class="admin-card-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                        <button class="btn-icon-only edit-btn" title="編集" style="background: none; border: none; color: var(--text-muted); cursor: pointer;"><i class="fa-solid fa-pen"></i></button>
                        ${m.id !== 'normal' ? `<button class="btn-icon-only delete-btn" title="削除" style="background: none; border: none; color: #ef4444; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        // Attach event listeners
        listContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.closest('.page-card').dataset.id;
                const model = allModels.find(m => m.id === id);
                if (model) showModal(model);
            };
        });

        listContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.closest('.page-card').dataset.id;
                if (window.showConfirmModal) {
                    window.showConfirmModal(
                        'モデルの削除',
                        `モデル "${id}" を削除してもよろしいですか？`,
                        () => deleteModel(id)
                    );
                } else if (confirm(`モデル "${id}" を削除してもよろしいですか？`)) {
                    await deleteModel(id);
                }
            };
        });
    }

    function showModal(model = null) {
        if (!modal || !form) return;
        const titleElem = document.getElementById('admin-model-modal-title');
        if (titleElem) titleElem.textContent = model ? 'モデルを編集' : '新しいモデルを追加';

        form.modelId.value = model ? model.id : '';
        form.modelId.readOnly = !!model;
        form.name.value = model ? model.name : '';
        form.apiUrl.value = model ? model.apiUrl : '';
        form.modelFile.value = model ? model.modelFile : '';
        form.description.value = model ? model.description || '' : '';
        form.isActive.checked = model ? model.isActive : true;

        modal.classList.remove('hidden');
    }

    function hideModal() {
        if (modal) modal.classList.add('hidden');
        if (form) form.reset();
    }

    async function saveModel(e) {
        e.preventDefault();
        const formData = new FormData(form);
        const modelData = {
            id: formData.get('modelId'),
            name: formData.get('name'),
            apiUrl: formData.get('apiUrl'),
            modelFile: formData.get('modelFile'),
            description: formData.get('description'),
            isActive: form.isActive.checked
        };

        try {
            const res = await fetch('/api/admin/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelData })
            });

            if (res.ok) {
                hideModal();
                await fetchModels();
            } else {
                const data = await res.json();
                if (window.showAlertModal) window.showAlertModal('エラー', data.error);
                else alert('エラー: ' + data.error);
            }
        } catch (err) {
            console.error('Save failed:', err);
            if (window.showAlertModal) window.showAlertModal('エラー', '保存に失敗しました。');
            else alert('保存に失敗しました。');
        }
    }

    async function deleteModel(id) {
        try {
            const res = await fetch(`/api/admin/models/${id}`, { method: 'DELETE' });
            if (res.ok) {
                await fetchModels();
            } else {
                const data = await res.json();
                if (window.showAlertModal) window.showAlertModal('エラー', data.error);
                else alert('エラー: ' + data.error);
            }
        } catch (err) {
            console.error('Delete failed:', err);
            if (window.showAlertModal) window.showAlertModal('エラー', '削除に失敗しました。');
            else alert('削除に失敗しました。');
        }
    }

    // --- Main Logics ---

    if (sidebarSearchInput) {
        sidebarSearchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = allModels.filter(m =>
                m.name.toLowerCase().includes(q) ||
                m.id.toLowerCase().includes(q) ||
                (m.description && m.description.toLowerCase().includes(q))
            );
            renderModels(filtered);
        };
    }

    if (addBtn) addBtn.onclick = () => showModal();
    if (closeBtn) closeBtn.onclick = hideModal;
    if (cancelBtn) cancelBtn.onclick = hideModal;
    if (form) form.onsubmit = saveModel;

    await fetchModels();
}

let allUsers = [];

export async function initAdminUsersPage() {
    const listContainer = document.getElementById('admin-users-list-body');
    const sidebarSearchInput = document.getElementById('admin-sidebar-search');
    const modal = document.getElementById('admin-user-role-modal');
    const closeBtn = document.getElementById('admin-close-user-role-modal-btn');
    const cancelBtn = document.getElementById('admin-cancel-user-role-btn');
    const form = document.getElementById('admin-user-role-form');
    const sortNameBtn = document.getElementById('admin-sort-name');
    const sortDateBtn = document.getElementById('admin-sort-date');
    const userCountBadge = document.getElementById('admin-user-count');

    if (!listContainer) return;

    async function fetchUsers() {
        try {
            const res = await fetch('/api/admin/users');
            if (res.status === 403 || res.status === 401) {
                listContainer.innerHTML = '<div class="admin-error">管理者権限がないか、セッションが切れています。</div>';
                return;
            }
            allUsers = await res.json();
            renderUsers(allUsers);
        } catch (e) {
            console.error('Failed to fetch users:', e);
            listContainer.innerHTML = '<div class="admin-error">読み込みに失敗しました。</div>';
        }
    }

    function renderUsers(users) {
        if (!listContainer) return;

        if (userCountBadge) userCountBadge.textContent = `${users.length} 名のユーザー`;

        if (!users || users.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">ユーザーが見つかりません。</td></tr>';
            return;
        }

        listContainer.innerHTML = users.map(u => {
            const dateStr = new Date(u.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
            return `
            <tr data-id="${u.id}">
                <td style="padding: 1rem;">
                    <div class="user-cell">
                        <img src="${sanitizeAvatarUrl(u.avatar_url)}" class="user-avatar-sm">
                        <div class="user-name-wrapper">
                            <span class="user-full-name">${escapeHtml(u.name || u.username)}</span>
                            <span class="user-username-sub">@${escapeHtml(u.username)}</span>
                        </div>
                    </div>
                </td>
                <td style="padding: 1rem;">
                    <span class="badge ${u.role}" style="font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 12px; background: ${u.role === 'admin' ? '#cf222e' : '#6e7681'}; color: white;">
                        ${u.role === 'admin' ? '管理者' : 'メンバー'}
                    </span>
                </td>
                <td style="padding: 1rem;">
                    ${u.is_pro ? '<span style="color: #f1c40f;"><i class="fa-solid fa-crown"></i> PRO</span>' : '<span style="color: var(--text-muted);">Free</span>'}
                </td>
                <td style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">
                    ${dateStr}
                </td>
                <td style="padding: 1rem; text-align: right;">
                    <button class="btn-icon-only edit-role-btn" title="権限変更" style="background: none; border: none; color: var(--text-muted); cursor: pointer;"><i class="fa-solid fa-user-shield"></i></button>
                </td>
            </tr>
        `;
        }).join('');

        listContainer.querySelectorAll('.edit-role-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.closest('tr').dataset.id;
                const user = allUsers.find(u => u.id === id);
                if (user) showRoleModal(user);
            };
        });
    }

    function showRoleModal(user) {
        if (!modal || !form) return;

        form.id.value = user.id;
        document.getElementById('admin-user-role-avatar').src = sanitizeAvatarUrl(user.avatar_url);
        document.getElementById('admin-user-role-name').textContent = user.name || user.username;
        document.getElementById('admin-user-role-username').textContent = `@${user.username}`;
        form.role.value = user.role;

        modal.classList.remove('hidden');
    }

    function hideRoleModal() {
        if (modal) modal.classList.add('hidden');
        if (form) form.reset();
    }

    async function saveRole(e) {
        e.preventDefault();
        const formData = new FormData(form);
        const userId = formData.get('id');
        const role = formData.get('role');

        try {
            const res = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });

            if (res.ok) {
                hideRoleModal();
                await fetchUsers();
            } else {
                const data = await res.json();
                if (window.showAlertModal) window.showAlertModal('エラー', data.error);
                else alert('エラー: ' + data.error);
            }
        } catch (err) {
            console.error('Save failed:', err);
            if (window.showAlertModal) window.showAlertModal('エラー', '保存に失敗しました。');
            else alert('保存に失敗しました。');
        }
    }

    if (sidebarSearchInput) {
        sidebarSearchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = allUsers.filter(u =>
                u.username.toLowerCase().includes(q) ||
                (u.name && u.name.toLowerCase().includes(q))
            );
            renderUsers(filtered);
        };
    }

    if (sortNameBtn) {
        sortNameBtn.onclick = () => {
            const sorted = [...allUsers].sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
            renderUsers(sorted);
        };
    }
    if (sortDateBtn) {
        sortDateBtn.onclick = () => {
            const sorted = [...allUsers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            renderUsers(sorted);
        };
    }

    if (closeBtn) closeBtn.onclick = hideRoleModal;
    if (cancelBtn) cancelBtn.onclick = hideRoleModal;
    if (form) form.onsubmit = saveRole;

    await fetchUsers();
}

let modelUsageChart = null;
let responseTimeChart = null;

export async function initAdminDashboardPage() {
    const rangeBtns = document.querySelectorAll('.range-btn');
    const totalRequestsElem = document.getElementById('stat-total-requests');
    const avgResponseElem = document.getElementById('stat-avg-response');
    const topModelElem = document.getElementById('stat-top-model');

    if (!totalRequestsElem) return;

    async function fetchAndRenderStats(range = '1D') {
        try {
            const res = await fetch(`/api/admin/stats?range=${range}`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();

            // Update Cards
            totalRequestsElem.textContent = data.totalRequests.toLocaleString();
            avgResponseElem.innerHTML = `${data.avgResponseTime.toFixed(2)} <span style="font-size: 1rem; font-weight: 400;">sec</span>`;

            const models = Object.keys(data.modelUsage);
            if (models.length > 0) {
                const topModel = models.reduce((a, b) => data.modelUsage[a] > data.modelUsage[b] ? a : b);
                topModelElem.textContent = topModel;
            } else {
                topModelElem.textContent = '--';
            }

            // Render Charts
            renderModelUsageChart(data.modelUsage);
            renderResponseTimeChart(data.responseTimeSeries, range);
        } catch (e) {
            console.error('Stats error:', e);
        }
    }

    function renderModelUsageChart(usage) {
        const canvas = document.getElementById('modelUsageChart');
        if (!canvas) return;

        if (modelUsageChart) modelUsageChart.destroy();

        const labels = Object.keys(usage);
        const values = Object.values(usage);

        // @ts-ignore
        modelUsageChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            usePointStyle: true,
                            padding: 20,
                            font: { size: 12 }
                        }
                    }
                },
                cutout: '70%',
                animation: { duration: 1000, easing: 'easeOutQuart' }
            }
        });
    }

    function renderResponseTimeChart(series, currentRange = '1D') {
        const canvas = document.getElementById('responseTimeChart');
        if (!canvas) return;

        if (responseTimeChart) responseTimeChart.destroy();

        // Sort by time
        series.sort((a, b) => new Date(a.t) - new Date(b.t));

        // Limit points for better performance if range is large
        const limit = 40;
        let displaySeries = series;
        if (series.length > limit) {
            const step = Math.floor(series.length / limit);
            displaySeries = series.filter((_, i) => i % step === 0);
        }

        const labels = displaySeries.map(s => {
            const d = new Date(s.t);
            if (currentRange === '1D') {
                return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            } else {
                return (d.getMonth() + 1) + '/' + d.getDate();
            }
        });
        const values = displaySeries.map(s => s.v);

        // @ts-ignore
        responseTimeChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Response Time (sec)',
                    data: values,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#ccc',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    rangeBtns.forEach(btn => {
        btn.onclick = () => {
            rangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchAndRenderStats(btn.dataset.range);
        };
    });

    await fetchAndRenderStats();
}


let allSettings = [];

// One-time setup for shared admin setting modal (in index.html). Used by 基本設定（連携・API） and ログインと認証.
function ensureAdminSettingModal() {
    if (window._adminSettingModalBound) return;
    const modal = document.getElementById('admin-setting-modal');
    const form = document.getElementById('admin-setting-form');
    const closeBtn = document.getElementById('admin-close-setting-modal-btn');
    const cancelBtn = document.getElementById('admin-cancel-setting-btn');
    if (!modal || !form) return;

    const hideModal = () => {
        modal.classList.add('hidden');
        form.reset();
    };

    const showModal = (setting) => {
        form.key.value = setting.key;
        form.displayKey.value = setting.key;
        form.value.value = setting.value || '';
        form.category.value = setting.category || 'general';
        form.description.value = (setting.description || '');
        const valueInput = document.getElementById('admin-setting-value-input');
        if (valueInput) {
            const isSecret = (setting.key || '').toLowerCase().includes('key') || (setting.key || '').toLowerCase().includes('secret') || (setting.key || '').toLowerCase().includes('token');
            valueInput.type = isSecret ? 'password' : 'text';
        }
        modal.classList.remove('hidden');
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = { key: formData.get('key'), value: formData.get('value'), category: formData.get('category') || 'general', description: formData.get('description') || '' };
        try {
            const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) {
                hideModal();
                if (typeof window.onAdminSettingSaved === 'function') window.onAdminSettingSaved();
                if (window.showAlertModal) window.showAlertModal('成功', '設定を保存しました。');
            } else {
                const errData = await res.json();
                if (window.showAlertModal) window.showAlertModal('エラー', errData.error || '保存に失敗しました。');
            }
        } catch (err) {
            if (window.showAlertModal) window.showAlertModal('エラー', '保存に失敗しました。');
        }
    };
    closeBtn.addEventListener('click', hideModal);
    cancelBtn.addEventListener('click', hideModal);
    window.showAdminSettingModal = showModal;
    window._adminSettingModalBound = true;
}

export async function initAdminBasicPage() {
    const form = document.getElementById('admin-basic-form');
    const siteTitleInput = document.getElementById('basic-site-title');
    const metaDescInput = document.getElementById('basic-meta-desc');
    const metaKeywordsInput = document.getElementById('basic-meta-keywords');
    const suggestionList = document.getElementById('admin-basic-suggestion-list');
    const addCardBtn = document.getElementById('admin-basic-add-card');
    const cancelBtn = document.getElementById('admin-basic-cancel');
    const metaDot = document.getElementById('admin-basic-meta-dot');
    const suggestionDot = document.getElementById('admin-basic-suggestion-dot');
    const integrationDot = document.getElementById('admin-basic-integration-dot');
    const unsavedBar = document.getElementById('admin-unsaved-bar');
    const unsavedSaveBtn = document.getElementById('admin-unsaved-save-btn');
    const unsavedCancelBtn = document.getElementById('admin-unsaved-cancel-btn');

    if (!form || !suggestionList) return;

    let suggestionCards = [];
    let initialSnapshot = { siteTitle: '', metaDescription: '', metaKeywords: '', suggestionCards: [] };
    let metaDirty = false;
    let suggestionDirty = false;
    let integrationDirty = false;
    let integrationOriginal = {};
    let integrationCurrent = {};
    let integrationListData = [];

    function setDirty(section) {
        if (section === 'meta') metaDirty = true;
        if (section === 'suggestion') suggestionDirty = true;
        if (section === 'integration') integrationDirty = true;
        if (metaDot) metaDot.classList.toggle('hidden', !metaDirty);
        if (suggestionDot) suggestionDot.classList.toggle('hidden', !suggestionDirty);
        if (integrationDot) integrationDot.classList.toggle('hidden', !integrationDirty);
        if (unsavedBar) unsavedBar.classList.toggle('hidden', !metaDirty && !suggestionDirty && !integrationDirty);
    }

    function clearDirty() {
        metaDirty = false;
        suggestionDirty = false;
        integrationDirty = false;
        if (metaDot) metaDot.classList.add('hidden');
        if (suggestionDot) suggestionDot.classList.add('hidden');
        if (integrationDot) integrationDot.classList.add('hidden');
        if (unsavedBar) unsavedBar.classList.add('hidden');
    }

    function renderSuggestionList() {
        suggestionList.innerHTML = suggestionCards.map((card, i) => {
            const iconType = (card.iconType === 'svg') ? 'svg' : 'fa';
            const promptVal = escapeHtml((card.prompt || '').replace(/"/g, '&quot;'));
            const textVal = escapeHtml((card.text || '').replace(/"/g, '&quot;'));
            const faVal = escapeHtml((card.iconType !== 'svg' && card.icon) ? String(card.icon) : '');
            return `
            <div class="admin-basic-card-row" data-index="${i}">
                <input type="text" class="basic-card-prompt" placeholder="プロンプト（送信する質問）" value="${promptVal}">
                <input type="text" class="basic-card-text" placeholder="表示テキスト" value="${textVal}">
                <div class="basic-card-icon-type">
                    <label><input type="radio" name="icon-type-${i}" class="basic-card-icon-type-fa" value="fa" ${iconType === 'fa' ? 'checked' : ''}> Font Awesome</label>
                    <label><input type="radio" name="icon-type-${i}" class="basic-card-icon-type-svg" value="svg" ${iconType === 'svg' ? 'checked' : ''}> SVG</label>
                </div>
                <div class="basic-card-icon-fa-wrap" style="display:${iconType === 'fa' ? 'block' : 'none'}">
                    <input type="text" class="basic-card-icon-fa" placeholder="例: fa-solid fa-book" value="${faVal}">
                </div>
                <div class="basic-card-icon-svg-wrap" style="display:${iconType === 'svg' ? 'block' : 'none'}">
                    <textarea class="basic-card-icon-svg" placeholder="<svg>...</svg> のインラインコードを貼り付け" rows="3"></textarea>
                </div>
                <div class="basic-card-actions">
                    <button type="button" class="btn-icon-only basic-card-move-up" title="上へ" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-up"></i></button>
                    <button type="button" class="btn-icon-only basic-card-move-down" title="下へ" ${i === suggestionCards.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i></button>
                    <button type="button" class="btn-icon-only basic-card-remove" title="削除"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        }).join('');

        suggestionList.querySelectorAll('.admin-basic-card-row').forEach((row, i) => {
            const card = suggestionCards[i];
            if (card && card.iconType === 'svg' && card.icon) {
                const ta = row.querySelector('.basic-card-icon-svg');
                if (ta) ta.value = card.icon;
            }
            const faRadio = row.querySelector('.basic-card-icon-type-fa');
            const svgRadio = row.querySelector('.basic-card-icon-type-svg');
            const faWrap = row.querySelector('.basic-card-icon-fa-wrap');
            const svgWrap = row.querySelector('.basic-card-icon-svg-wrap');
            const toggle = () => {
                const useSvg = svgRadio && svgRadio.checked;
                if (faWrap) faWrap.style.display = useSvg ? 'none' : 'block';
                if (svgWrap) svgWrap.style.display = useSvg ? 'block' : 'none';
                setDirty('suggestion');
            };
            if (faRadio) faRadio.addEventListener('change', () => { toggle(); setDirty('suggestion'); });
            if (svgRadio) svgRadio.addEventListener('change', () => { toggle(); setDirty('suggestion'); });
            row.querySelectorAll('.basic-card-prompt, .basic-card-text, .basic-card-icon-fa, .basic-card-icon-svg').forEach((el) => {
                el.addEventListener('input', () => setDirty('suggestion'));
                el.addEventListener('change', () => setDirty('suggestion'));
            });
        });

        suggestionList.querySelectorAll('.basic-card-move-up').forEach(btn => {
            btn.onclick = () => {
                suggestionCards = getCardsFromDom();
                const idx = parseInt(btn.closest('.admin-basic-card-row').dataset.index, 10);
                if (idx <= 0) return;
                [suggestionCards[idx], suggestionCards[idx - 1]] = [suggestionCards[idx - 1], suggestionCards[idx]];
                setDirty('suggestion');
                renderSuggestionList();
            };
        });
        suggestionList.querySelectorAll('.basic-card-move-down').forEach(btn => {
            btn.onclick = () => {
                suggestionCards = getCardsFromDom();
                const idx = parseInt(btn.closest('.admin-basic-card-row').dataset.index, 10);
                if (idx >= suggestionCards.length - 1) return;
                [suggestionCards[idx], suggestionCards[idx + 1]] = [suggestionCards[idx + 1], suggestionCards[idx]];
                setDirty('suggestion');
                renderSuggestionList();
            };
        });
        suggestionList.querySelectorAll('.basic-card-remove').forEach(btn => {
            btn.onclick = () => {
                suggestionCards = getCardsFromDom();
                const idx = parseInt(btn.closest('.admin-basic-card-row').dataset.index, 10);
                suggestionCards.splice(idx, 1);
                setDirty('suggestion');
                renderSuggestionList();
            };
        });
    }

    function getCardsFromDom() {
        const cards = [];
        suggestionList.querySelectorAll('.admin-basic-card-row').forEach((row) => {
            const useSvg = row.querySelector('.basic-card-icon-type-svg')?.checked;
            cards.push({
                prompt: row.querySelector('.basic-card-prompt')?.value?.trim() || '',
                text: row.querySelector('.basic-card-text')?.value?.trim() || '',
                iconType: useSvg ? 'svg' : 'fa',
                icon: useSvg
                    ? (row.querySelector('.basic-card-icon-svg')?.value?.trim() || '')
                    : (row.querySelector('.basic-card-icon-fa')?.value?.trim() || '')
            });
        });
        return cards;
    }

    async function loadAndApply() {
        try {
            const res = await fetch('/api/admin/basic-settings');
            if (res.status === 403 || res.status === 401) {
                if (window.showAlertModal) window.showAlertModal('エラー', '管理者権限がありません。');
                return;
            }
            const data = await res.json();
            const title = data.siteTitle || '';
            const desc = data.metaDescription || '';
            const kw = data.metaKeywords || '';
            siteTitleInput.value = title;
            metaDescInput.value = desc;
            metaKeywordsInput.value = kw;
            suggestionCards = Array.isArray(data.suggestionCards) ? data.suggestionCards.map((c) => ({
                prompt: c.prompt || '',
                text: c.text || '',
                iconType: (c.iconType === 'svg') ? 'svg' : 'fa',
                icon: c.icon || ''
            })) : [];
            initialSnapshot = { siteTitle: title, metaDescription: desc, metaKeywords: kw, suggestionCards: JSON.parse(JSON.stringify(suggestionCards)) };
            clearDirty();
            renderSuggestionList();
        } catch (e) {
            console.error('Failed to fetch basic settings:', e);
            if (window.showAlertModal) window.showAlertModal('エラー', '基本設定の取得に失敗しました。');
        }
    }

    const integrationListEl = document.getElementById('admin-basic-integration-list');

    function renderIntegrationRows() {
        if (!integrationListEl || integrationListData.length === 0) return;
        integrationListEl.innerHTML = integrationListData.map(s => {
            const isSecret = (s.key || '').toLowerCase().includes('key') || (s.key || '').toLowerCase().includes('secret') || (s.key || '').toLowerCase().includes('token');
            const val = integrationCurrent[s.key] !== undefined ? integrationCurrent[s.key] : (s.value || '');
            const displayValue = isSecret && val ? '••••••••••••••••' : (val || '（未設定）');
            return `
                <div class="admin-integration-row" data-key="${escapeHtml(s.key)}">
                    <code class="admin-integration-key">${escapeHtml(s.key)}</code>
                    <span class="admin-integration-val inline-edit" data-key="${escapeHtml(s.key)}" data-secret="${isSecret ? '1' : '0'}" tabindex="0" role="button">${escapeHtml(displayValue)}</span>
                </div>`;
        }).join('');
        integrationListEl.querySelectorAll('.admin-integration-val.inline-edit').forEach(span => {
            span.addEventListener('click', () => startInlineEdit(span));
            span.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startInlineEdit(span); } });
        });
    }

    function startInlineEdit(span) {
        const key = span.dataset.key;
        const isSecret = span.dataset.secret === '1';
        const current = integrationCurrent[key] !== undefined ? integrationCurrent[key] : (integrationOriginal[key] || '');
        const input = document.createElement('input');
        input.type = isSecret ? 'password' : 'text';
        input.className = 'admin-inline-input';
        input.value = current;
        input.style.cssText = 'flex:1;min-width:120px;padding:0.25rem 0.5rem;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-color);font-size:0.88rem;';
        span.replaceWith(input);
        input.focus();
        const finish = () => {
            const newVal = input.value.trim();
            integrationCurrent[key] = newVal;
            if (integrationCurrent[key] !== integrationOriginal[key]) setDirty('integration');
            const newSpan = document.createElement('span');
            newSpan.className = 'admin-integration-val inline-edit';
            newSpan.dataset.key = key;
            newSpan.dataset.secret = isSecret ? '1' : '0';
            newSpan.tabIndex = 0;
            newSpan.setAttribute('role', 'button');
            const display = isSecret && newVal ? '••••••••••••••••' : (newVal || '（未設定）');
            newSpan.textContent = display;
            newSpan.addEventListener('click', () => startInlineEdit(newSpan));
            newSpan.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startInlineEdit(newSpan); } });
            input.replaceWith(newSpan);
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
    }

    async function fetchAndRenderIntegrationSettings() {
        if (!integrationListEl) return;
        try {
            const res = await fetch('/api/admin/settings');
            if (res.status === 403 || res.status === 401) return;
            const settings = await res.json();
            const INTEGRATION_KEYS = ['POINTS_API_KEY', 'SHORT_URL_API_KEY', 'WEBHOOK_TOKEN', 'VOICEVOX_URL'];
            const integration = settings.filter(s => INTEGRATION_KEYS.includes(s.key) || (s.category || '').toLowerCase() === 'integration');
            const knownKeys = new Set(INTEGRATION_KEYS);
            integration.sort((a, b) => {
                const ai = knownKeys.has(a.key) ? INTEGRATION_KEYS.indexOf(a.key) : 999;
                const bi = knownKeys.has(b.key) ? INTEGRATION_KEYS.indexOf(b.key) : 999;
                return (ai - bi) || String(a.key).localeCompare(b.key);
            });
            integrationListData = integration;
            integrationOriginal = {};
            integrationCurrent = {};
            integration.forEach(s => {
                integrationOriginal[s.key] = s.value || '';
                integrationCurrent[s.key] = s.value || '';
            });
            if (integration.length === 0) {
                integrationListEl.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">連携・API 用の設定はまだありません。</p>';
                return;
            }
            renderIntegrationRows();
        } catch (e) {
            console.error('Failed to fetch integration settings:', e);
            if (integrationListEl) integrationListEl.innerHTML = '<p class="admin-error">取得に失敗しました。</p>';
        }
    }

    window.onAdminSettingSaved = fetchAndRenderIntegrationSettings;
    await fetchAndRenderIntegrationSettings();

    await loadAndApply();

    [siteTitleInput, metaDescInput, metaKeywordsInput].forEach((el) => {
        if (el) {
            el.addEventListener('input', () => setDirty('meta'));
            el.addEventListener('change', () => setDirty('meta'));
        }
    });

    if (addCardBtn) {
        addCardBtn.onclick = () => {
            suggestionCards = getCardsFromDom();
            suggestionCards.push({ prompt: '', text: '', iconType: 'fa', icon: '' });
            setDirty('suggestion');
            renderSuggestionList();
        };
    }

    function revertAll() {
        siteTitleInput.value = initialSnapshot.siteTitle;
        metaDescInput.value = initialSnapshot.metaDescription;
        metaKeywordsInput.value = initialSnapshot.metaKeywords;
        suggestionCards = JSON.parse(JSON.stringify(initialSnapshot.suggestionCards));
        Object.keys(integrationOriginal).forEach(k => { integrationCurrent[k] = integrationOriginal[k]; });
        clearDirty();
        renderSuggestionList();
        if (integrationListData.length) renderIntegrationRows();
    }

    if (cancelBtn) cancelBtn.onclick = revertAll;

    if (unsavedCancelBtn) unsavedCancelBtn.onclick = revertAll;

    async function saveAll() {
        const promises = [];
        if (metaDirty || suggestionDirty) {
            const payload = {
                siteTitle: siteTitleInput?.value?.trim() || '',
                metaDescription: metaDescInput?.value?.trim() || '',
                metaKeywords: metaKeywordsInput?.value?.trim() || '',
                suggestionCards: getCardsFromDom()
            };
            promises.push(
                fetch('/api/admin/basic-settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).then(async (res) => {
                    if (res.ok) {
                        initialSnapshot = { siteTitle: payload.siteTitle, metaDescription: payload.metaDescription, metaKeywords: payload.metaKeywords, suggestionCards: JSON.parse(JSON.stringify(payload.suggestionCards)) };
                    }
                    return res;
                })
            );
        }
        if (integrationDirty) {
            Object.keys(integrationOriginal).forEach(key => {
                if (integrationCurrent[key] !== integrationOriginal[key]) {
                    promises.push(
                        fetch('/api/admin/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                key: key,
                                value: integrationCurrent[key] || '',
                                category: integrationListData.find(s => s.key === key)?.category || 'integration',
                                description: integrationListData.find(s => s.key === key)?.description || ''
                            })
                        }).then(async (res) => {
                            if (res.ok) integrationOriginal[key] = integrationCurrent[key];
                            return res;
                        })
                    );
                }
            });
        }
        try {
            const results = await Promise.all(promises);
            const allOk = results.every(r => r.ok);
            if (allOk) {
                clearDirty();
                await fetchAndRenderIntegrationSettings();
                if (window.showAlertModal) window.showAlertModal('保存しました', '設定を保存しました。');
            } else {
                const errRes = results.find(r => !r.ok);
                const errData = errRes ? await errRes.json().catch(() => ({})) : {};
                if (window.showAlertModal) window.showAlertModal('エラー', errData.error || '保存に失敗しました。');
            }
        } catch (err) {
            console.error('Save failed:', err);
            if (window.showAlertModal) window.showAlertModal('エラー', '保存に失敗しました。');
        }
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveAll();
    };

    if (unsavedSaveBtn) unsavedSaveBtn.onclick = saveAll;
}

export async function initAdminPluginsPage() {
    const container = document.getElementById('admin-plugins-container');
    const toolbar = document.getElementById('admin-plugins-toolbar');
    const addBtn = document.getElementById('admin-plugins-add-btn');
    const fileInput = document.getElementById('admin-plugins-file-input');
    const multiSelectBtn = document.getElementById('admin-plugins-multi-select-btn');
    const selectedCountEl = document.getElementById('admin-plugins-selected-count');
    const disableSelectedBtn = document.getElementById('admin-plugins-disable-selected-btn');
    const cancelSelectBtn = document.getElementById('admin-plugins-cancel-select-btn');

    if (!container) return;

    let isMultiSelectMode = false;
    let pluginListData = [];

    container.innerHTML = '<div style="color: var(--text-muted); padding: 2rem;">読み込み中...</div>';
    if (toolbar) toolbar.classList.add('hidden');

    try {
        const [pluginsRes, filesRes] = await Promise.all([
            fetch('/api/admin/plugins'),
            fetch('/api/admin/plugins/files')
        ]);
        if (pluginsRes.status === 403 || pluginsRes.status === 401) {
            container.innerHTML = '<div class="admin-error">管理者権限がないか、セッションが切れています。</div>';
            return;
        }
        const pluginsData = await pluginsRes.json();
        const filesData = await filesRes.json();
        renderPluginList(pluginsData, filesData.files || []);
    } catch (e) {
        console.error('Failed to fetch plugins:', e);
        container.innerHTML = '<div class="admin-error">プラグイン情報の取得に失敗しました。</div>';
    }

    function mergePluginData({ plugins }, files) {
        const byId = {};
        plugins.forEach(p => { byId[p.id] = p; });
        return files.map(f => {
            const id = f.filename.replace(/\.js$/, '');
            const loaded = byId[id];
            return {
                id,
                filename: f.filename,
                name: loaded ? loaded.name : (f.meta?.name || id),
                description: loaded ? loaded.description : (f.meta?.description || ''),
                type: loaded ? (Array.isArray(loaded.type) ? loaded.type[0] : loaded.type) : null,
                types: loaded ? (Array.isArray(loaded.type) ? loaded.type : [loaded.type]) : [],
                isLoaded: !!loaded,
                isZipPlugin: f.isZipPlugin
            };
        });
    }

    function renderPluginList(pluginsData, files) {
        pluginListData = mergePluginData(pluginsData, files);
        const typeLabel = { auth: '認証', points: 'ポイント' };
        const typeIcon = { auth: 'fa-key', points: 'fa-coins' };

        if (pluginListData.length === 0) {
            container.innerHTML = `
                <div class="admin-table-container" style="overflow-x: auto; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border-color);">
                    <div style="padding: 3rem; text-align: center; color: var(--text-muted);">
                        プラグインがありません。「追加」ボタンから .js または .zip ファイルをアップロードしてください。
                    </div>
                </div>
                <div class="plugin-restart-bar" style="margin-top: 1.5rem;">
                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">プラグインの追加・削除・設定変更は<strong>サーバーの再起動</strong>で反映されます。</p>
                </div>`;
            return;
        }

        const checkboxCol = isMultiSelectMode
            ? '<th style="width: 48px; padding: 1rem;"><input type="checkbox" id="admin-plugins-select-all" title="すべて選択"></th>'
            : '';

        const rows = pluginListData.map(p => {
            const types = Array.isArray(p.types) ? p.types : (p.types ? [p.types] : []);
            const typeBadges = types.map(t => `<span class="plugin-badge plugin-badge-active">${typeLabel[t] || t}</span>`).join('');
            const loadBadge = p.isLoaded
                ? '<span class="plugin-badge plugin-badge-loaded">ロード済み</span>'
                : '<span class="plugin-badge plugin-badge-unloaded">未ロード</span>';

            const cbCell = isMultiSelectMode
                ? `<td style="padding: 1rem;"><input type="checkbox" class="admin-plugin-row-cb" data-id="${escapeHtml(p.id)}" ${!p.isLoaded ? 'disabled' : ''}></td>`
                : '';

            return `
            <tr data-id="${escapeHtml(p.id)}" class="admin-plugin-row">
                ${cbCell}
                <td style="padding: 1rem;">
                    <a href="/admin/plugins/${encodeURIComponent(p.id)}" class="spa-link admin-plugin-row-link" style="display: flex; align-items: center; gap: 1rem; text-decoration: none; color: inherit;">
                        <div class="page-card-icon" style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid ${typeIcon[p.type] || 'fa-puzzle-piece'}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 600;">${escapeHtml(p.name)}</div>
                            ${p.description ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.15rem;">${escapeHtml(p.description)}</div>` : ''}
                        </div>
                    </a>
                </td>
                <td style="padding: 1rem;">
                    <span style="display: flex; gap: 0.35rem; flex-wrap: wrap;">${loadBadge} ${typeBadges}</span>
                </td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div class="admin-table-container" style="overflow-x: auto; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border-color);">
                <table class="admin-table admin-plugin-table" style="width: 100%; border-collapse: collapse; min-width: 500px;">
                    <thead>
                        <tr style="text-align: left;">
                            ${checkboxCol}
                            <th style="padding: 1rem;">プラグイン</th>
                            <th style="padding: 1rem;">状態</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div class="plugin-restart-bar" style="margin-top: 1.5rem;">
                <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">プラグインの追加・削除・設定変更は<strong>サーバーの再起動</strong>で反映されます。</p>
            </div>`;

        setupSpaLinks(container);
        bindPluginListEvents();
    }

    function bindPluginListEvents() {
        const selectAll = container.querySelector('#admin-plugins-select-all');
        if (selectAll) {
            selectAll.addEventListener('change', () => {
                const checked = selectAll.checked;
                container.querySelectorAll('.admin-plugin-row-cb:not(:disabled)').forEach(cb => { cb.checked = checked; });
                updateToolbar();
            });
        }
        container.querySelectorAll('.admin-plugin-row-cb').forEach(cb => {
            cb.addEventListener('change', () => updateToolbar());
        });
        container.querySelectorAll('.admin-plugin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (isMultiSelectMode && !e.target.closest('a')) {
                    const cb = row.querySelector('.admin-plugin-row-cb');
                    if (cb && !cb.disabled) { cb.checked = !cb.checked; updateToolbar(); }
                }
            });
        });
    }

    function updateToolbar() {
        const checked = container.querySelectorAll('.admin-plugin-row-cb:checked');
        const n = checked.length;
        if (selectedCountEl) selectedCountEl.textContent = n > 0 ? `${n}件選択中` : '';
        if (disableSelectedBtn) disableSelectedBtn.disabled = n === 0;
    }

    function setMultiSelectMode(on) {
        isMultiSelectMode = !!on;
        if (toolbar) toolbar.classList.toggle('hidden', !on);
        if (multiSelectBtn) {
            multiSelectBtn.textContent = on ? '選択解除' : '複数選択';
            multiSelectBtn.classList.toggle('active', on);
        }
        renderPluginList(
            { plugins: pluginListData.filter(p => p.isLoaded).map(p => ({ id: p.id, name: p.name, type: p.type, types: p.types, description: p.description })) },
            pluginListData.map(p => ({ filename: p.filename, isZipPlugin: p.isZipPlugin, meta: {} }))
        );
    }

    if (multiSelectBtn) multiSelectBtn.addEventListener('click', () => setMultiSelectMode(!isMultiSelectMode));
    if (cancelSelectBtn) cancelSelectBtn.addEventListener('click', () => setMultiSelectMode(false));
    if (disableSelectedBtn) {
        disableSelectedBtn.addEventListener('click', () => {
            const checked = container.querySelectorAll('.admin-plugin-row-cb:checked');
            if (checked.length === 0) return;
            alert('無効化するには、各プラグインの必要な設定をシステム設定から削除し、サーバーを再起動してください。\n\n詳細は各プラグインの設定画面で確認できます。');
        });
    }

    if (addBtn && fileInput) {
        addBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            if (!file.name.endsWith('.js') && !file.name.endsWith('.zip')) {
                (window.showAlertModal || ((t, m) => alert(m)))('エラー', '.js または .zip ファイルのみアップロードできます');
                return;
            }
            const formData = new FormData();
            formData.append('plugin', file);
            try {
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> アップロード中...';
                const r = await fetch('/api/admin/plugins/upload', { method: 'POST', body: formData });
                const d = await r.json();
                if (d.success) {
                    await initAdminPluginsPage();
                } else {
                    (window.showAlertModal || ((t, m) => alert(m)))('アップロード失敗', d.error || 'アップロードに失敗しました');
                }
            } catch (e) {
                (window.showAlertModal || ((t, m) => alert(m)))('エラー', 'アップロード中にエラーが発生しました');
            } finally {
                addBtn.disabled = false;
                addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> 追加';
            }
        });
    }
}

// =============================================================================
// プラグイン詳細ページ (/admin/plugins/:id)
// =============================================================================
export async function initAdminPluginDetailPage(pluginId) {
    const container = document.getElementById('admin-plugin-detail-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">読み込み中...</div>';

    try {
        const res = await fetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}`);
        if (!res.ok) {
            container.innerHTML = `<p style="color:var(--color-danger)">プラグインが見つかりません: ${escapeHtml(pluginId)}</p>`;
            return;
        }
        const data = await res.json();
        const { meta, enabled, loaded, hasIcon, readme } = data;

        const iconHtml = hasIcon
            ? `<img src="/api/admin/plugins/${encodeURIComponent(pluginId)}/icon" class="plugin-detail-icon" alt="icon">`
            : `<div class="plugin-detail-icon plugin-detail-icon-placeholder"><i class="fa-solid fa-puzzle-piece"></i></div>`;

        const typeLabel = { auth: '認証', points: 'ポイント' };
        const statusBadge = loaded
            ? (enabled ? `<span class="plugin-badge plugin-badge-active">有効</span>` : `<span class="plugin-badge plugin-badge-inactive">無効</span>`)
            : `<span class="plugin-badge">未ロード</span>`;

        const settingsHtml = (meta.settingsSchema && meta.settingsSchema.length > 0)
            ? `<div class="admin-card" style="margin-top:1.5rem;">
                <div class="admin-card-title"><i class="fa-solid fa-sliders"></i> 設定スキーマ</div>
                <div class="admin-card-body">
                    <p style="font-size:.85rem;color:var(--text-muted);margin:0 0 1rem;">このプラグインは以下の設定を必要とします。<a href="/admin/basic" class="spa-link">基本設定</a>の連携・API または <a href="/admin/auth" class="spa-link">ログインと認証</a> から設定してください。</p>
                    ${meta.settingsSchema.map(s => `
                        <div class="plugin-setting-row">
                            <code class="plugin-setting-key">${escapeHtml(s.key)}</code>
                            <span class="plugin-setting-label">${escapeHtml(s.label || '')}${s.required ? ' <span style="color:var(--color-danger)">必須</span>' : ''}</span>
                        </div>
                    `).join('')}
                </div>
               </div>`
            : '';

        const readmeHtml = readme
            ? `<div class="admin-card" style="margin-top:1.5rem;">
                <div class="admin-card-title"><i class="fa-solid fa-book"></i> README.md</div>
                <div class="plugin-readme">${readme.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
               </div>`
            : '';

        container.innerHTML = `
            <a href="/admin/plugins" class="spa-link plugin-detail-back">
                <i class="fa-solid fa-arrow-left"></i> プラグイン一覧に戻る
            </a>
            <div class="plugin-detail-header">
                ${iconHtml}
                <div class="plugin-detail-info">
                    <h2 class="plugin-detail-name">${escapeHtml(meta.name || meta.id)}</h2>
                    <div class="plugin-detail-badges">
                        ${statusBadge}
                        ${meta.version ? `<span class="plugin-badge">v${escapeHtml(String(meta.version))}</span>` : ''}
                        ${(() => {
                if (!meta.type) return '';
                const types = Array.isArray(meta.type) ? meta.type : [meta.type];
                return types.map(t => `<span class="plugin-badge">${escapeHtml(typeLabel[t] || String(t))}</span>`).join('');
            })()}
                    </div>
                    ${meta.description ? `<p class="plugin-detail-desc">${escapeHtml(meta.description)}</p>` : ''}
                </div>
            </div>

            <div class="admin-card">
                <div class="admin-card-title"><i class="fa-solid fa-toggle-on"></i> 有効/無効</div>
                <div class="admin-card-body">
                    <div class="plugin-toggle-row">
                        <div>
                            <p style="margin:0;font-weight:500;">プラグインを${loaded && enabled ? '無効にする' : '有効にする'}</p>
                            <p style="margin:.25rem 0 0;font-size:.85rem;color:var(--text-muted);">対応するAPIキーや設定の追加・削除で有効/無効を切り替えます。変更後はサーバーを再起動してください。</p>
                        </div>
                        <label class="plugin-toggle-switch">
                            <input type="checkbox" id="plugin-toggle-input" ${loaded && enabled ? 'checked' : ''}>
                            <span class="plugin-toggle-slider"></span>
                        </label>
                    </div>
                    <p id="plugin-toggle-msg" class="plugin-toggle-msg"></p>
                </div>
            </div>

            ${settingsHtml}
            ${readmeHtml}

            <div class="admin-card" style="margin-top:1.5rem;">
                <div class="admin-card-title"><i class="fa-solid fa-rotate"></i> サーバー再起動</div>
                <div class="admin-card-body">
                    <p style="color:var(--text-muted);font-size:.9rem;margin:0 0 1rem;">変更を反映するにはサーバーの再起動が必要です。</p>
                    <button class="btn btn-warning plugin-detail-restart-btn" id="plugin-detail-restart-btn">
                        <i class="fa-solid fa-rotate"></i> 再起動する
                    </button>
                </div>
            </div>

            <div class="admin-card" style="margin-top:1.5rem;">
                <div class="admin-card-title"><i class="fa-solid fa-trash"></i> プラグインの削除</div>
                <div class="admin-card-body">
                    ${loaded ? '<p style="color:var(--text-muted);font-size:.9rem;margin:0 0 1rem;">削除するには、まず無効化（必要な設定を削除して再起動）してから行ってください。</p><button class="btn btn-secondary" disabled title="無効化してから削除できます"><i class="fa-solid fa-trash"></i> 削除</button>' : `<p style="color:var(--text-muted);font-size:.9rem;margin:0 0 1rem;">このプラグインを削除します。再起動後に反映されます。</p><button class="btn btn-danger plugin-detail-delete-btn" id="plugin-detail-delete-btn" data-filename="${escapeHtml(pluginId + '.js')}"><i class="fa-solid fa-trash"></i> 削除</button>`}
                </div>
            </div>
        `;

        // トグルスイッチ（クリックで使い方メッセージを表示。実際のON/OFFは設定＋再起動で反映）
        const toggleInput = container.querySelector('#plugin-toggle-input');
        const toggleMsg = container.querySelector('#plugin-toggle-msg');

        container.querySelector('.plugin-toggle-switch')?.addEventListener('click', (e) => {
            e.preventDefault();
            const wrapper = e.currentTarget;
            wrapper.classList.add('plugin-toggle-clicked');
            setTimeout(() => wrapper.classList.remove('plugin-toggle-clicked'), 200);
            if (loaded && enabled) {
                toggleMsg.innerHTML = '<i class="fa-solid fa-circle-info"></i> 無効化するには、このプラグインに必要な設定（APIキーなど）を<a href="/admin/basic" class="spa-link">基本設定</a>・<a href="/admin/auth" class="spa-link">ログインと認証</a>から削除（空にする）してからサーバーを再起動してください。';
            } else {
                toggleMsg.innerHTML = '<i class="fa-solid fa-circle-info"></i> 有効化するには、このプラグインの必要な設定を<a href="/admin/basic" class="spa-link">基本設定</a>・<a href="/admin/auth" class="spa-link">ログインと認証</a>で正しく設定してからサーバーを再起動してください。';
            }
            toggleMsg.style.display = 'block';
            setupSpaLinks(document.getElementById('staticPageContainer') || container);
        });

        // 削除ボタン（無効化時のみ有効）
        container.querySelector('#plugin-detail-delete-btn')?.addEventListener('click', async () => {
            const filename = container.querySelector('#plugin-detail-delete-btn')?.dataset.filename;
            if (!filename || !confirm(`このプラグインを削除しますか？「${filename}」が削除され、再起動後に反映されます。`)) return;
            const btn = container.querySelector('#plugin-detail-delete-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 削除中...';
            try {
                const r = await fetch(`/api/admin/plugins/${encodeURIComponent(filename)}`, { method: 'DELETE' });
                const d = await r.json();
                if (d.success) {
                    navigateTo('/admin/plugins');
                } else {
                    (window.showAlertModal || alert)(d.error || '削除に失敗しました');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-trash"></i> 削除';
                }
            } catch (e) {
                (window.showAlertModal || alert)('削除中にエラーが発生しました');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash"></i> 削除';
            }
        });

        // 再起動ボタン
        container.querySelector('#plugin-detail-restart-btn')?.addEventListener('click', async () => {
            if (!confirm('サーバーを再起動しますか？約5秒後にページが自動リロードされます。')) return;
            const btn = container.querySelector('#plugin-detail-restart-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 再起動中...';
            try { await fetch('/api/admin/restart', { method: 'POST' }); } catch (e) { }
            let count = 5;
            const interval = setInterval(() => {
                btn.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> ${count}秒後にリロード...`;
                if (count-- <= 0) { clearInterval(interval); window.location.reload(); }
            }, 1000);
        });

        setupSpaLinks(document.getElementById('staticPageContainer') || container);

    } catch (e) {
        container.innerHTML = `<p style="color:var(--color-danger)">エラーが発生しました: ${e.message}</p>`;
    }
}


// =============================================================================
// ログインと認証ページ (/admin/auth)
// ─ 本体の認証設定（SMTP）と認証プラグインを明確に分離して表示
// =============================================================================
export async function initAdminAuthPage() {
    ensureAdminSettingModal();
    window.onAdminSettingSaved = () => initAdminAuthPage();

    const container = document.getElementById('admin-auth-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">読み込み中...</div>';

    try {
        const [pluginsRes, settingsRes] = await Promise.all([
            fetch('/api/admin/plugins'),
            fetch('/api/admin/settings'),
        ]);
        const pluginsData = await pluginsRes.json();
        const allSettings = settingsRes.ok ? await settingsRes.json() : [];

        const providers = pluginsData.providers || [];
        // 認証系プラグインの抽出
        const plugins = (pluginsData.plugins || []).filter(p => {
            const types = Array.isArray(p.type) ? p.type : [p.type];
            return types.includes('auth');
        });

        // SMTP設定を settings から抽出（category = 'mail' or キーにSMTPを含む）
        const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_FROM', 'MAIL_FROM'];
        const smtpSettings = allSettings.filter(s =>
            smtpKeys.includes(s.key) ||
            s.key.toUpperCase().startsWith('SMTP') ||
            s.category === 'mail'
        );

        const getSettingByKey = (key) => allSettings.find(s => s.key === key);
        const makeSettingStub = (key, category = 'general') => ({ key, value: '', category, description: '' });

        // --- セキュリティ・認証プロバイダー（SESSION_SECRET, CORS, DISCOURSE 等） ---
        const securityKeys = ['SESSION_SECRET', 'CORS_ORIGIN', 'DISCOURSE_URL', 'DISCOURSE_SECRET'];
        const securitySection = `
            <div class="auth-section">
                <div class="auth-section-header">
                    <h3><i class="fa-solid fa-shield-halved"></i> セキュリティ・認証プロバイダー <span class="unsaved-dot hidden" id="admin-auth-unsaved-dot" aria-hidden="true"></span></h3>
                    <p>セッション秘密鍵・CORS・Discourse SSO 等の設定です。値をクリックして編集できます。</p>
                </div>
                <div class="auth-smtp-table">
                    ${securityKeys.map(k => {
            const s = getSettingByKey(k) || makeSettingStub(k, 'security');
            const isSecret = (k || '').includes('SECRET');
            const displayVal = isSecret && s.value ? '••••••••' : (s.value || '（未設定）');
            return `
                                <div class="auth-smtp-row">
                                    <code class="auth-smtp-key">${escapeHtml(k)}</code>
                                    <span class="auth-smtp-val auth-inline-edit ${!s.value ? 'auth-smtp-empty' : ''}" data-key="${escapeHtml(k)}" data-secret="${isSecret ? '1' : '0'}" tabindex="0" role="button">${escapeHtml(displayVal)}</span>
                                </div>`;
        }).join('')}
                </div>
            </div>`;

        // --- 組み込み認証（本体）: ローカルメール・パスワード ---
        const builtinSection = `
            <div class="auth-section">
                <div class="auth-section-header">
                    <h3><i class="fa-solid fa-envelope"></i> 組み込み認証（本体）</h3>
                    <p>KAiに内蔵されているメール・パスワード認証です。常に有効で、無効化できません。</p>
                </div>
                <div class="auth-provider-card auth-provider-builtin">
                    <div class="auth-provider-icon"><i class="fa-solid fa-envelope-open-text"></i></div>
                    <div class="auth-provider-body">
                        <strong>メール・パスワード認証</strong>
                        <p>新規登録・ログイン機能。常に有効。</p>
                    </div>
                    <span class="plugin-badge plugin-badge-active">有効（常時）</span>
                </div>

                <div class="auth-settings-form" style="margin-top:1.25rem;">
                    <h4 style="margin:0 0 1rem;font-size:.95rem;"><i class="fa-solid fa-paper-plane"></i> メール送信設定（SMTP）</h4>
                    ${smtpSettings.length === 0 ? `
                        <p class="auth-no-smtp">SMTP設定がまだ登録されていません。以下のキーをクリックして編集できます。</p>
                        <div class="auth-smtp-table">
                            ${smtpKeys.map(k => {
            const s = getSettingByKey(k) || makeSettingStub(k, 'mail');
            const isSecret = (k || '').includes('PASS') || (k || '').includes('SECRET');
            const displayVal = isSecret && s.value ? '••••••••' : (s.value || '（未設定）');
            return `
                                <div class="auth-smtp-row">
                                    <code class="auth-smtp-key">${escapeHtml(k)}</code>
                                    <span class="auth-smtp-val auth-inline-edit ${!s.value ? 'auth-smtp-empty' : ''}" data-key="${escapeHtml(k)}" data-secret="${isSecret ? '1' : '0'}" tabindex="0" role="button">${escapeHtml(displayVal)}</span>
                                </div>`;
        }).join('')}
                        </div>` : `
                        <div class="auth-smtp-table">
                            ${smtpSettings.map(s => {
            const isSecret = s.key.includes('PASS') || s.key.includes('SECRET');
            const displayVal = isSecret && s.value ? '••••••••' : (s.value || '（未設定）');
            return `
                                <div class="auth-smtp-row">
                                    <code class="auth-smtp-key">${escapeHtml(s.key)}</code>
                                    <span class="auth-smtp-val auth-inline-edit ${!s.value ? 'auth-smtp-empty' : ''}" data-key="${escapeHtml(s.key)}" data-secret="${isSecret ? '1' : '0'}" tabindex="0" role="button">${escapeHtml(displayVal)}</span>
                                </div>`;
        }).join('')}
                        </div>
                    `}
                </div>
            </div>`;

        // --- 認証プラグインの設定（requiredSettings を一覧・編集） ---
        const authPluginSettingsKeys = [];
        plugins.forEach(p => {
            (p.requiredSettings || []).forEach(key => {
                if (!authPluginSettingsKeys.includes(key)) authPluginSettingsKeys.push(key);
            });
        });
        const authPluginSettingsSection = authPluginSettingsKeys.length === 0 ? '' : `
            <div class="auth-section" style="margin-top:1.5rem;">
                <div class="auth-section-header">
                    <h3><i class="fa-solid fa-sliders"></i> 認証プラグインの設定 <span class="unsaved-dot hidden" id="admin-auth-plugin-dot" aria-hidden="true"></span></h3>
                    <p>認証プラグインが利用する設定キーです。値をクリックして編集できます。</p>
                </div>
                <div class="auth-smtp-table">
                    ${authPluginSettingsKeys.map(key => {
            const s = getSettingByKey(key) || makeSettingStub(key, 'auth');
            const isSecret = (key || '').toLowerCase().includes('secret') || (key || '').toLowerCase().includes('key') || (key || '').toLowerCase().includes('token');
            const displayVal = isSecret && s.value ? '••••••••' : (s.value || '（未設定）');
            return `
                    <div class="auth-smtp-row">
                        <code class="auth-smtp-key">${escapeHtml(key)}</code>
                        <span class="auth-smtp-val auth-inline-edit ${!s.value ? 'auth-smtp-empty' : ''}" data-key="${escapeHtml(key)}" data-secret="${isSecret ? '1' : '0'}" tabindex="0" role="button">${escapeHtml(displayVal)}</span>
                    </div>`;
        }).join('')}
                </div>
            </div>`;

        // --- 認証プラグイン ---
        const pluginSection = `
            <div class="auth-section" style="margin-top:2rem;">
                <div class="auth-section-header">
                    <h3><i class="fa-solid fa-puzzle-piece"></i> 認証プラグイン</h3>
                    <p>外部サービス連携などの追加認証プロバイダーです。プラグインをインストールして有効にします。</p>
                </div>
                ${plugins.length > 0 ? plugins.map(p => `
                    <div class="auth-provider-card">
                        <div class="auth-provider-icon" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;">
                            <i class="fa-solid fa-key"></i>
                        </div>
                        <div class="auth-provider-body">
                            <strong>${escapeHtml(p.name)}</strong>
                            <p>${escapeHtml(p.description || '')}</p>
                        </div>
                        <div style="display:flex;align-items:center;gap:.5rem;">
                            <span class="plugin-badge plugin-badge-active">ロード済み</span>
                            <a href="/admin/plugins/${encodeURIComponent(p.id)}" class="btn btn-secondary spa-link" style="font-size:.8rem;">詳細</a>
                        </div>
                    </div>
                `).join('') : `
                    <div class="auth-no-plugins">
                        <i class="fa-solid fa-box-open" style="font-size:1.5rem;color:var(--text-muted);margin-bottom:.5rem;display:block;"></i>
                        認証プラグインはインストールされていません。<br>
                        <a href="/admin/plugins" class="spa-link" style="color:var(--accent-color);">プラグイン管理</a>から.jsまたは.zip形式のプラグインをインストールできます。
                    </div>
                `}
            </div>`;

        // --- 有効な認証プロバイダー一覧（まとめ） ---
        const summarySection = `
            <div class="auth-section" style="margin-top:2rem;">
                <div class="auth-section-header">
                    <h3><i class="fa-solid fa-shield-check"></i> 有効な認証プロバイダー一覧</h3>
                </div>
                ${providers.map(p => `
                    <div class="auth-provider-summary">
                        <i class="fa-solid ${p.type === 'local' ? 'fa-envelope' : 'fa-key'}"></i>
                        <span>${escapeHtml(p.name)}</span>
                        <span class="plugin-badge ${p.type === 'local' ? 'plugin-badge-active' : ''}">${p.type === 'local' ? '組み込み' : 'プラグイン'}</span>
                        ${p.loginUrl ? `<a href="${p.loginUrl}" style="font-size:.8rem;color:var(--text-muted);">${p.loginUrl}</a>` : ''}
                    </div>
                `).join('')}
            </div>`;

        const authUnsavedBar = `
            <div id="admin-auth-unsaved-bar" class="admin-unsaved-bar hidden">
                <span class="admin-unsaved-bar-text">変更を保存しますか？</span>
                <div class="admin-unsaved-bar-actions">
                    <button type="button" id="admin-auth-unsaved-cancel-btn" class="btn-secondary">キャンセル</button>
                    <button type="button" id="admin-auth-unsaved-save-btn" class="btn-primary">保存</button>
                </div>
            </div>`;
        container.innerHTML = securitySection + builtinSection + authPluginSettingsSection + pluginSection + summarySection + authUnsavedBar;

        const authDot = document.getElementById('admin-auth-unsaved-dot');
        const authPluginDot = document.getElementById('admin-auth-plugin-dot');
        const authBar = document.getElementById('admin-auth-unsaved-bar');
        const authSaveBtn = document.getElementById('admin-auth-unsaved-save-btn');
        const authCancelBtn = document.getElementById('admin-auth-unsaved-cancel-btn');

        const authOriginal = {};
        const authCurrent = {};
        allSettings.forEach(s => {
            authOriginal[s.key] = s.value || '';
            authCurrent[s.key] = s.value || '';
        });
        securityKeys.forEach(k => {
            if (authOriginal[k] === undefined) authOriginal[k] = '';
            if (authCurrent[k] === undefined) authCurrent[k] = '';
        });
        smtpKeys.forEach(k => {
            if (authOriginal[k] === undefined) authOriginal[k] = '';
            if (authCurrent[k] === undefined) authCurrent[k] = '';
        });
        authPluginSettingsKeys.forEach(k => {
            if (authOriginal[k] === undefined) authOriginal[k] = '';
            if (authCurrent[k] === undefined) authCurrent[k] = '';
        });

        let authDirty = false;
        function setAuthDirty() {
            authDirty = true;
            if (authDot) authDot.classList.remove('hidden');
            if (authPluginDot) authPluginDot.classList.remove('hidden');
            if (authBar) authBar.classList.remove('hidden');
        }
        function clearAuthDirty() {
            authDirty = false;
            if (authDot) authDot.classList.add('hidden');
            if (authPluginDot) authPluginDot.classList.add('hidden');
            if (authBar) authBar.classList.add('hidden');
        }

        function startAuthInlineEdit(span) {
            const key = span.dataset.key;
            const isSecret = span.dataset.secret === '1';
            const current = authCurrent[key] !== undefined ? authCurrent[key] : '';
            const input = document.createElement('input');
            input.type = isSecret ? 'password' : 'text';
            input.className = 'admin-inline-input';
            input.value = current;
            input.style.cssText = 'flex:1;min-width:120px;padding:0.25rem 0.5rem;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-color);font-size:0.88rem;';
            span.replaceWith(input);
            input.focus();
            const finish = () => {
                const newVal = input.value.trim();
                authCurrent[key] = newVal;
                if (authCurrent[key] !== authOriginal[key]) setAuthDirty();
                const newSpan = document.createElement('span');
                newSpan.className = 'auth-smtp-val auth-inline-edit';
                newSpan.dataset.key = key;
                newSpan.dataset.secret = isSecret ? '1' : '0';
                newSpan.tabIndex = 0;
                newSpan.setAttribute('role', 'button');
                const display = isSecret && newVal ? '••••••••' : (newVal || '（未設定）');
                newSpan.textContent = display;
                if (!newVal) newSpan.classList.add('auth-smtp-empty');
                newSpan.addEventListener('click', () => startAuthInlineEdit(newSpan));
                newSpan.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startAuthInlineEdit(newSpan); } });
                input.replaceWith(newSpan);
            };
            input.addEventListener('blur', finish);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
        }

        container.querySelectorAll('.auth-inline-edit').forEach(span => {
            span.addEventListener('click', () => startAuthInlineEdit(span));
            span.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startAuthInlineEdit(span); } });
        });

        if (authCancelBtn) authCancelBtn.addEventListener('click', () => {
            Object.keys(authOriginal).forEach(k => { authCurrent[k] = authOriginal[k]; });
            clearAuthDirty();
            initAdminAuthPage();
        });

        if (authSaveBtn) authSaveBtn.addEventListener('click', async () => {
            const toSave = Object.keys(authOriginal).filter(k => authCurrent[k] !== authOriginal[k]);
            try {
                for (const key of toSave) {
                    const s = allSettings.find(x => x.key === key) || makeSettingStub(key, 'general');
                    const res = await fetch('/api/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key, value: authCurrent[key] || '', category: s.category, description: s.description || '' })
                    });
                    if (res.ok) authOriginal[key] = authCurrent[key];
                }
                clearAuthDirty();
                if (window.showAlertModal) window.showAlertModal('保存しました', '設定を保存しました。');
                initAdminAuthPage();
            } catch (e) {
                if (window.showAlertModal) window.showAlertModal('エラー', '保存に失敗しました。');
            }
        });

    } catch (e) {
        container.innerHTML = `<p style="color:var(--color-danger)">エラーが発生しました: ${e.message}</p>`;
    }
}

// ============== Admin Features Page (/admin/features) ==============
export async function initAdminFeaturesPage() {
    const container = document.getElementById('admin-features-container');
    if (!container) return;

    const LEVEL_LABELS = {
        loggedout: { label: 'ログアウト時', icon: 'fa-globe', color: 'var(--text-muted)' },
        loggedin:  { label: 'ログイン時',   icon: 'fa-user',  color: 'var(--primary-color)' },
        pro:       { label: 'Proプラン時',  icon: 'fa-crown', color: '#f59e0b' },
    };

    let data = null;
    try {
        const res = await fetch('/api/admin/features');
        if (!res.ok) throw new Error();
        data = await res.json();
    } catch (e) {
        container.innerHTML = '<p style="color:var(--color-danger)">読み込みに失敗しました。</p>';
        return;
    }

    const { features, hasProPlugin } = data;
    const levels = ['loggedout', 'loggedin', ...(hasProPlugin ? ['pro'] : [])];

    // 機能ごとのselect要素付きテーブルを生成
    container.innerHTML = `
<div class="admin-card" style="margin-bottom:1.5rem;">
  <div class="admin-card-title">機能アクセス設定</div>
  <div class="admin-card-body">
    <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.5rem;">
      各機能をどの権限レベルのユーザーから利用可能にするか設定します。<br>
      選択したレベル以上のユーザーが使えます（例：「ログイン時」を選ぶとログインユーザーとProユーザーが使えます）。
    </p>
    <div class="admin-table-container">
      <table class="admin-table" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:0.75rem;">機能</th>
            <th style="text-align:left;padding:0.75rem;">説明</th>
            <th style="text-align:left;padding:0.75rem;min-width:160px;">最低権限</th>
          </tr>
        </thead>
        <tbody id="admin-features-tbody">
          ${features.map(f => {
              const isFixed = f.coreOnly;
              const levelInfo = LEVEL_LABELS[f.level] || LEVEL_LABELS.loggedin;
              const fromPlugin = f.fromPlugin ? `<span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.4rem;">[${f.fromPlugin}]</span>` : '';
              return `<tr data-feature-id="${f.id}">
                <td style="padding:0.75rem;font-weight:600;">${f.label}${fromPlugin}</td>
                <td style="padding:0.75rem;color:var(--text-muted);font-size:0.875rem;">${f.description || ''}</td>
                <td style="padding:0.75rem;">
                  ${isFixed
                    ? `<span style="color:${levelInfo.color};font-size:0.875rem;"><i class="fa-solid ${levelInfo.icon}"></i> ${levelInfo.label}（固定）</span>`
                    : `<select class="feature-level-select" data-id="${f.id}" style="padding:0.4rem 0.6rem;border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-color);border:1px solid var(--border-color);font-size:0.875rem;">
                        ${levels.map(lv => {
                            const lv_info = LEVEL_LABELS[lv];
                            return `<option value="${lv}" ${f.level === lv ? 'selected' : ''}>${lv_info.label}</option>`;
                        }).join('')}
                      </select>`
                  }
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:1.5rem;display:flex;justify-content:flex-end;">
      <button id="admin-features-save-btn" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
    </div>
  </div>
</div>`;

    // 保存ボタン
    const saveBtn = document.getElementById('admin-features-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const selects = container.querySelectorAll('.feature-level-select');
            const levels_map = {};
            selects.forEach(s => { levels_map[s.dataset.id] = s.value; });

            saveBtn.disabled = true;
            try {
                const res = await fetch('/api/admin/features', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ levels: levels_map }),
                });
                const result = await res.json();
                if (result.success) {
                    if (window.showAlertModal) window.showAlertModal('保存しました', '機能設定を保存しました。');
                } else {
                    if (window.showAlertModal) window.showAlertModal('エラー', result.error || '保存に失敗しました。');
                }
            } catch (e) {
                if (window.showAlertModal) window.showAlertModal('エラー', '通信エラーが発生しました。');
            }
            saveBtn.disabled = false;
        });
    }
}
