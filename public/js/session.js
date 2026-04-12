import { state } from './state.js';
import { updateUrlForSession, scrollToBottom } from './utils.js';
import { createSafeTextNode, escapeHtml } from './sanitize.js';
import {
    appendUserMessage,
    appendUserMessageWithPlaceholder,
    appendAiMessage,
    renderMarkdown,
    appendForkMarker,
    applyToxicityWarning,
    showError
} from './chat-ui.js';
import { HISTORY_WARNING_THRESHOLD } from './constants.js';

let messagesList = null;
let welcomeMessage = null;
let loadingDiv = null;
let loadingText = null;
let errorMessage = null;
let chatTitle = null;
let mobileChatTitle = null;
let questionInput = null;
let suggestionCards = null;

// UI Elements for toggling visibility
let shareBtnDesktop = null;
let shareBtnMobile = null;
let desktopChatHeader = null;
let shareBtnForkDesktop = null;
let shareBtnForkMobile = null;

// Dependencies
let showChatUI = null;
let renderPage = null;
let updateHeaderTagsDisplay = null;
let autoResizeTextarea = null;
let renderHistory = null;
let updatePageNavActive = null;
let closeMobileSidebar = null;

export const initSession = (elements, deps) => {
    messagesList = elements.messagesList;
    welcomeMessage = elements.welcomeMessage;
    loadingDiv = elements.loadingDiv;
    loadingText = elements.loadingText;
    errorMessage = elements.errorMessage;
    chatTitle = elements.chatTitle;
    mobileChatTitle = elements.mobileChatTitle;
    questionInput = elements.questionInput;

    shareBtnDesktop = elements.shareBtnDesktop;
    shareBtnMobile = elements.shareBtnMobile;
    desktopChatHeader = elements.desktopChatHeader;
    shareBtnForkDesktop = elements.shareBtnForkDesktop;
    shareBtnForkMobile = elements.shareBtnForkMobile;
    suggestionCards = elements.suggestionCards;

    showChatUI = deps.showChatUI;
    renderPage = deps.renderPage;
    updateHeaderTagsDisplay = deps.updateHeaderTagsDisplay;
    autoResizeTextarea = deps.autoResizeTextarea;
    renderHistory = deps.renderHistory;
    updatePageNavActive = deps.updatePageNavActive;
    closeMobileSidebar = deps.closeMobileSidebar;
};

export const startNewChat = () => {
    if (state.isLoading) return;

    if (messagesList) messagesList.innerHTML = '';
    if (welcomeMessage) welcomeMessage.classList.remove('hidden');
    if (errorMessage) errorMessage.classList.add('hidden');
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.classList.add('new-chat');
    if (suggestionCards) suggestionCards.classList.remove('hidden');

    if (showChatUI) showChatUI(); // Ensure chat UI is visible (fallback for SPA routing)

    state.currentSessionId = null;
    state.currentRequestId = null;
    state.currentAnswer = '';

    state.isOwner = true;
    state.isPublic = false;
    state.expiresAt = null;
    state.isPreviewMode = false;

    document.documentElement.classList.remove('shared-preview-mode');
    if (desktopChatHeader) {
        desktopChatHeader.classList.remove('hidden');
    }
    if (shareBtnDesktop) shareBtnDesktop.classList.add('hidden');
    if (shareBtnMobile) shareBtnMobile.classList.add('hidden');
    if (shareBtnForkMobile) shareBtnForkMobile.classList.add('hidden');

    if (mobileChatTitle) mobileChatTitle.textContent = '';
    if (chatTitle) chatTitle.textContent = '';
    document.title = (state.appConfig && state.appConfig.siteTitle) ? state.appConfig.siteTitle : 'KAi';

    // Reset tags
    state.currentChatTags = [];
    if (updateHeaderTagsDisplay) updateHeaderTagsDisplay();

    // Hide header menu buttons for new chat
    const desktopHeaderMenuBtn = document.getElementById('desktopHeaderMenuBtn');
    const mobileHeaderMenuBtn = document.getElementById('mobileHeaderMenuBtn');
    if (desktopHeaderMenuBtn) desktopHeaderMenuBtn.classList.add('hidden');
    if (mobileHeaderMenuBtn) mobileHeaderMenuBtn.classList.add('hidden');

    updateUrlForSession(null);
    if (renderHistory) renderHistory();

    if (questionInput) {
        questionInput.value = '';
        questionInput.focus();
    }
    if (autoResizeTextarea) autoResizeTextarea();
};

