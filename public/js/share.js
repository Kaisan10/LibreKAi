/**
 * Share module
 * チャット共有機能（公開/非公開・短縮URL・期限・フォーク）
 */
import { state } from './state.js';

// DOM参照（initで設定）
let shareModal = null;
let shareUrlInput = null;
let sharePublicCheckbox = null;
let shareDetails = null;
let shareExpirySelect = null;
let copyShareUrlBtn = null;
let saveShareSettingsBtn = null;
let closeShareModalBtn = null;
let shareBtnMobile = null;
let shareBtnDesktop = null;
let shareBtnForkMobile = null;
let shareBtnForkDesktop = null;

// 外部依存関数（initで設定）
let showAlertDialog = null;
let renderHistory = null;
let navigateTo = null;

/**
 * Helper to determine expiry selection value based on actual expiry date
 * @param {string|Date} expiresAt 
 * @returns {string} 1h, 1d, 7d, 30d or empty
 */
const calculateExpiryValue = (expiresAt) => {
    if (!expiresAt) return '';
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffHours = (expiry - now) / (1000 * 60 * 60);

    if (diffHours <= 0) return '';
    if (diffHours <= 1.5) return '1h';
    if (diffHours <= 25) return '1d';
    if (diffHours <= 7 * 24 + 1) return '7d';
    return '30d';
};

export const openShareModal = async (specificSessionId = null) => {
    const sessionId = specificSessionId || state.currentSessionId;
    if (!sessionId) return;

    // If it's the current session, we use the existing state.
    // If it's a different session (from history), we fetch its data.
    let shareData = {
        isPublic: state.isPublic,
        shortUrl: state.shortUrl || null,
        expiresAt: state.expiresAt
    };

    if (specificSessionId && specificSessionId !== state.currentSessionId) {
        try {
            const response = await fetch(`/api/session/${sessionId}`);
            if (!response.ok) throw new Error();
            const data = await response.json();
            shareData.isPublic = data.isPublic;
            shareData.shortUrl = data.shortUrl;
            shareData.expiresAt = data.expiresAt;
        } catch (e) {
            console.error('Failed to fetch share settings:', e);
            if (showAlertDialog) showAlertDialog('エラー', '共有設定の取得に失敗しました。');
            return;
        }
    }

    // Populate URL
    const shareUrl = shareData.shortUrl || `${window.location.origin}/chat/${encodeURIComponent(sessionId)}`;
    shareUrlInput.value = shareUrl;

    // Initial state
    sharePublicCheckbox.checked = shareData.isPublic;
    if (shareData.isPublic) {
        shareDetails.classList.remove('hidden');
    } else {
        shareDetails.classList.add('hidden');
    }

    // Expiry
    shareExpirySelect.value = shareData.expiresAt ? calculateExpiryValue(shareData.expiresAt) : '';

    // Open modal
    shareModal.classList.remove('hidden');
    state.sharingSessionId = sessionId; // Store which session we are sharing
};

const closeShareModal = () => {
    shareModal.classList.add('hidden');
};

