import { state } from './state.js';
import { MAX_HISTORY_ITEMS, HISTORY_TITLE_MAX_LENGTH, STORAGE_KEY_HISTORY, HISTORY_WARNING_THRESHOLD } from './constants.js';
import { escapeHtml, createSafeTextNode } from './sanitize.js';

export let historyList = null;
export let saveTextCheckbox = null;
export let saveImageCheckbox = null;
export let sidebarContent = null;
export let chatTitle = null;
export let mobileChatTitle = null;

let showAlertDialog = null;
let showConfirmModal = null;
let loadSession = null;
let startNewChat = null;
let openSessionDropdown = null;
let closeMobileSidebar = null;
let showTagTreeView = null;
let updateTagsSection = null;

export function initHistory(elements, deps) {
    historyList = elements.historyList;
    saveTextCheckbox = elements.saveTextCheckbox;
    saveImageCheckbox = elements.saveImageCheckbox;
    sidebarContent = elements.sidebarContent;
    chatTitle = elements.chatTitle;
    mobileChatTitle = elements.mobileChatTitle;

    showAlertDialog = deps.showAlertDialog;
    showConfirmModal = deps.showConfirmModal;
    loadSession = deps.loadSession;
    startNewChat = deps.startNewChat;
    openSessionDropdown = deps.openSessionDropdown;
    closeMobileSidebar = deps.closeMobileSidebar;
    showTagTreeView = deps.showTagTreeView;
    updateTagsSection = deps.updateTagsSection;
}

// Load history from local storage
export const loadHistoryFromLocalStorage = () => {
    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (savedHistory) {
        // User requested no storage for guest users
        if (!state.isLoggedIn) {
            localStorage.removeItem(STORAGE_KEY_HISTORY);
            state.history = [];
            return;
        }
        try {
            state.history = JSON.parse(savedHistory);
        } catch (e) {
            console.error('Failed to parse history', e);
        }
    }
    // renderHistory() will be called after checkLoginStatus completes
};

// Load history from server (for logged-in users)
export const loadHistoryFromServer = async () => {
    try {
        const response = await fetch('/api/user/history');
        if (response.ok) {
            const data = await response.json();
            state.history = data.history || [];
        } else {
            // Server error, fallback to localStorage data already loaded
            console.error('Failed to load history from server');
        }
    } catch (e) {
        console.error('Failed to load history from server', e);
        // Use localStorage data already loaded
    }
    // Always render to remove skeletons
    renderHistory();
};

// Main history loading function
export const loadHistory = () => {
    if (state.isLoggedIn) {
        loadHistoryFromServer();
    } else {
        loadHistoryFromLocalStorage();
    }
};

// Load Data Settings from server (or accept pre-fetched settings)
export const loadDataSettings = async (preloadedSettings = null) => {
    let settings = preloadedSettings;
    if (!settings) {
        try {
            const response = await fetch('/api/user/settings');
            if (response.ok) {
                settings = await response.json();
            }
        } catch (e) {
            console.error('Failed to load data settings', e);
        }
    }

    if (settings) {
        state.dataSettings.saveText = settings.save_text_history;
        state.dataSettings.saveImage = settings.save_image_history;
    }

    if (saveTextCheckbox) {
        // Checkbox ON = do not save, OFF = save
        saveTextCheckbox.checked = !state.dataSettings.saveText;
        saveTextCheckbox.addEventListener('change', async (e) => {
            state.dataSettings.saveText = !e.target.checked;
            await saveDataSettings();
        });
    }

    if (saveImageCheckbox) {
        // Checkbox ON = do not save, OFF = save
        saveImageCheckbox.checked = !state.dataSettings.saveImage;
        saveImageCheckbox.addEventListener('change', async (e) => {
            state.dataSettings.saveImage = !e.target.checked;
            await saveDataSettings();
        });
    }
};

export const saveDataSettings = async () => {
    if (!state.isLoggedIn) {
        // For non-logged-in users, settings are not persisted
        return;
    }

    try {
        await fetch('/api/user/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                save_text_history: state.dataSettings.saveText,
                save_image_history: state.dataSettings.saveImage
            })
        });
    } catch (e) {
        console.error('Failed to save data settings', e);
    }
};