export const loadSession = async (sessionId) => {
    if (state.isLoading) return;
    if (state.currentSessionId === sessionId) return;

    if (messagesList) messagesList.innerHTML = '';
    if (welcomeMessage) welcomeMessage.classList.add('hidden');
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.classList.remove('new-chat');
    if (suggestionCards) suggestionCards.classList.add('hidden');
    if (loadingDiv) loadingDiv.classList.remove('hidden');
    if (loadingText) loadingText.textContent = '履歴を読み込み中...';
    if (errorMessage) errorMessage.classList.add('hidden'); // Clear any previous errors

    state.currentSessionId = sessionId;
    updateUrlForSession(sessionId);
    if (renderHistory) renderHistory();

    // Reset share buttons visibility
    if (shareBtnDesktop) shareBtnDesktop.classList.add('hidden');
    if (shareBtnMobile) shareBtnMobile.classList.add('hidden');
    if (desktopChatHeader) desktopChatHeader.classList.add('hidden');

    try {
        const response = await fetch(`/api/session/${sessionId}`);

        // Abort if the user has navigated away while fetching
        if (state.currentSessionId !== sessionId) return;

        if (!response.ok) {
            if (response.status === 404 || response.status === 403) {
                throw new Error('SESSION_EXPIRED');
            }
            throw new Error('履歴の読み込みに失敗しました。');
        }

        const data = await response.json();

        // Abort if the user has navigated away
        if (state.currentSessionId !== sessionId) return;

        // Update session meta tags if it's the current session (for back/forward navigation)
        if (data.sessionId === state.currentSessionId) {
            // We don't need to manually update title here if it's handled by server-side injection,
            // but for SPA transitions we might want to update document.title
            document.title = `${data.title || 'New Chat'} - KAi`;
        }

        // Update session ownership and share state
        state.isOwner = data.isOwner;
        state.isPublic = data.isPublic;
        state.expiresAt = data.expiresAt;
        state.isPreviewMode = !data.isOwner;

        // Title Handling - Prioritize client-side history if server returns default
        const historyItem = state.history.find(h => h.id === sessionId);
        const sessionTitle = (data.title && data.title !== 'New Chat')
            ? data.title
            : (historyItem?.title || data.title || "New Chat");
        if (chatTitle) {
            chatTitle.textContent = sessionTitle;
            document.title = `${sessionTitle} - KAi`;
        }
        if (mobileChatTitle) {
            mobileChatTitle.textContent = sessionTitle;
        }

        // Show/hide UI elements based on ownership and mode
        if (state.isOwner) {
            if (shareBtnDesktop) shareBtnDesktop.classList.remove('hidden');
            if (shareBtnMobile) shareBtnMobile.classList.remove('hidden');
            state.isPublic = data.isPublic;
            state.shortUrl = data.shortUrl;
            state.expiresAt = data.expiresAt;
            if (shareBtnForkDesktop) shareBtnForkDesktop.classList.add('hidden');
            if (shareBtnForkMobile) shareBtnForkMobile.classList.add('hidden');
            document.documentElement.classList.remove('shared-preview-mode');

            // Show header menu buttons
            const dHeaderMenuBtn = document.getElementById('desktopHeaderMenuBtn');
            const mHeaderMenuBtn = document.getElementById('mobileHeaderMenuBtn');
            if (dHeaderMenuBtn) dHeaderMenuBtn.classList.remove('hidden');
            if (mHeaderMenuBtn) mHeaderMenuBtn.classList.remove('hidden');
        } else {
            if (shareBtnForkDesktop) shareBtnForkDesktop.classList.remove('hidden');
            if (shareBtnForkMobile) shareBtnForkMobile.classList.remove('hidden');
            document.documentElement.classList.add('shared-preview-mode');

            // Hide header menu buttons for non-owners
            const dHeaderMenuBtn = document.getElementById('desktopHeaderMenuBtn');
            const mHeaderMenuBtn = document.getElementById('mobileHeaderMenuBtn');
            if (dHeaderMenuBtn) dHeaderMenuBtn.classList.add('hidden');
            if (mHeaderMenuBtn) mHeaderMenuBtn.classList.add('hidden');
        }

        if (desktopChatHeader) desktopChatHeader.classList.remove('hidden');

        // Load and display tags
        state.currentChatTags = data.tags || historyItem?.tags || [];
        state.isPinned = data.isPinned || historyItem?.isPinned || false;
        if (updateHeaderTagsDisplay) updateHeaderTagsDisplay();

        // Check if history is truncated (approximate check based on max turns)
        // MAX_HISTORY_TURNS is 10, so 20 messages.
        if (data.messages.length >= HISTORY_WARNING_THRESHOLD) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'chat-history-warning';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-triangle-exclamation';
            const text = createSafeTextNode(' 履歴の上限を超えたため、古いメッセージは表示されていません。');
            warningDiv.appendChild(icon);
            warningDiv.appendChild(text);
            messagesList.appendChild(warningDiv);
        }

        data.messages.forEach(msg => {
            const metadata = {
                id: msg.id,
                model: msg.model,
                tokensPerSec: msg.tokensPerSec,
                timestamp: msg.timestamp,
                feedback: msg.feedback
            };

            if (msg.role === 'user') {
                // Check for image metadata from server (new format)
                let userDiv;
                if (msg.image && msg.image.filename) {
                    const imageUrl = `/api/images/${msg.image.filename}${msg.image.width ? `?w=${msg.image.width}&h=${msg.image.height}` : ''}`;
                    userDiv = appendUserMessage(msg.content, imageUrl, metadata);
                } else {
                    // Check for old legacy image tag pattern (fallback)
                    const imageTagPattern = /\[.+の画像\]/;
                    if (imageTagPattern.test(msg.content)) {
                        // Extract text without the image tag
                        const textWithoutTag = msg.content.replace(imageTagPattern, '').trim();
                        userDiv = appendUserMessageWithPlaceholder(textWithoutTag, metadata);
                    } else {
                        userDiv = appendUserMessage(msg.content, null, metadata);
                    }
                }
                if (msg.toxicity && msg.toxicity.userScore) {
                    applyToxicityWarning(userDiv, msg.toxicity.userScore);
                }
            } else if (msg.role === 'assistant') {
                const { messageDiv, contentDiv, copyBtn, feedbackBtns } = appendAiMessage(metadata);
                renderMarkdown(msg.content, contentDiv, copyBtn, feedbackBtns);

                if (msg.toxicity && msg.toxicity.aiScore) {
                    applyToxicityWarning(messageDiv, msg.toxicity.aiScore);
                }

                // Re-register copy listener for the specific content
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(msg.content);
                    const originalTooltip = copyBtn.dataset.tooltip;
                    copyBtn.dataset.tooltip = 'コピーしました！';
                    const icon = copyBtn.querySelector('i');
                    const originalClass = icon.className;
                    icon.className = 'fa-solid fa-check';
                    setTimeout(() => {
                        icon.className = originalClass;
                        copyBtn.dataset.tooltip = originalTooltip;
                    }, 2000);
                });
            }
            else if (msg.role === 'fork-marker') {
                appendForkMarker(msg.content);
            }
        });

    } catch (error) {
        // Abort if the user has navigated away
        if (state.currentSessionId !== sessionId) return;

        if (error.message === 'SESSION_EXPIRED') {
            // Remove this invalid session from local history
            state.history = state.history.filter(h => h.id !== sessionId);

            if (renderHistory) renderHistory();

            // If it's a 404 from server, it's truly not found - show static 404 page
            if (renderPage) renderPage('notFound');
        } else {
            showError(error.message);
        }
    } finally {
        if (state.currentSessionId !== sessionId) return;
        if (loadingDiv) loadingDiv.classList.add('hidden');
        scrollToBottom();
    }
};