const saveShareSettings = async (silent = false) => {
    const isPublic = sharePublicCheckbox.checked;
    const expiryType = shareExpirySelect.value;
    let expiresAt = null;
    if (expiryType) {
        const now = new Date();
        if (expiryType === '1h') now.setHours(now.getHours() + 1);
        else if (expiryType === '1d') now.setDate(now.getDate() + 1);
        else if (expiryType === '7d') now.setDate(now.getDate() + 7);
        else if (expiryType === '30d') now.setDate(now.getDate() + 30);
        expiresAt = now.toISOString();
    }

    const sessionId = state.sharingSessionId || state.currentSessionId;

    try {
        const response = await fetch(`/api/session/${sessionId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isPublic, expiresAt })
        });

        if (response.ok) {
            const data = await response.json();
            // Update local state ONLY if it's the current session
            if (!state.sharingSessionId || state.sharingSessionId === state.currentSessionId) {
                state.isPublic = isPublic;
                state.expiresAt = expiresAt;
                if (data.shortUrl) {
                    state.shortUrl = data.shortUrl;
                } else if (!isPublic) {
                    // Clear short URL if made private
                    state.shortUrl = null;
                    shareUrlInput.value = ''; // Or reset to original long URL if preferred, but usually we hide the input
                }
            }

            // Update input if we are still in the modal
            if (data.shortUrl) {
                shareUrlInput.value = data.shortUrl;
            } else if (!isPublic) {
                // If made private, maybe show the base URL or empty
                shareUrlInput.value = `${window.location.origin}/chat/${encodeURIComponent(sessionId)}`;
            }

            if (!silent) {
                closeShareModal();
                if (showAlertDialog) showAlertDialog('完了', '共有設定を保存しました。');
            }
        } else {
            if (!silent) {
                closeShareModal();
                if (showAlertDialog) showAlertDialog('エラー', '共有設定の保存に失敗しました。');
            }
        }
    } catch (e) {
        console.error('Failed to save share settings', e);
        if (!silent) {
            closeShareModal();
            if (showAlertDialog) showAlertDialog('エラー', '通信エラーが発生しました。');
        }
    }
};

const forkSession = async () => {
    if (!state.currentSessionId || state.isLoading) return;

    try {
        state.isLoading = true;
        if (shareBtnForkDesktop) shareBtnForkDesktop.disabled = true;
        if (shareBtnForkMobile) shareBtnForkMobile.disabled = true;

        const response = await fetch(`/api/session/${state.currentSessionId}/fork`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to copy chat');
        }
        const data = await response.json();

        // Add to state.history immediately so it shows up without reload
        const sourceSession = state.history.find(h => h.id === state.currentSessionId);
        const newHistoryItem = {
            id: data.sessionId,
            title: sourceSession ? sourceSession.title : "Copied Chat",
            timestamp: Date.now()
        };
        state.history.unshift(newHistoryItem);

        if (renderHistory) renderHistory();

        // Load the new session
        if (navigateTo) navigateTo(`/chat/${data.sessionId}`);
    } catch (e) {
        console.error('Fork failed:', e);
        if (showAlertDialog) showAlertDialog('エラー', `チャットのコピーに失敗しました: ${e.message}`);
    } finally {
        state.isLoading = false;
        if (shareBtnForkDesktop) shareBtnForkDesktop.disabled = false;
        if (shareBtnForkMobile) shareBtnForkMobile.disabled = false;
    }
};

/**
 * Initialize share module
 * @param {Object} elements - DOM element references
 * @param {Object} deps - Dependencies
 */
export function initShare(elements, deps) {
    shareModal = elements.shareModal;
    shareUrlInput = elements.shareUrlInput;
    sharePublicCheckbox = elements.sharePublicCheckbox;
    shareDetails = elements.shareDetails;
    shareExpirySelect = elements.shareExpirySelect;
    copyShareUrlBtn = elements.copyShareUrlBtn;
    saveShareSettingsBtn = elements.saveShareSettingsBtn;
    closeShareModalBtn = elements.closeShareModalBtn;
    shareBtnMobile = elements.shareBtnMobile;
    shareBtnDesktop = elements.shareBtnDesktop;
    shareBtnForkMobile = elements.shareBtnForkMobile;
    shareBtnForkDesktop = elements.shareBtnForkDesktop;

    showAlertDialog = deps.showAlertDialog;
    renderHistory = deps.renderHistory;
    navigateTo = deps.navigateTo;

    if (shareBtnMobile) shareBtnMobile.addEventListener('click', () => openShareModal());
    if (shareBtnDesktop) shareBtnDesktop.addEventListener('click', () => openShareModal());
    if (closeShareModalBtn) closeShareModalBtn.addEventListener('click', closeShareModal);

    sharePublicCheckbox.addEventListener('change', () => {
        if (sharePublicCheckbox.checked) {
            shareDetails.classList.remove('hidden');
        } else {
            shareDetails.classList.add('hidden');
        }
        // Auto-save setting (silent)
        saveShareSettings(true);
    });

    shareExpirySelect.addEventListener('change', () => {
        // Auto-save setting (silent)
        saveShareSettings(true);
    });

    copyShareUrlBtn.addEventListener('click', () => {
        shareUrlInput.select();
        navigator.clipboard.writeText(shareUrlInput.value);
        const icon = copyShareUrlBtn.querySelector('i');
        icon.className = 'fa-solid fa-check';
        setTimeout(() => icon.className = 'fa-regular fa-copy', 2000);
    });

    saveShareSettingsBtn.addEventListener('click', () => saveShareSettings(false));

    if (shareBtnForkDesktop) shareBtnForkDesktop.addEventListener('click', forkSession);
    if (shareBtnForkMobile) shareBtnForkMobile.addEventListener('click', forkSession);
}