export const renderHistory = () => {
    if (!historyList) return;

    // Remove skeleton screens (always, even if history is empty)
    const skeletons = historyList.querySelectorAll('.skeleton-history-item');
    skeletons.forEach(s => s.remove());

    // Clear any existing history items, prompts, or buttons
    const existingItems = historyList.querySelectorAll('.history-item, .history-login-prompt, .history-empty-message, .btn-show-more-history');
    existingItems.forEach(item => item.remove());

    if (state.history.length === 0) {
        if (state.isLoggedIn === false) {
            const div = document.createElement('div');
            div.className = 'history-login-prompt';
            div.innerHTML = `
                <p>ログインすると、<br>会話を保存できます。</p>
                <button class="btn-login-small" id="history-login-btn-empty">ログイン</button>
            `;
            const loginBtn = div.querySelector('#history-login-btn-empty');
            if (loginBtn) loginBtn.addEventListener('click', async () => {
                try {
                    const r = await fetch('/api/auth/providers');
                    const providers = await r.json();
                    const d = providers.find(p => p.type === 'plugin' && p.loginUrl);
                    if (d) { window.location.href = d.loginUrl; }
                    else if (window.openLocalLoginModal) window.openLocalLoginModal();
                } catch (e) { if (window.openLocalLoginModal) window.openLocalLoginModal(); }
            });
            historyList.appendChild(div);
        }
        return;
    }

    if (state.isLoggedIn === false) {
        // Even if there is some history (unlikely given current logic), show prompt at bottom or top
        const div = document.createElement('div');
        div.className = 'history-login-prompt';
        div.innerHTML = `
            <p>ログインすると、<br>会話を保存できます。</p>
            <button class="btn-login-small" id="history-login-btn-bottom">ログイン</button>
        `;
        const loginBtn2 = div.querySelector('#history-login-btn-bottom');
        if (loginBtn2) loginBtn2.addEventListener('click', async () => {
            try {
                const r = await fetch('/api/auth/providers');
                const providers = await r.json();
                const d = providers.find(p => p.type === 'plugin' && p.loginUrl);
                if (d) { window.location.href = d.loginUrl; }
                else if (window.openLocalLoginModal) window.openLocalLoginModal();
            } catch (e) { if (window.openLocalLoginModal) window.openLocalLoginModal(); }
        });
        historyList.appendChild(div);
        // If they have temporary history, we might want to show it, but user said "don't save anything"
    }

    const filteredHistory = state.historySearchQuery
        ? state.history.filter(item => item.title.toLowerCase().includes(state.historySearchQuery))
        : state.history;

    if (state.historySearchQuery && filteredHistory.length === 0) {
        const div = document.createElement('div');
        div.className = 'history-empty-message';
        div.textContent = '一致する履歴がありません';
        div.style.padding = '10px';
        div.style.color = 'var(--text-muted)';
        div.style.fontSize = '0.9em';
        div.style.textAlign = 'center';
        historyList.appendChild(div);
        return;
    }

    // Limit the number of items displayed
    const displayedHistory = filteredHistory.slice(0, state.historyDisplayLimit);

    displayedHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        if (state.currentSessionId === item.id) {
            div.classList.add('active');
        }

        // Clean title for display (remove image tags)
        let displayTitle = item.title.replace(/\[.+の画像\]/g, '').trim();
        if (!displayTitle) displayTitle = '画像';

        const escapedTitle = escapeHtml(displayTitle);
        div.innerHTML = `
            <div class="history-content">
                <span class="history-text">${escapedTitle}</span>
            </div>
            <button class="btn-history-menu" title="メニュー">
                <i class="fa-solid fa-ellipsis"></i>
            </button>
        `;

        // Click on item loads session
        div.addEventListener('click', (e) => {
            // Ignore if menu button or dropdown was clicked
            if (e.target.closest('.btn-history-menu') || e.target.closest('.history-dropdown')) return;
            if (loadSession) loadSession(item.id);
            if (closeMobileSidebar) closeMobileSidebar();
        });

        // Toggle dropdown menu using shared function
        const menuBtn = div.querySelector('.btn-history-menu');
        if (menuBtn && openSessionDropdown) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openSessionDropdown(item.id, menuBtn, item.isPinned || false, item.tags || [], displayTitle);
            });
        }

        historyList.appendChild(div);
    });

    // Add "Show more" button if there are more items
    if (filteredHistory.length > state.historyDisplayLimit) {
        const showMoreBtn = document.createElement('button');
        showMoreBtn.className = 'btn-show-more-history';
        showMoreBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> さらに表示';
        showMoreBtn.onclick = () => {
            const scrollPos = sidebarContent ? sidebarContent.scrollTop : 0;
            state.historyDisplayLimit += 10;
            renderHistory();
            if (sidebarContent) sidebarContent.scrollTop = scrollPos;
        };
        historyList.appendChild(showMoreBtn);
    }

    // Update pinned and tags sections
    if (typeof updatePinnedSection === 'function') updatePinnedSection();
    if (typeof updateTagsSection === 'function') updateTagsSection();
};

export const deleteSession = async (sessionId) => {
    // Optimistic UI update
    state.history = state.history.filter(h => h.id !== sessionId);

    renderHistory();

    // If current session is deleted, clear view
    if (state.currentSessionId === sessionId) {
        if (startNewChat) startNewChat();
    }

    try {
        await fetch(`/api/session/${sessionId}`, { method: 'DELETE' });
    } catch (e) {
        console.error('Failed to delete session on server', e);
    }
};

export const confirmDeleteChat = (sessionId) => {
    if (showConfirmModal) {
        showConfirmModal(
            'チャットを削除',
            'このチャットを削除しますか？',
            () => deleteSession(sessionId)
        );
    }
};

export const updateChatTitle = async (sessionId, newTitle) => {
    try {
        const response = await fetch(`/api/session/${sessionId}/title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });

        if (!response.ok) throw new Error('Failed to update title');

        // Update state and UI
        const historyItem = state.history.find(h => h.id === sessionId);
        if (historyItem) {
            historyItem.title = newTitle;
        }
        if (state.currentSessionId === sessionId) {
            if (chatTitle) chatTitle.textContent = newTitle;
            document.title = `${newTitle} - KAi`;
        }

        renderHistory();
    } catch (e) {
        console.error('Title update failed:', e);
        if (showAlertDialog) showAlertDialog('エラー', '名前の変更に失敗しました。');
    }
};

export const addToHistory = (sessionId, question) => {
    if (state.history.find(h => h.id === sessionId)) return;

    // Clean title from image tags
    let cleanQuestion = question.replace(/\[.+の画像\]/g, '').trim();
    if (!cleanQuestion) cleanQuestion = '画像';

    const title = cleanQuestion.length > HISTORY_TITLE_MAX_LENGTH ? cleanQuestion.substring(0, HISTORY_TITLE_MAX_LENGTH) + '...' : cleanQuestion;

    // Update header title if it's the current session
    if (state.currentSessionId === sessionId) {
        if (chatTitle) chatTitle.textContent = title;
        if (mobileChatTitle) mobileChatTitle.textContent = title;
        document.title = `${title} - KAi`;
        // Sync auto-generated title to server so it persists on reload
        updateChatTitle(sessionId, title);
    }

    const newItem = { id: sessionId, title, timestamp: Date.now() };
    state.history.unshift(newItem);

    if (state.history.length > MAX_HISTORY_ITEMS) {
        state.history.pop();
    }


    renderHistory();
};

// ============== Pin Toggle ==============
export const togglePinChat = async (sessionId, currentlyPinned) => {
    try {
        const res = await fetch(`/api/session/${sessionId}/pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPinned: !currentlyPinned })
        });

        if (!res.ok) throw new Error('Failed to toggle pin');

        const data = await res.json();

        // Update local state
        const historyItem = state.history.find(h => h.id === sessionId);
        if (historyItem) {
            historyItem.isPinned = data.isPinned;
        }

        // Refresh history display
        renderHistory();
        updatePinnedSection();

        return data.isPinned;
    } catch (error) {
        console.error('Pin toggle error:', error);
        if (showAlertDialog) showAlertDialog('エラー', 'ピン止めの切り替えに失敗しました。');
        return currentlyPinned;
    }
};

// Update pinned section visibility
export function updatePinnedSection() {
    const pinnedContainer = document.getElementById('pinnedContainer');
    const pinnedList = document.getElementById('pinnedList');
    if (!pinnedContainer || !pinnedList) return;

    const pinnedChats = state.history.filter(h => h.isPinned);

    if (pinnedChats.length === 0) {
        pinnedContainer.classList.add('hidden');
    } else {
        pinnedContainer.classList.remove('hidden');
        pinnedList.innerHTML = '';
        pinnedChats.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            if (state.currentSessionId === item.id) {
                div.classList.add('active');
            }

            let displayTitle = item.title.replace(/\[.+の画像\]/g, '').trim();
            if (!displayTitle) displayTitle = '画像';

            const escapedTitle = escapeHtml(displayTitle);
            div.innerHTML = `
                <div class="history-content">
                    <i class="fa-solid fa-thumbtack pinned-indicator"></i>
                    <span class="history-text">${escapedTitle}</span>
                </div>
            `;

            div.addEventListener('click', () => {
                if (loadSession) loadSession(item.id);
                if (closeMobileSidebar) closeMobileSidebar();
            });

            pinnedList.appendChild(div);
        });
    }
}

