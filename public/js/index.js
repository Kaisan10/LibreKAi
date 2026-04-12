import {
    MAX_QUESTION_LENGTH,
    MAX_TEXTAREA_HEIGHT,
    CHAR_WARNING_THRESHOLD,
    CHAR_DANGER_THRESHOLD,
    MAX_HISTORY_ITEMS,
    HISTORY_TITLE_MAX_LENGTH,
    HISTORY_WARNING_THRESHOLD,
    STORAGE_KEY_HISTORY,
    STORAGE_KEY_VISITED,
    STORAGE_KEY_PRO_SETTINGS,
    DEFAULT_PRO_SETTINGS,
    AUTO_UPGRADE_CHECK_DELAY,
    COPY_SUCCESS_DISPLAY_TIME,
    THEMES,
    applyThemeVariables,
    COLOR_MUTED,
    COLOR_WARNING,
    COLOR_DANGER,
    VOICE_RECOGNITION_LANG,
    VOICE_MAX_ALTERNATIVES,
    VOICE_AUTO_PLAY_DEFAULT,
    VOICEVOX_DEFAULT_SPEAKER
} from './constants.js';

import { escapeHtml, sanitizeInput, createSafeTextNode, sanitizeAvatarUrl } from './sanitize.js';

import { state } from './state.js';

// サジェストは基本設定（DB）のみ。アイコンは Font Awesome クラスまたは SVG インラインを表示
import {
    isMobile,
    getSessionIdFromPath,
    updateUrlForSession,
    positionDropdown,
    closeDropdown,
    closeAllActiveDropdowns,
    closeModal,
    scrollToBottom,
    formatMessageTime,
    checkSystemStatus
} from './utils.js';
import {
    initChatUI,
    appendUserMessage,
    appendUserMessageWithPlaceholder,
    appendAiMessage,
    appendForkMarker,
    renderMarkdown,
    showError,
    enterMessageEditMode,
    applyToxicityWarning
} from './chat-ui.js';
import {
    initSession,
    loadSession,
    startNewChat
} from './session.js';
import {
    initRouter,
    navigateTo,
    prepareForStaticPage,
    showPageLoading,
    hidePageLoading,
    setupSpaLinks,
    handleRoute,
    showChatUI,
    renderPage
} from './router.js';

// Configure Marked (safe by default with DOMPurify, but let's set some efficient defaults)
marked.use({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
});

document.addEventListener('DOMContentLoaded', () => {
    // ============== DOM Elements ==============
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const newChatBtnSidebar = document.getElementById('newChatBtnSidebar');
    const historyList = document.getElementById('historyList');
    const sidebarContent = document.getElementById('sidebarContent');
    const historyContainer = document.getElementById('historyContainer');
    const tagsContainer = document.getElementById('tagsContainer');
    const pinnedContainer = document.getElementById('pinnedContainer');
    const pageNavList = document.getElementById('pageNavList');
    const adminSidebarSection = document.getElementById('adminSidebarSection');

    const mainContent = document.querySelector('.main-content');
    const chatContainer = document.getElementById('chatContainer');
    const messagesList = document.getElementById('messagesList');
    const welcomeMessage = document.querySelector('.welcome-message');
    const loadingDiv = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');


    const questionInput = document.getElementById('questionInput');
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    const errorMessage = document.getElementById('errorMessage');
    const errorTitle = document.getElementById('errorTitle');
    const errorDescription = document.getElementById('errorDescription');
    const errorActions = document.getElementById('errorActions');
    const retryBtn = document.getElementById('retryBtn');
    const dismissErrorBtn = document.getElementById('dismissErrorBtn');
    const shareBtnMobile = document.getElementById('shareBtnMobile');
    const shareBtnDesktop = document.getElementById('shareBtnDesktop');
    const shareBtnForkMobile = document.getElementById('shareBtnForkMobile');
    const shareBtnForkDesktop = document.getElementById('shareBtnForkDesktop');
    const desktopChatHeader = document.getElementById('desktopChatHeader');
    const chatTitle = document.getElementById('chatTitle');
    const desktopHeaderMenuBtn = document.getElementById('desktopHeaderMenuBtn');
    const mobileHeaderMenuBtn = document.getElementById('mobileHeaderMenuBtn');
    const suggestionCards = document.getElementById('suggestionCards');

    // Lazy-loaded module refs (assigned when scheduleLazyInit runs; stubs until then)
    let renderHistory = () => { };
    let loadHistoryFromLocalStorage = () => { };
    let loadHistoryFromServer = () => { };
    let loadDataSettings = () => { };
    let updateChatTitle = async () => { };
    let addToHistory = () => { };
    let deleteSession = async () => { };
    let confirmDeleteChat = () => { };
    let togglePinChat = async () => { };
    let updatePinnedSection = () => { };
    let updateTagsSection = () => { };
    let showTagTreeView = () => { };
    let getTagMappings = () => ({ idToName: {}, nameToId: {} });
    let updateHeaderTagsDisplay = () => { };
    let showTagManagementModal = async () => { };
    let loadAvailableTags = async () => { };
    let closeMobileSidebar = () => { };

    // Load app config (title, meta, suggestion cards, nav, pro) and render suggestion cards
    const renderSuggestionCardsFromConfig = () => {
        const cards = (state.appConfig && state.appConfig.suggestionCards) || [];
        const topEl = document.getElementById('suggestionCardsTop');
        const bottomEl = document.getElementById('suggestionCardsBottom');
        if (!topEl || !bottomEl) return;
        const half = Math.ceil(cards.length / 2);
        const topCards = cards.slice(0, half);
        const bottomCards = cards.slice(half);
        const toHtml = (c, index) => {
            const prompt = (c.prompt || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const text = escapeHtml(c.text || '');
            let iconHtml = '';
            if (c.iconType === 'svg' && (c.icon || '').trim()) {
                const raw = (c.icon || '').trim();
                const safe = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true } }) : raw.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                iconHtml = `<span class="suggestion-card-icon-svg">${safe}</span>`;
            } else {
                const icon = (c.icon || '').trim();
                iconHtml = icon ? `<i class="${icon.replace(/"/g, '&quot;')}"></i>` : '';
            }
            return `<button type="button" class="suggestion-card" data-prompt="${prompt}"><div class="suggestion-card-icon">${iconHtml}</div><span>${text}</span></button>`;
        };
        topEl.innerHTML = topCards.map((c, i) => toHtml(c, i)).join('');
        bottomEl.innerHTML = bottomCards.map((c, i) => toHtml(c, topCards.length + i)).join('');
    };
    const renderNavExtensions = () => {
        const list = document.getElementById('pageNavList');
        const placeholder = document.getElementById('pageNavExtensions');
        if (!list || !placeholder) return;
        const extensions = (state.appConfig && state.appConfig.navExtensions) || [];
        // Remove previously inserted extension links (same visual branch as 利用規約・埋め込みサイト)
        list.querySelectorAll('.page-nav-item[data-nav-extension="true"]').forEach((el) => el.remove());
        // Insert extension links as direct children of list (after 利用規約, before 埋め込みサイト) so CSS branch applies
        let insertBefore = placeholder;
        for (let i = extensions.length - 1; i >= 0; i--) {
            const n = extensions[i];
            const path = escapeHtml((n.path || '').slice(0, 200));
            const label = escapeHtml((n.label || '').slice(0, 100));
            const icon = (n.icon || 'fa-solid fa-link').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            const a = document.createElement('a');
            a.href = path;
            a.className = 'page-nav-item spa-link';
            a.dataset.path = path;
            a.dataset.navExtension = 'true';
            a.innerHTML = `<i class="${icon}"></i><span>${label}</span>`;
            list.insertBefore(a, insertBefore);
            insertBefore = a;
        }
        const pageNavContainer = document.querySelector('.page-nav-container:not(#adminSidebarSection)');
        if (pageNavContainer && typeof setupSpaLinks === 'function') setupSpaLinks(pageNavContainer);
    };

    fetch('/api/app/config')
        .then((r) => r.json())
        .then((data) => {
            state.appConfig = data;
            renderSuggestionCardsFromConfig();
            renderNavExtensions();
        })
        .catch(() => {
            state.appConfig = { siteTitle: '', metaDescription: '', metaKeywords: '', suggestionCards: [], navExtensions: [], pro: null };
        });

    // Modal Elements
    const agreeBtn = document.getElementById('agreeBtn');

    // ============== Input Area Landscape Layout Fix ==============
    const setupInputAreaLandscapeLayout = () => {
        const inputArea = document.querySelector('.input-area');
        const textareaContainer = document.querySelector('.textarea-container');
        const inputControls = document.querySelector('.input-controls');
        const controlsLeft = document.querySelector('.input-controls-left');
        const controlsRight = document.querySelector('.input-controls-right');

        if (!inputArea || !textareaContainer || !inputControls || !controlsLeft || !controlsRight) return;

        const mediaQuery = window.matchMedia('(orientation: landscape) and (max-height: 500px)');

        const handleLayoutChange = (e) => {
            if (e.matches) {
                // Landscape: move controls to sides
                if (controlsLeft.parentElement !== inputArea) {
                    inputArea.insertBefore(controlsLeft, textareaContainer);
                }
                if (controlsRight.parentElement !== inputArea) {
                    inputArea.appendChild(controlsRight);
                }
                inputArea.classList.add('landscape-layout');
            } else {
                // Portrait/PC: move controls back to original container
                if (controlsLeft.parentElement !== inputControls) {
                    inputControls.appendChild(controlsLeft);
                }
                if (controlsRight.parentElement !== inputControls) {
                    inputControls.appendChild(controlsRight);
                }
                inputArea.classList.remove('landscape-layout');
            }
        };

        // Initial check and listener
        handleLayoutChange(mediaQuery);
        mediaQuery.addEventListener('change', handleLayoutChange);
    };

    setupInputAreaLandscapeLayout();

    // Share Modal
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const sharePublicCheckbox = document.getElementById('sharePublicCheckbox');
    const shareDetails = document.getElementById('shareDetails');
    const shareUrlInput = document.getElementById('shareUrlInput');
    const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
    const shareExpirySelect = document.getElementById('shareExpirySelect');
    const saveShareSettingsBtn = document.getElementById('saveShareSettingsBtn');

    const alertModal = document.getElementById('alertModal');
    const alertTitle = document.getElementById('alertTitle');
    const alertMessage = document.getElementById('alertMessage');
    const alertOkBtn = document.getElementById('alertOkBtn');

    // Templates
    const aiMessageTemplate = document.getElementById('aiMessageTemplate');
    const userMessagePlaceholderTemplate = document.getElementById('userMessagePlaceholderTemplate');

    initChatUI({
        messagesList,
        questionInput,
        userMessageTemplate: document.getElementById('userMessageTemplate'),
        aiMessageTemplate,
        userMessagePlaceholderTemplate
    }, {
        submitQuestion: (...args) => submitQuestion(...args),
        regenerateResponse: (...args) => regenerateResponse(...args),
        showAlert: (...args) => showAlertDialog(...args) // Map showAlert to showAlertDialog
    });

    // Session, router, sidebar, history, tags, search, secret-settings, share are
    // lazy-loaded in requestIdleCallback (see scheduleLazyInit below).

    // Check system status for maintenance overlay
    checkSystemStatus(questionInput);

    // ============== Logo Error Handling (CSP-compliant) ==============
    const logoImg = document.getElementById('logoImg');
    const logo2Img = document.getElementById('logo2Img');

    if (logoImg) {
        logoImg.addEventListener('error', function () {
            this.style.display = 'none';
        });
    }

    if (logo2Img) {
        logo2Img.addEventListener('error', function () {
            this.style.display = 'none';
        });
    }

    // ============== Sidebar & History Logic ==============

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const dropdownOverlay = document.getElementById('dropdownOverlay');


    /**
     * Show a custom alert dialog instead of the browser's native alert()
     * @param {string} title - The title of the alert
     * @param {string} message - The message to display
     * @returns {Promise<void>} - Resolves when the user clicks "OK"
     */
    const showAlertDialog = (title, message) => {
        return new Promise((resolve) => {
            if (!alertModal || !alertTitle || !alertMessage || !alertOkBtn) {
                console.error('Alert modal elements not found');
                alert(message); // Fallback
                resolve();
                return;
            }

            alertTitle.textContent = title || 'お知らせ';
            alertMessage.textContent = message;
            alertModal.classList.remove('hidden');

            const onOk = () => {
                closeModal(alertModal);
                alertOkBtn.removeEventListener('click', onOk);
                resolve();
            };

            alertOkBtn.addEventListener('click', onOk, { once: true });
        });
    };

    // Make it available globally for other scripts
    window.showAlert = showAlertDialog;

    /**
     * Show a special "Pro Required" modal
     * @param {string} [message] - Optional message to display
     */
    const showProModal = (message) => {
        if (state.proEnabled === false) return;
        if (!state.appConfig || !state.appConfig.pro) return;

        const modal = document.getElementById('proRequiredModal');
        const titleEl = modal?.querySelector('.modal-header h2');
        const messageEl = document.getElementById('proModalMessage');
        const featuresEl = modal?.querySelector('.pro-features-summary ul');
        const closeBtn = document.getElementById('closeProModalBtn');
        const cancelBtn = document.getElementById('cancelProModalBtn');
        const upgradeBtn = document.getElementById('upgradeProModalBtn');
        const pro = state.appConfig.pro;
        const upgradeUrl = (pro && pro.upgradeUrl) ? pro.upgradeUrl : '/pages/pro';

        if (!modal) return;

        if (titleEl) titleEl.textContent = (pro && pro.modalTitle) ? pro.modalTitle : 'Proプラン限定機能';
        if (messageEl) messageEl.textContent = message || (pro && pro.modalMessage) || 'この機能を利用するにはProプランへのアップグレードが必要です。';
        if (featuresEl && pro && Array.isArray(pro.features) && pro.features.length) {
            featuresEl.innerHTML = pro.features.map((f) => `<li><i class="fa-solid fa-check"></i> ${escapeHtml(f)}</li>`).join('');
        }

        modal.classList.remove('hidden');

        const onDismiss = () => {
            closeModal(modal);
            cleanup();
        };

        const onUpgrade = () => {
            closeModal(modal);
            cleanup();
            if (typeof navigateTo === 'function') {
                navigateTo(upgradeUrl);
            } else {
                window.location.href = upgradeUrl;
            }
        };

        const cleanup = () => {
            closeBtn?.removeEventListener('click', onDismiss);
            cancelBtn?.removeEventListener('click', onDismiss);
            upgradeBtn?.removeEventListener('click', onUpgrade);
        };

        closeBtn?.addEventListener('click', onDismiss);
        cancelBtn?.addEventListener('click', onDismiss);
        upgradeBtn?.addEventListener('click', onUpgrade);
    };

    window.showProModal = showProModal;

    // ============== Message Info Modal ==============
    const messageInfoModal = document.getElementById('messageInfoModal');
    const closeMessageInfoBtn = document.getElementById('closeMessageInfoBtn');
    const closeMessageInfoOkBtn = document.getElementById('closeMessageInfoOkBtn');
    const messageInfoTimestamp = document.getElementById('messageInfoTimestamp');
    const messageInfoModel = document.getElementById('messageInfoModel');
    const messageInfoSpeed = document.getElementById('messageInfoSpeed');

    const showMessageInfo = (metadata) => {
        if (!messageInfoModal) return;

        // Format timestamp
        const timestamp = metadata.timestamp
            ? new Date(metadata.timestamp).toLocaleString('ja-JP', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            })
            : '-';

        // Format model name
        let modelName = metadata.model || '-';
        // Mapping for legacy names or if server sends identifiers
        const modelMapping = {
            'kai-standard': 'KAi C2.1',
            'kai-preview': 'KAi C2.2 Preview',
            'kai-c2.1': 'KAi C2.1',
            'kai-c2.2-preview': 'KAi C2.2 Preview'
        };
        if (modelMapping[modelName]) {
            modelName = modelMapping[modelName];
        } else if (modelName.includes('preview')) {
            modelName = 'KAi C2.2 Preview';
        } else if (modelName.includes('c2.1')) {
            modelName = 'KAi C2.1';
        }

        // Format speed
        const speed = metadata.tokensPerSec
            ? `${metadata.tokensPerSec.toFixed(1)} tk/s`
            : '-';

        if (messageInfoTimestamp) messageInfoTimestamp.textContent = timestamp;
        if (messageInfoModel) messageInfoModel.textContent = modelName;
        if (messageInfoSpeed) messageInfoSpeed.textContent = speed;

        messageInfoModal.classList.remove('hidden');
    };

    const closeMessageInfoModal = () => {
        if (messageInfoModal) {
            messageInfoModal.classList.add('hidden');
        }
    };

    if (closeMessageInfoBtn) {
        closeMessageInfoBtn.addEventListener('click', closeMessageInfoModal);
    }
    if (closeMessageInfoOkBtn) {
        closeMessageInfoOkBtn.addEventListener('click', closeMessageInfoModal);
    }

    // Close on overlay click
    if (messageInfoModal) {
        messageInfoModal.addEventListener('click', (e) => {
            if (e.target === messageInfoModal) {
                closeMessageInfoModal();
            }
        });
    }

    // Expose for use in appendAiMessage
    window.showMessageInfo = showMessageInfo;

    // ============== Bottom Sheet Swipe Gesture ==============
    const setupBottomSheetSwipe = (bottomSheet) => {
        if (!bottomSheet) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const handleTouchStart = (e) => {
            if (!isMobile()) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            bottomSheet.classList.add('dragging');
        };

        const handleTouchMove = (e) => {
            if (!isDragging || !isMobile()) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            // Only allow dragging down
            if (deltaY > 0) {
                bottomSheet.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const handleTouchEnd = () => {
            if (!isDragging || !isMobile()) return;
            isDragging = false;
            bottomSheet.classList.remove('dragging');

            const deltaY = currentY - startY;
            const threshold = 100; // pixels to trigger close

            if (deltaY > threshold) {
                // Close the bottom sheet
                bottomSheet.style.transform = '';
                bottomSheet.classList.add('closing');

                if (dropdownOverlay) {
                    dropdownOverlay.classList.remove('visible');
                }

                setTimeout(() => {
                    bottomSheet.classList.add('hidden');
                    bottomSheet.classList.remove('closing');
                    bottomSheet.classList.remove('visible');

                    // Move back to original parent if needed
                    if (bottomSheet.parentElement === document.body) {
                        const originalParent = bottomSheet.dataset.originalParent;
                        if (originalParent) {
                            const parent = document.getElementById(originalParent);
                            if (parent) parent.appendChild(bottomSheet);
                        }
                    }
                }, 150);
            } else {
                // Snap back
                bottomSheet.style.transform = '';
            }
        };

        // Add touch listeners to the entire bottom sheet
        bottomSheet.addEventListener('touchstart', handleTouchStart, { passive: true });
        bottomSheet.addEventListener('touchmove', handleTouchMove, { passive: false });
        bottomSheet.addEventListener('touchend', handleTouchEnd, { passive: true });
    };

    // Setup swipe for all bottom sheets
    const bottomSheetIds = ['imageUploadDropdown', 'controlPanelDropdown', 'aiSettingsPanel', 'userDropdown'];
    bottomSheetIds.forEach(id => {
        const sheet = document.getElementById(id);
        if (sheet) setupBottomSheetSwipe(sheet);
    });

    // Click dropdown overlay to close all dropdowns
    if (dropdownOverlay) {
        dropdownOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllActiveDropdowns();
        });
    }

    const handleInitialRoute = () => {
        handleRoute();
        const pageNavContainer = document.querySelector('.page-nav-container:not(#adminSidebarSection)');
        if (pageNavContainer) {
            setupSpaLinks(pageNavContainer);
        }
    };

    // Lazy-load sidebar, history, tags, search, secret-settings, share and then init router/session
    function scheduleLazyInit() {
        const run = () => {
            Promise.all([
                import('./sidebar.js'),
                import('./history.js'),
                import('./tags.js'),
                import('./search.js'),
                import('./secret-settings.js'),
                import('./share.js')
            ]).then(([sidebarMod, historyMod, tagsMod, searchMod, secretSettingsMod, shareMod]) => {
                const closeMobileSidebarFn = sidebarMod.closeMobileSidebar;
                const pageNavContainer = document.querySelector('.page-nav-container:not(#adminSidebarSection)');

                // Expose lazy-loaded functions to the rest of the app
                renderHistory = historyMod.renderHistory;
                loadHistoryFromLocalStorage = historyMod.loadHistoryFromLocalStorage;
                loadHistoryFromServer = historyMod.loadHistoryFromServer;
                loadDataSettings = historyMod.loadDataSettings;
                updateChatTitle = historyMod.updateChatTitle;
                addToHistory = historyMod.addToHistory;
                deleteSession = historyMod.deleteSession;
                confirmDeleteChat = historyMod.confirmDeleteChat;
                togglePinChat = historyMod.togglePinChat;
                updatePinnedSection = historyMod.updatePinnedSection;
                updateTagsSection = tagsMod.updateTagsSection;
                showTagTreeView = tagsMod.showTagTreeView;
                getTagMappings = tagsMod.getTagMappings;
                updateHeaderTagsDisplay = tagsMod.updateHeaderTagsDisplay;
                showTagManagementModal = tagsMod.showTagManagementModal;
                loadAvailableTags = tagsMod.loadAvailableTags;
                closeMobileSidebar = closeMobileSidebarFn;

                tagsMod.initTags({
                    loadingDiv: document.getElementById('loading'),
                    chatContainer,
                    staticPageContainer: document.getElementById('staticPageContainer'),
                    inputWrapper: document.querySelector('.input-area-wrapper'),
                    tagDropdown: document.getElementById('tagDropdown')
                }, {
                    loadSession: (...args) => loadSession(...args),
                    showAlert: (...args) => showAlertDialog(...args),
                    renderHistory: () => historyMod.renderHistory()
                });

                historyMod.initHistory({
                    historyList,
                    saveTextCheckbox: document.getElementById('saveTextHistoryCheckbox'),
                    saveImageCheckbox: document.getElementById('saveImageHistoryCheckbox'),
                    sidebarContent: document.getElementById('sidebarContent'),
                    chatTitle,
                    mobileChatTitle: document.getElementById('mobileChatTitle')
                }, {
                    showAlertDialog,
                    showConfirmModal: (...args) => showConfirmModal(...args),
                    loadSession: (...args) => loadSession(...args),
                    startNewChat: (...args) => startNewChat(...args),
                    openSessionDropdown: (...args) => openSessionDropdown(...args),
                    closeMobileSidebar: closeMobileSidebarFn,
                    showTagTreeView: (...args) => tagsMod.showTagTreeView(...args),
                    updateTagsSection: () => tagsMod.updateTagsSection()
                });

                sidebarMod.initSidebar({
                    sidebar,
                    sidebarOverlay,
                    mobileMenuBtn,
                    toggleSidebarBtn,
                    historyContainer,
                    tagsContainer,
                    pinnedContainer,
                    pageNavContainer,
                    adminSidebarSection,
                    newChatBtnSidebar,
                    pageNavList,
                    adminPageNavList: document.getElementById('adminPageNavList')
                }, {
                    updateTagsSection: () => tagsMod.updateTagsSection(),
                    updatePinnedSection: () => historyMod.updatePinnedSection()
                });

                initRouter({
                    chatContainer,
                    staticPageContainer: document.getElementById('staticPageContainer'),
                    adminSidebarSection,
                    mainContent,
                    welcomeMessage: document.getElementById('welcomeMessage'),
                    headerMenuBtns: {
                        desktop: document.getElementById('desktopHeaderMenuBtn'),
                        mobile: document.getElementById('mobileHeaderMenuBtn')
                    },
                    shareBtns: { desktop: shareBtnDesktop, mobile: shareBtnMobile },
                    chatTitle,
                    mobileChatTitle: document.getElementById('mobileChatTitle'),
                    desktopChatHeader,
                    tagsContainer: document.getElementById('tagsContainer'),
                    pinnedContainer: document.getElementById('pinnedContainer'),
                    inputWrapper: document.querySelector('.input-area-wrapper'),
                    suggestionCards
                }, {
                    showTagTreeView: (...args) => tagsMod.showTagTreeView(...args),
                    updateHeaderTagsDisplay: () => tagsMod.updateHeaderTagsDisplay(),
                    closeMobileSidebar: closeMobileSidebarFn,
                    showSidebarHistory: sidebarMod.showSidebarHistory,
                    showSidebarPageNav: sidebarMod.showSidebarPageNav,
                    showSidebarAdmin: sidebarMod.showSidebarAdmin,
                    updatePageNavActive: sidebarMod.updatePageNavActive,
                    getTagMappings: () => tagsMod.getTagMappings()
                });

                initSession({
                    messagesList,
                    welcomeMessage: document.querySelector('.welcome-message'),
                    loadingDiv: document.getElementById('loading'),
                    loadingText: document.getElementById('loadingText'),
                    errorMessage: document.getElementById('errorMessage'),
                    chatTitle,
                    mobileChatTitle: document.getElementById('mobileChatTitle'),
                    questionInput,
                    shareBtnDesktop,
                    shareBtnMobile,
                    desktopChatHeader,
                    shareBtnForkDesktop: document.getElementById('shareBtnForkDesktop'),
                    shareBtnForkMobile: document.getElementById('shareBtnForkMobile'),
                    suggestionCards
                }, {
                    showChatUI,
                    renderPage,
                    updateHeaderTagsDisplay: () => tagsMod.updateHeaderTagsDisplay(),
                    autoResizeTextarea: (...args) => autoResizeTextarea(...args),
                    renderHistory: () => historyMod.renderHistory(),
                    updatePageNavActive: sidebarMod.updatePageNavActive,
                    closeMobileSidebar: closeMobileSidebarFn
                });

                searchMod.initSearch({
                    closeMobileSidebar: closeMobileSidebarFn,
                    loadSession: (...args) => loadSession(...args)
                });

                secretSettingsMod.initSecretSettings({
                    alertModal,
                    alertTitle,
                    alertMessage,
                    alertOkBtn
                });

                shareMod.initShare({
                    shareModal,
                    shareUrlInput,
                    sharePublicCheckbox,
                    shareDetails,
                    shareExpirySelect,
                    copyShareUrlBtn,
                    saveShareSettingsBtn,
                    closeShareModalBtn,
                    shareBtnMobile,
                    shareBtnDesktop,
                    shareBtnForkMobile,
                    shareBtnForkDesktop
                }, {
                    showAlertDialog,
                    renderHistory: () => historyMod.renderHistory(),
                    navigateTo: (...args) => navigateTo(...args)
                });
                window.openShareModal = shareMod.openShareModal;

                handleInitialRoute();

                // Initialize history and login-dependent UI (must run after history module is loaded)
                historyMod.loadHistoryFromLocalStorage();
                checkLoginStatus().then(async () => {
                    if (state.isLoggedIn) {
                        historyMod.loadHistoryFromServer();
                        try {
                            const response = await fetch('/api/user/settings');
                            const settings = await response.json();
                            await loadProSettings(settings);
                            historyMod.loadDataSettings(settings);
                            checkFirstVisit(settings);
                        } catch (e) {
                            console.error('Failed to load settings:', e);
                            await loadProSettings();
                            historyMod.loadDataSettings();
                            checkFirstVisit();
                        }
                    } else {
                        historyMod.renderHistory();
                        historyMod.loadDataSettings();
                        checkFirstVisit();
                    }
                });

                window.addEventListener('popstate', () => {
                    const path = window.location.pathname;
                    const isAdmin = path.startsWith('/admin');
                    if (!isAdmin) {
                        showPageLoading();
                        if (!prepareForStaticPage(path)) {
                            showChatUI();
                        }
                    }
                    const runPop = () => {
                        handleRoute();
                        if (!isAdmin) hidePageLoading();
                    };
                    if (isAdmin) runPop(); else setTimeout(runPop, 200);
                });

                newChatBtnSidebar.addEventListener('click', () => {
                    startNewChat();
                    closeMobileSidebar();
                });

                if (state.isLoggedIn) loadAvailableTags();
                updatePinnedSection();
                updateTagsSection();
            }).catch((err) => {
                console.error('Failed to load lazy modules:', err);
            });
        };
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(run, { timeout: 2000 });
        } else {
            setTimeout(run, 1);
        }
    }
    scheduleLazyInit();

    // ============== Chat Logic ==============



    const autoResizeTextarea = () => {
        // Use a hidden clone to measure the height without disrupting the transition
        const clone = questionInput.cloneNode(true);
        clone.style.width = getComputedStyle(questionInput).width;
        clone.style.height = 'auto';
        clone.style.visibility = 'hidden';
        clone.style.position = 'absolute';
        clone.style.pointerEvents = 'none';

        // Copy relevant styles that affect height
        clone.style.padding = getComputedStyle(questionInput).padding;
        clone.style.lineHeight = getComputedStyle(questionInput).lineHeight;
        clone.style.fontSize = getComputedStyle(questionInput).fontSize;
        clone.style.boxSizing = getComputedStyle(questionInput).boxSizing;

        document.body.appendChild(clone);
        const scrollHeight = clone.scrollHeight;
        const newHeight = Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT);
        document.body.removeChild(clone);

        questionInput.style.height = newHeight + 'px';

        // Manage scrollbar visibility to prevent flashing
        if (scrollHeight > MAX_TEXTAREA_HEIGHT) {
            questionInput.style.overflowY = 'auto';
        } else {
            questionInput.style.overflowY = 'hidden';
        }
    };

    questionInput.addEventListener('input', () => {
        updateButtonState();
        autoResizeTextarea();
        updateMarkdownPreview();
    });

    // Live Markdown Preview
    const markdownPreview = document.getElementById('markdownPreview');

    const updateMarkdownPreview = () => {
        if (!markdownPreview) return;

        const text = questionInput.value.trim();

        // Only show preview if there's markdown-like content
        const hasMarkdown = /[*_`#\[\]]/.test(text);

        if (text && hasMarkdown) {
            // Parse without headings for user preview
            const html = DOMPurify.sanitize(marked.parse(text));
            markdownPreview.innerHTML = html;
            markdownPreview.classList.remove('hidden');
        } else {
            markdownPreview.classList.add('hidden');
            markdownPreview.innerHTML = '';
        }
    };

    const updateButtonState = () => {
        const hasText = questionInput.value.trim().length > 0;
        submitBtn.disabled = !hasText || state.isLoading;
    };



    // ============== Inline Message Editing ==============


    // ============== Message Handling ==============

    // Share modal is initialized in scheduleLazyInit (lazy-loaded share.js).

    // ============== Image Fullscreen Modal ==============
    const imageModal = document.getElementById('imageModal');
    const imageModalImg = document.getElementById('imageModalImg');
    const closeImageModalBtn = document.getElementById('closeImageModalBtn');

    const openImageModal = (src) => {
        if (!src || !imageModalImg || !imageModal) return;
        imageModalImg.src = src;
        imageModal.classList.remove('hidden');
    };

    const closeImageModal = () => {
        imageModal.classList.add('hidden');
        imageModalImg.src = '';
    };

    if (closeImageModalBtn) {
        closeImageModalBtn.addEventListener('click', closeImageModal);
    }

    if (imageModal) {
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) {
                closeImageModal();
            }
        });
    }

    // ============== Rename Modal Logic ==============
    const renameModal = document.getElementById('renameModal');
    const renameInput = document.getElementById('renameInput');
    const closeRenameModalBtn = document.getElementById('closeRenameModalBtn');
    const cancelRenameBtn = document.getElementById('cancelRenameBtn');
    const saveRenameBtn = document.getElementById('saveRenameBtn');
    let modifyingSessionId = null;

    const openRenameModal = (sessionId, currentTitle) => {
        modifyingSessionId = sessionId;
        renameInput.value = currentTitle;
        renameModal.classList.remove('hidden');
        renameInput.focus();
    };

    const closeRenameModal = () => {
        renameModal.classList.add('hidden');
        modifyingSessionId = null;
        renameInput.value = '';
    };

    if (closeRenameModalBtn) closeRenameModalBtn.addEventListener('click', closeRenameModal);
    if (cancelRenameBtn) cancelRenameBtn.addEventListener('click', closeRenameModal);

    if (saveRenameBtn) {
        saveRenameBtn.addEventListener('click', () => {
            const newTitle = renameInput.value.trim();
            if (modifyingSessionId && newTitle) {
                updateChatTitle(modifyingSessionId, newTitle);
                closeRenameModal();
            }
        });
    }

    // Allow Enter key to save
    if (renameInput) {
        renameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveRenameBtn.click();
            }
        });
    }

    // ============== Inline Title Edit ==============
    if (chatTitle) {
        chatTitle.addEventListener('click', () => {
            if (!state.currentSessionId || !state.isOwner) return;

            const currentTitle = chatTitle.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.className = 'chat-title-input';

            const originalDisplay = chatTitle.style.display;
            chatTitle.style.display = 'none';
            chatTitle.parentNode.insertBefore(input, chatTitle);
            input.focus();
            input.select();

            let isFinishing = false;
            const finishEdit = async (save) => {
                if (isFinishing) return;
                isFinishing = true;

                const newTitle = input.value.trim();
                input.remove();
                chatTitle.style.display = originalDisplay;

                if (save && newTitle && newTitle !== currentTitle) {
                    chatTitle.textContent = newTitle;
                    await updateChatTitle(state.currentSessionId, newTitle);
                }
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finishEdit(true);
                } else if (e.key === 'Escape') {
                    finishEdit(false);
                }
            });

            input.addEventListener('blur', () => {
                finishEdit(true);
            });
        });
    }

    // ============== API & Streaming ==============



    dismissErrorBtn.addEventListener('click', () => {
        errorMessage.classList.add('hidden');
    });

    const streamAnswer = async (response, contentDiv) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let sentenceBuffer = '';

        const checkAndQueueSentence = (text) => {
            const sentenceMatch = text.match(/^(.*?[。、])/);
            if (sentenceMatch) {
                const sentence = sentenceMatch[1];
                const remaining = text.slice(sentence.length);

                if (state.voiceSettings.autoPlay && state.voiceSettings.available && sentence.trim() && isVoiceModalOpen) {
                    state.voiceQueue.push(sentence.trim());
                    console.log('[Voice Queue] Added:', sentence.trim(), '| Queue length:', state.voiceQueue.length);

                    // 最初の文がキューに追加された時点でマイク停止
                    if (state.voiceQueue.length === 1 && isVoiceModalOpen && recognition && state.isRecording && !isVoicePaused) {
                        try {
                            recognition.stop();
                            console.log('[Voice Queue] Microphone stopped when first sentence queued');
                        } catch (error) {
                            console.log('[Voice Queue] Failed to stop microphone:', error.message);
                        }
                    }

                    if (!state.isProcessingVoice) {
                        processVoiceQueue();
                    }
                }

                return remaining;
            }
            return text;
        };

        const processVoiceQueue = async () => {
            if (state.isProcessingVoice) {
                console.log('[Voice Queue] Already processing, skipping');
                return;
            }

            // 🔧 修正: フラグを先に設定（最重要！）
            state.isProcessingVoice = true;
            console.log('[Voice Queue] Processing flag set to TRUE');

            // マイク停止（フラグ設定後なので、recognition.onendが正しく動作する）
            if (isVoiceModalOpen && recognition && state.isRecording && !isVoicePaused) {
                try {
                    recognition.stop();
                    console.log('[Voice Queue] Microphone stopped before processing');
                } catch (error) {
                    console.log('[Voice Queue] Failed to stop microphone:', error.message);
                }
            }

            // UI状態を speaking に設定
            if (isVoiceModalOpen && voiceConversationModal) {
                voiceConversationModal.classList.add('speaking');
                if (voiceStatusText) {
                    voiceStatusText.textContent = 'AI応答中...';
                }
                updateWaveAnimation();
            }

            console.log('[Voice Queue] Starting processing, queue length:', state.voiceQueue.length);

            // キュー内の全音声を順次再生
            while (state.voiceQueue.length > 0) {
                const sentence = state.voiceQueue[0];
                console.log('[Voice Queue] Processing sentence:', sentence.substring(0, 30) + '...');

                try {
                    // shouldRestartMic = false を渡して、個別の音声終了時にマイクを再開しない
                    await synthesizeAndPlayVoice(sentence, false);
                    console.log('[Voice Queue] Completed sentence');
                } catch (error) {
                    console.error('[Voice Queue] Error processing sentence:', error);
                }

                state.voiceQueue.shift();
                console.log('[Voice Queue] Remaining in queue:', state.voiceQueue.length);
            }

            // 全ての音声再生が完了
            console.log('[Voice Queue] All sentences processed');

            // 🔧 修正: フラグをクリア
            state.isProcessingVoice = false;
            console.log('[Voice Queue] Processing flag set to FALSE');

            // UI状態を復元
            if (isVoiceModalOpen && voiceConversationModal) {
                voiceConversationModal.classList.remove('speaking');
                updateWaveAnimation();
            }

            // 全完了後にマイクを再開（continuousModeが有効な場合のみ）
            if (isVoiceModalOpen && recognition && !isVoicePaused && state.voiceSettings.continuousMode) {
                if (voiceStatusText) {
                    voiceStatusText.textContent = '待機中...';
                }

                // 小さな遅延を入れて、音声の余韻を避ける
                setTimeout(() => {
                    try {
                        if (!state.isRecording && !state.isLoading) {
                            console.log('[Voice Queue] Restarting microphone after all queue completed');
                            recognition.start();
                        }
                    } catch (error) {
                        console.log('[Voice Queue] Failed to restart microphone:', error.message);
                    }
                }, 300); // 🔧 遅延を100ms→300msに増加
            }
        };

        // ストリーミング処理
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);

                if (!line || line.startsWith(':')) continue;

                try {
                    const json = JSON.parse(line);

                    if (json.metadata) {
                        const messageDiv = contentDiv.closest('.message');
                        if (messageDiv) {
                            messageDiv.dataset.metadata = JSON.stringify(json.metadata);
                            // Apply toxicity warnings if score is available
                            if (json.metadata.toxicity) {
                                applyToxicityWarning(messageDiv, json.metadata.toxicity.aiScore);
                                // Apply to user message (preceding sibling)
                                const userMessage = messageDiv.previousElementSibling;
                                if (userMessage && userMessage.classList.contains('user-message')) {
                                    applyToxicityWarning(userMessage, json.metadata.toxicity.userScore);
                                }
                            }
                        }
                        continue;
                    }

                    if (json.content) {
                        fullText += json.content;
                        state.currentAnswer = fullText;

                        sentenceBuffer += json.content;
                        sentenceBuffer = checkAndQueueSentence(sentenceBuffer);

                        const html = DOMPurify.sanitize(marked.parse(fullText));
                        contentDiv.innerHTML = html;

                        const cursor = document.createElement('span');
                        cursor.className = 'typing-cursor';
                        const lastElement = contentDiv.lastElementChild || contentDiv;
                        lastElement.appendChild(cursor);

                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                } catch (e) {
                    console.error('Parse error:', e);
                }
            }
        }

        // 最後の文をキューに追加
        if (sentenceBuffer.trim() && state.voiceSettings.autoPlay && state.voiceSettings.available && isVoiceModalOpen) {
            state.voiceQueue.push(sentenceBuffer.trim());
            console.log('[Voice Queue] Added final sentence:', sentenceBuffer.trim());
            if (!state.isProcessingVoice) {
                processVoiceQueue();
            }
        }

        return fullText;
    };

    // ============== Image Upload & Vision ==============
    const imageInput = document.getElementById('imageInput');
    const imagePreviewArea = document.getElementById('imagePreviewArea');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');

    const clearImageSelection = () => {
        state.selectedImage = null;
        state.imageDataUrl = null;
        if (imageInput) imageInput.value = '';
        if (imagePreviewArea) imagePreviewArea.classList.add('hidden');
    };

    const classifyImage = async (file) => {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/vision/classify', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '分類に失敗しました');
            }

            const result = await response.json();
            // Store the label for the question
            state.imageLabel = result.label;
        } catch (error) {
            console.error('Image classification error:', error);
            state.imageLabel = '不明な画像'; // Fallback label
        }
    };

    // Handle image file selection (shared by file input and drag-drop)
    const handleImageFile = async (file) => {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showAlertModal('エラー', '画像ファイルを選択してください');
            return;
        }

        // Validate file size (1MB max)
        if (file.size > 1 * 1024 * 1024) {
            showAlertModal('エラー', '画像サイズは1MB以下にしてください');
            return;
        }

        state.selectedImage = file;

        // Show preview and store data URL
        const reader = new FileReader();
        reader.onload = (event) => {
            state.imageDataUrl = event.target.result;
            imagePreview.src = event.target.result;
            imagePreviewArea.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // Classify image (for AI context)
        await classifyImage(file);
        updateButtonState();
    };

    if (imageInput) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            await handleImageFile(file);
        });
    }

    // ============== Drag and Drop Image Upload ==============
    const inputAreaWrapper = document.querySelector('.input-area-wrapper');

    if (inputAreaWrapper) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            inputAreaWrapper.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Visual feedback on drag
        ['dragenter', 'dragover'].forEach(eventName => {
            inputAreaWrapper.addEventListener(eventName, () => {
                inputAreaWrapper.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            inputAreaWrapper.addEventListener(eventName, () => {
                inputAreaWrapper.classList.remove('drag-over');
            });
        });

        // Handle dropped files
        inputAreaWrapper.addEventListener('drop', async (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                // Only handle the first image file
                const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
                if (imageFile) {
                    await handleImageFile(imageFile);
                }
            }
        });

        // Handle pasted images
        questionInput.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
            if (imageItem) {
                const file = imageItem.getAsFile();
                if (file) {
                    await handleImageFile(file);
                }
            }
        });
    }

    // ============== Image Upload Dropdown ==============
    const toggleImageUploadBtn = document.getElementById('toggleImageUploadBtn');
    const imageUploadDropdown = document.getElementById('imageUploadDropdown');
    const selectImageBtn = document.getElementById('selectImageBtn');

    if (toggleImageUploadBtn && imageUploadDropdown) {
        toggleImageUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const isHidden = imageUploadDropdown.classList.contains('hidden');

            // Close other dropdowns
            if (controlPanelDropdown) controlPanelDropdown.classList.add('hidden');
            if (aiSettingsPanel) aiSettingsPanel.classList.add('hidden');

            if (isHidden) {
                // Opening
                imageUploadDropdown.classList.remove('hidden');

                // Move to body on mobile to escape stacking context
                if (isMobile()) {
                    document.body.appendChild(imageUploadDropdown);
                } else {
                    // Position dropdown within viewport bounds
                    const rect = toggleImageUploadBtn.getBoundingClientRect();
                    positionDropdown(imageUploadDropdown, rect);
                }

                // Show overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.add('visible');
                }
            } else {
                // Closing with animation
                imageUploadDropdown.classList.add('closing');

                // Hide overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.remove('visible');
                }

                setTimeout(() => {
                    imageUploadDropdown.classList.add('hidden');
                    imageUploadDropdown.classList.remove('closing');
                    // Move back to original container on mobile
                    if (isMobile() && imageUploadDropdown.parentElement === document.body) {
                        const container = document.querySelector('.image-upload-container');
                        if (container) container.appendChild(imageUploadDropdown);
                    }
                }, 150);
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!imageUploadDropdown.classList.contains('hidden') &&
                !e.target.closest('#imageUploadDropdown') &&
                !e.target.closest('#toggleImageUploadBtn')) {
                imageUploadDropdown.classList.add('closing');

                // Hide overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.remove('visible');
                }

                setTimeout(() => {
                    imageUploadDropdown.classList.add('hidden');
                    imageUploadDropdown.classList.remove('closing');
                    // Move back to original container on mobile
                    if (isMobile() && imageUploadDropdown.parentElement === document.body) {
                        const container = document.querySelector('.image-upload-container');
                        if (container) container.appendChild(imageUploadDropdown);
                    }
                }, 150);
            }
        });
    }

    // Select Image button in dropdown
    if (selectImageBtn) {
        selectImageBtn.addEventListener('click', () => {
            if (imageInput) imageInput.click();
            if (imageUploadDropdown) {
                imageUploadDropdown.classList.add('closing');
                setTimeout(() => {
                    imageUploadDropdown.classList.add('hidden');
                    imageUploadDropdown.classList.remove('closing');
                }, 150);
            }
            if (isMobile() && dropdownOverlay) {
                dropdownOverlay.classList.remove('visible');
            }
        });
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', clearImageSelection);
    }

    // ============== Control Panel Dropdown (Pro Only) ==============
    const controlPanelContainer = document.getElementById('controlPanelContainer');
    const toggleControlPanelBtn = document.getElementById('toggleControlPanelBtn');
    const controlPanelDropdown = document.getElementById('controlPanelDropdown');
    const openAiSettingsBtn = document.getElementById('openAiSettingsBtn');
    const aiSettingsPanel = document.getElementById('aiSettingsPanel');
    const controlTempSlider = document.getElementById('controlTempSlider');
    const controlTopPSlider = document.getElementById('controlTopPSlider');
    const controlTempValue = document.getElementById('controlTempValue');
    const controlTopPValue = document.getElementById('controlTopPValue');

    // Load saved parameter values from localStorage
    const loadControlPanelSettings = () => {
        const savedTemp = localStorage.getItem('controlPanelTemp');
        const savedTopP = localStorage.getItem('controlPanelTopP');

        if (savedTemp && controlTempSlider) {
            controlTempSlider.value = savedTemp;
            if (controlTempValue) controlTempValue.textContent = savedTemp;
        }

        if (savedTopP && controlTopPSlider) {
            controlTopPSlider.value = savedTopP;
            if (controlTopPValue) controlTopPValue.textContent = savedTopP;
        }
    };

    // Initialize control panel settings
    loadControlPanelSettings();

    if (toggleControlPanelBtn && controlPanelDropdown) {
        toggleControlPanelBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const isHidden = controlPanelDropdown.classList.contains('hidden');

            // Close other dropdowns
            if (imageUploadDropdown) imageUploadDropdown.classList.add('hidden');
            if (aiSettingsPanel) aiSettingsPanel.classList.add('hidden');

            if (isHidden) {
                // Opening
                controlPanelDropdown.classList.remove('hidden');

                // Move to body on mobile to escape stacking context
                if (isMobile()) {
                    document.body.appendChild(controlPanelDropdown);
                } else {
                    // Position dropdown within viewport bounds
                    const rect = toggleControlPanelBtn.getBoundingClientRect();
                    positionDropdown(controlPanelDropdown, rect);
                }

                // Show overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.add('visible');
                }
            } else {
                // Closing with animation
                controlPanelDropdown.classList.add('closing');

                // Hide overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.remove('visible');
                }

                setTimeout(() => {
                    controlPanelDropdown.classList.add('hidden');
                    controlPanelDropdown.classList.remove('closing');
                    resetModelSelectionUI();
                    // Move back to original container on mobile
                    if (isMobile() && controlPanelDropdown.parentElement === document.body) {
                        const container = document.getElementById('controlPanelContainer');
                        if (container) container.appendChild(controlPanelDropdown);
                    }
                }, 150);
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!controlPanelDropdown.classList.contains('hidden') &&
                !e.target.closest('#controlPanelDropdown') &&
                !e.target.closest('#toggleControlPanelBtn')) {
                controlPanelDropdown.classList.add('closing');

                // Hide overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.remove('visible');
                }

                setTimeout(() => {
                    controlPanelDropdown.classList.add('hidden');
                    controlPanelDropdown.classList.remove('closing');
                    resetModelSelectionUI();
                    // Move back to original container on mobile
                    if (isMobile() && controlPanelDropdown.parentElement === document.body) {
                        const container = document.getElementById('controlPanelContainer');
                        if (container) container.appendChild(controlPanelDropdown);
                    }
                }, 150);
            }
        });
    }

    // Open AI Settings Panel
    if (openAiSettingsBtn && aiSettingsPanel) {
        openAiSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close the dropdown menu
            if (controlPanelDropdown) {
                controlPanelDropdown.classList.add('hidden');
                resetModelSelectionUI();
            }

            // Open the AI settings panel
            aiSettingsPanel.classList.remove('hidden');

            // Move to body on mobile to escape stacking context
            if (isMobile()) {
                document.body.appendChild(aiSettingsPanel);
                if (dropdownOverlay) dropdownOverlay.classList.add('visible');
            } else {
                // Position panel within viewport bounds
                const rect = toggleControlPanelBtn.getBoundingClientRect();
                positionDropdown(aiSettingsPanel, rect);
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!aiSettingsPanel.classList.contains('hidden') &&
                !e.target.closest('#aiSettingsPanel') &&
                !e.target.closest('#toggleControlPanelBtn') &&
                !e.target.closest('#openAiSettingsBtn')) {
                aiSettingsPanel.classList.add('closing');

                // Hide overlay on mobile
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.remove('visible');
                }

                setTimeout(() => {
                    aiSettingsPanel.classList.add('hidden');
                    aiSettingsPanel.classList.remove('closing');
                    // Move back to original container on mobile
                    if (isMobile() && aiSettingsPanel.parentElement === document.body) {
                        const container = document.querySelector('.input-controls-left');
                        if (container) container.appendChild(aiSettingsPanel);
                    }
                }, 150);
            }
        });
    }
    // Tool Selection
    let availableTools = [];

    const openToolSelectionBtn = document.getElementById('openToolSelectionBtn');

    const loadAvailableTools = async () => {
        try {
            const response = await fetch('/api/tools');
            availableTools = await response.json();
            renderToolList(availableTools);
            renderToolBadges(); // Update badges with names once loaded
            renderRecentToolsSubMenu(); // Render recently used tools in dropdown
        } catch (e) {
            console.error('Failed to load tools:', e);
        }
    };

    const renderToolList = (tools) => {
        if (!toolList) return;
        toolList.innerHTML = '';
        if (tools.length === 0) {
            const isSearching = toolSearchInput && toolSearchInput.value.trim() !== '';
            const message = isSearching ? '一致するツールが見つかりませんでした' : '利用可能なツールがありません';
            toolList.innerHTML = `<div class="empty-state">${message}</div>`;
            return;
        }

        tools.forEach(tool => {
            const isSelected = state.selectedTools.includes(tool.id);
            const toolItem = document.createElement('div');
            toolItem.className = `tool-item ${isSelected ? 'selected' : ''}`;
            toolItem.innerHTML = `
                <div class="tool-item-info">
                    <div class="tool-item-name">${escapeHtml(tool.name)}</div>
                    <div class="tool-item-desc">${escapeHtml(tool.description)}</div>
                </div>
                <div class="tool-item-check">
                    <i class="fa-solid fa-check"></i>
                </div>
            `;
            toolItem.addEventListener('click', () => {
                if (isSelected) {
                    state.selectedTools = state.selectedTools.filter(id => id !== tool.id);
                } else {
                    state.selectedTools.push(tool.id);
                    updateRecentlyUsedTools(tool.id); // Add to recently used
                }
                renderToolList(tools);
                renderToolBadges();
                renderRecentToolsSubMenu();
            });
            toolList.appendChild(toolItem);
        });
    };

    const renderToolBadges = () => {
        if (!selectedToolsContainer) return;

        // Find current badges to preserve them if they are still selected
        const currentBadges = Array.from(selectedToolsContainer.children);
        const currentToolIds = currentBadges.map(b => b.dataset.id);

        // Remove badges that are no longer selected (with animation)
        currentBadges.forEach(badge => {
            const toolId = badge.dataset.id;
            if (!state.selectedTools.includes(toolId)) {
                badge.classList.add('removing');
                setTimeout(() => badge.remove(), 200);
            }
        });

        if (state.selectedTools.length === 0) {
            setTimeout(() => {
                if (state.selectedTools.length === 0) {
                    selectedToolsContainer.classList.add('hidden');
                }
            }, 200);
            return;
        }

        selectedToolsContainer.classList.remove('hidden');

        // Add new badges
        state.selectedTools.forEach((toolId) => {
            if (currentToolIds.includes(toolId)) return;

            const tool = availableTools.find(t => t.id === toolId);
            const displayName = tool ? (tool.badge_name || tool.name) : toolId;

            const badge = document.createElement('div');
            badge.className = 'tool-badge clickable';
            badge.dataset.id = toolId;
            badge.innerHTML = `
                <span>${escapeHtml(displayName)}</span>
            `;
            badge.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                state.selectedTools = state.selectedTools.filter(id => id !== toolId);
                renderToolBadges();
                renderToolList(availableTools);
                renderRecentToolsSubMenu();
                saveToolSelection();
            });
            selectedToolsContainer.appendChild(badge);
        });
    };

    const updateRecentlyUsedTools = (toolId) => {
        // Add to front, remove duplicates, limit to 3
        state.recentlyUsedTools = [toolId, ...state.recentlyUsedTools.filter(id => id !== toolId)].slice(0, 3);
        renderRecentToolsSubMenu();
        saveToolSelection();
    };

    const renderRecentToolsSubMenu = () => {
        const container = document.getElementById('recentToolsList');
        const menuItem = document.getElementById('toolSelectionMenuItem');
        if (!container || !menuItem) return;

        // Tools to show: Recently used ones that are NOT hidden
        let toolsToShow = state.recentlyUsedTools
            .filter(id => !state.hiddenTools.includes(id))
            .map(id => availableTools.find(t => t.id === id))
            .filter(t => !!t);

        // Fallback: If less than 3, add other non-hidden tools
        if (toolsToShow.length < 3) {
            const others = availableTools
                .filter(t => !state.recentlyUsedTools.includes(t.id) && !state.hiddenTools.includes(t.id))
                .slice(0, 3 - toolsToShow.length);
            toolsToShow = [...toolsToShow, ...others];
        }

        const subMenu = menuItem.querySelector('.sub-menu');
        if (toolsToShow.length === 0) {
            // No tools to show at all in sub-menu
            menuItem.classList.remove('has-sub-menu');
            if (subMenu) subMenu.classList.add('hidden');
            // Change click behavior to open modal directly
            menuItem.onclick = (e) => {
                e.stopPropagation();
                openToolSelectionBtn.click();
            };
            return;
        } else {
            menuItem.classList.add('has-sub-menu');
            if (subMenu) subMenu.classList.remove('hidden');
            menuItem.onclick = null; // Revert to sub-menu toggle handled elsewhere
        }

        container.innerHTML = '';
        toolsToShow.forEach(tool => {
            const isSelected = state.selectedTools.includes(tool.id);
            const item = document.createElement('div'); // Using div to contain button
            item.className = 'dropdown-item-container';
            item.style.position = 'relative';

            const btn = document.createElement('div');
            btn.className = `dropdown-item ${isSelected ? 'selected' : ''}`;
            btn.style.cursor = 'pointer';
            const iconClass = tool.icon || 'fa-screwdriver-wrench';
            btn.innerHTML = `
                <i class="fa-solid ${iconClass} tool-icon"></i>
                <span style="flex: 1;">${escapeHtml(tool.name)}</span>
                <div class="item-status-area" style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; position: relative;">
                    <i class="fa-solid fa-check model-check ${isSelected ? '' : 'hidden'}" style="margin-left: 0;"></i>
                    <button class="btn-remove-history" title="履歴から削除" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: none; border: none; padding: 0; color: var(--text-muted); cursor: pointer; opacity: 0; z-index: 2;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;

            // Re-fetch to attach listeners properly if needed, but since it's already in btn we can query it
            const removeBtn = btn.querySelector('.btn-remove-history');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleRemoveToolFromHistory(tool.id);
                });
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isSelected) {
                    state.selectedTools = state.selectedTools.filter(id => id !== tool.id);
                } else {
                    state.selectedTools.push(tool.id);
                    updateRecentlyUsedTools(tool.id);
                }
                renderToolList(availableTools);
                renderToolBadges();
                renderRecentToolsSubMenu();
                saveToolSelection();
            });

            item.appendChild(btn);
            container.appendChild(item);
        });
    };

    const handleRemoveToolFromHistory = async (toolId) => {
        // Find the tool name
        const tool = availableTools.find(t => t.id === toolId);
        const toolName = tool ? tool.name : toolId;

        const performHide = () => {
            state.recentlyUsedTools = state.recentlyUsedTools.filter(id => id !== toolId);
            state.hiddenTools.push(toolId);
            renderRecentToolsSubMenu();
            saveToolSelection();
        };

        if (state.skipToolHideConfirm) {
            performHide();
            return;
        }

        const confirmContent = `
            <div class="confirm-modal-content">
                <p>「${escapeHtml(toolName)}」を履歴から削除します。</p>
                <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
                    今後、このツールをサブメニューに表示しないようにしますか？
                </p>
                <div style="margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="skipToolConfirmCheck">
                    <label for="skipToolConfirmCheck" style="font-size: 0.85rem; cursor: pointer;">今後確認しない</label>
                </div>
            </div>
        `;

        showConfirmModal(confirmContent, (confirmed) => {
            if (confirmed) {
                const skipCheck = document.getElementById('skipToolConfirmCheck');
                if (skipCheck && skipCheck.checked) {
                    state.skipToolHideConfirm = true;
                }
                performHide();
            } else {
                // If cancelled but "don't ask again" was checked, we consider it a No-Op as per request
                // but we might still want to remove from recentlyUsedTools ONLY?
                // User said: "ok押したらそれからokを押してるのと同じ判定で"
                // Let's just remove from recentlyUsedTools if they just wanted to clear history
                state.recentlyUsedTools = state.recentlyUsedTools.filter(id => id !== toolId);
                renderRecentToolsSubMenu();
                saveToolSelection();
            }
        }, {
            title: '履歴からの削除',
            confirmText: '非表示にする',
            cancelText: '履歴のみ削除'
        });
    };

    const saveToolSelection = async () => {
        if (!state.isPro) return;
        try {
            await fetch('/api/user/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pro_settings: {
                        selectedTools: state.selectedTools,
                        recentlyUsedTools: state.recentlyUsedTools,
                        hiddenTools: state.hiddenTools,
                        skipToolHideConfirm: state.skipToolHideConfirm
                    }
                })
            });
        } catch (e) {
            console.error('Failed to save tool selection:', e);
        }
    };

    if (openToolSelectionBtn) {
        openToolSelectionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (toolSelectionModal) {
                if (toolSearchInput) {
                    toolSearchInput.value = '';
                }
                loadAvailableTools();
                toolSelectionModal.classList.remove('hidden');
                if (isMobile() && dropdownOverlay) {
                    dropdownOverlay.classList.add('visible');
                }
            }
            if (controlPanelDropdown) controlPanelDropdown.classList.add('hidden');
        });
    }

    if (closeToolSelectionBtn) {
        closeToolSelectionBtn.addEventListener('click', () => {
            closeModal(toolSelectionModal);
            if (dropdownOverlay) dropdownOverlay.classList.remove('visible');
        });
    }

    if (confirmToolSelectionBtn) {
        confirmToolSelectionBtn.addEventListener('click', () => {
            if (toolSelectionModal) {
                closeModal(toolSelectionModal);
                if (dropdownOverlay) dropdownOverlay.classList.remove('visible');
                saveToolSelection(); // Save after confirmation
            }
        });
    }

    if (toolSearchInput) {
        toolSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                renderToolList(availableTools);
                return;
            }

            const filteredTools = availableTools.filter(tool =>
                tool.name.toLowerCase().includes(query) ||
                (tool.description && tool.description.toLowerCase().includes(query))
            );
            renderToolList(filteredTools);
        });
    }

    // Temperature slider
    if (controlTempSlider && controlTempValue) {
        controlTempSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            controlTempValue.textContent = value;
            localStorage.setItem('controlPanelTemp', value);

            // Update Pro settings if user is Pro
            if (state.isPro && state.proSettings) {
                state.proSettings.temperature = parseFloat(value);
                localStorage.setItem(STORAGE_KEY_PRO_SETTINGS, JSON.stringify(state.proSettings));
            }
        });

        // Auto-save to server when slider is released
        controlTempSlider.addEventListener('change', async () => {
            if (state.isPro && state.proSettings && state.isLoggedIn) {
                await saveProSettings();
            }
        });
    }

    // Top P slider
    if (controlTopPSlider && controlTopPValue) {
        controlTopPSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            controlTopPValue.textContent = value;
            localStorage.setItem('controlPanelTopP', value);

            // Update Pro settings if user is Pro
            if (state.isPro && state.proSettings) {
                state.proSettings.top_p = parseFloat(value);
                localStorage.setItem(STORAGE_KEY_PRO_SETTINGS, JSON.stringify(state.proSettings));
            }
        });

        // Auto-save to server when slider is released
        controlTopPSlider.addEventListener('change', async () => {
            if (state.isPro && state.proSettings && state.isLoggedIn) {
                await saveProSettings();
            }
        });
    }


    // ============== AI Model Selection ==============
    const modelSelectionMenuItem = document.getElementById('modelSelectionMenuItem');
    const modelLabelSpan = modelSelectionMenuItem ? modelSelectionMenuItem.querySelector('span') : null;

    const updateModelUI = (model) => {
        if (!modelLabelSpan) return;
        if (!modelLabelSpan) return;

        if (model === 'tinyswallow') {
            modelLabelSpan.textContent = 'TinySwallow 1.5B';
            modelLabelSpan.style.background = 'none';
        } else {
            // Always show KAi C2.2
            modelLabelSpan.textContent = 'KAi C2.2';
        }
        modelLabelSpan.style.background = 'none';
        modelLabelSpan.style.webkitBackgroundClip = 'initial';
        modelLabelSpan.style.webkitTextFillColor = 'inherit';
        modelLabelSpan.style.fontWeight = 'inherit';
        modelLabelSpan.classList.remove('premium-glow');

        // Update selected state for checkmarks
        if (modelSelectionMenuItem) {
            const btns = modelSelectionMenuItem.querySelectorAll('.sub-menu .dropdown-item');
            btns.forEach(btn => {
                if (btn.dataset.model === model) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
        }
    };

    const initModelSelection = async () => {
        try {
            const response = await fetch('/api/ai-settings');
            if (response.ok) {
                const data = await response.json();
                state.selectedModel = data.selectedModel;
                updateModelUI(data.selectedModel);
            }
        } catch (e) {
            console.error('Failed to init model settings', e);
        }
    };

    const resetModelSelectionUI = () => {
        if (modelSelectionMenuItem) {
            modelSelectionMenuItem.classList.remove('active');
            const arrow = modelSelectionMenuItem.querySelector('.sub-menu-arrow');
            if (arrow) arrow.style.transform = '';
        }
    };

    if (modelSelectionMenuItem) {
        // Mobile toggle for sub-menu
        modelSelectionMenuItem.addEventListener('click', (e) => {
            if (isMobile()) {
                const backBtn = e.target.closest('.sub-menu-back-btn');
                if (backBtn) {
                    e.stopPropagation();
                    resetModelSelectionUI();
                    return;
                }

                if (!e.target.closest('.sub-menu')) {
                    e.stopPropagation();
                    modelSelectionMenuItem.classList.toggle('active');
                    const arrow = modelSelectionMenuItem.querySelector('.sub-menu-arrow');
                    if (arrow) {
                        arrow.style.transform = modelSelectionMenuItem.classList.contains('active') ? 'rotate(90deg)' : '';
                    }
                }
            }
        });

        // Handle model selection
        const modelBtns = modelSelectionMenuItem.querySelectorAll('.sub-menu .dropdown-item');
        modelBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const model = btn.dataset.model;
                try {
                    const response = await fetch('/api/ai-settings/model', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model })
                    });
                    if (response.ok) {
                        state.selectedModel = model;
                        updateModelUI(model);
                        // Close dropdowns
                        if (controlPanelDropdown) {
                            controlPanelDropdown.classList.add('closing');
                            setTimeout(() => {
                                controlPanelDropdown.classList.add('hidden');
                                controlPanelDropdown.classList.remove('closing');
                                resetModelSelectionUI();
                            }, 150);
                        }
                        if (dropdownOverlay) dropdownOverlay.classList.remove('visible');
                    }
                } catch (e) {
                    console.error('Failed to change model', e);
                }
            });
        });
    }

    const toolSelectionMenuItem = document.getElementById('toolSelectionMenuItem');

    const resetToolSelectionUI = () => {
        if (toolSelectionMenuItem) {
            toolSelectionMenuItem.classList.remove('active');
            const arrow = toolSelectionMenuItem.querySelector('.sub-menu-arrow');
            if (arrow) arrow.style.transform = '';
        }
    };

    if (toolSelectionMenuItem) {
        toolSelectionMenuItem.addEventListener('click', (e) => {
            if (isMobile()) {
                const backBtn = e.target.closest('.sub-menu-back-btn');
                if (backBtn) {
                    e.stopPropagation();
                    resetToolSelectionUI();
                    return;
                }

                if (!e.target.closest('.sub-menu')) {
                    e.stopPropagation();
                    toolSelectionMenuItem.classList.toggle('active');
                    const arrow = toolSelectionMenuItem.querySelector('.sub-menu-arrow');
                    if (arrow) {
                        arrow.style.transform = toolSelectionMenuItem.classList.contains('active') ? 'rotate(90deg)' : '';
                    }
                }
            }
        });
    }

    initModelSelection();

    const submitQuestion = async () => {
        const originalText = questionInput.value.trim();
        let question = originalText;
        const imageDataUrl = state.imageDataUrl;
        const imageLabel = state.imageLabel;

        // Validate: need either question or image
        if (!question && !imageDataUrl) return;

        // Clear image selection after using
        clearImageSelection();
        state.imageLabel = null;

        questionInput.value = '';
        questionInput.style.height = 'auto';
        submitBtn.disabled = true;
        submitBtn.classList.add('hidden');
        cancelBtn.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        state.isLoading = true;

        // Stop microphone during AI response to prevent feedback loop
        if (recognition && state.isRecording) {
            try {
                recognition.stop();
            } catch (error) {
                console.log('Failed to stop recognition:', error);
            }
        }

        updateButtonState();
        state.abortController = new AbortController();

        // Show image and text in chat
        appendUserMessage(originalText, imageDataUrl);

        // Hide welcome message and suggestion cards immediately
        if (!state.currentSessionId) {
            if (welcomeMessage) welcomeMessage.classList.add('hidden');
            const suggestionCardsContainer = document.getElementById('suggestionCards');
            if (suggestionCardsContainer) suggestionCardsContainer.classList.add('hidden');
            if (mainContent) mainContent.classList.remove('new-chat');
        }

        const { messageDiv, contentDiv, copyBtn, feedbackBtns } = appendAiMessage();
        contentDiv.innerHTML = '<div class="typing-cursor"></div>';

        try {
            const endpoint = state.currentSessionId ? '/api/ask-followup' : '/api/ask';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    model: state.selectedModel,
                    agreedToTerms: true,
                    sessionId: state.currentSessionId,
                    // Image label for prompt context
                    imageLabel: imageLabel || null,
                    // Send image data if available and setting enabled
                    image: state.dataSettings.saveImage ? imageDataUrl : null,
                    saveImageHistory: state.dataSettings.saveImage,
                    saveTextHistory: state.dataSettings.saveText,
                    // Pro features (only send if user is Pro)
                    ...(state.isPro && {
                        systemPrompt: state.proSettings?.systemPrompt,
                        temperature: state.proSettings?.temperature,
                        top_p: state.proSettings?.top_p,
                        tools: state.selectedTools
                    })
                }),
                signal: state.abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.errorType === 'session_expired') {
                    throw new Error('SESSION_EXPIRED');
                }
                // Restore input text on error (including prohibited content)
                if (originalText) {
                    questionInput.value = originalText;
                    updateButtonState();
                }
                throw new Error(errorData.error || 'サーバーエラーが発生しました');
            }

            state.currentRequestId = response.headers.get('X-Request-ID');
            if (state.currentRequestId) {
                const currentMeta = messageDiv.dataset.metadata ? JSON.parse(messageDiv.dataset.metadata) : {};
                currentMeta.id = state.currentRequestId;
                messageDiv.dataset.metadata = JSON.stringify(currentMeta);
                messageDiv.dataset.messageId = state.currentRequestId;
                messageDiv.dataset.requestId = state.currentRequestId;
            }
            const newSessionId = response.headers.get('X-Session-ID');

            if (!state.currentSessionId && newSessionId) {
                state.currentSessionId = newSessionId;
                addToHistory(newSessionId, question);
                updateUrlForSession(newSessionId);
                // Reveal header now that we have a session
                if (desktopChatHeader) desktopChatHeader.classList.remove('hidden');

                // Show header menu buttons
                const dHeaderMenuBtn = document.getElementById('desktopHeaderMenuBtn');
                const mHeaderMenuBtn = document.getElementById('mobileHeaderMenuBtn');
                if (dHeaderMenuBtn) dHeaderMenuBtn.classList.remove('hidden');
                if (mHeaderMenuBtn) mHeaderMenuBtn.classList.remove('hidden');

                // Show share buttons
                if (shareBtnDesktop) shareBtnDesktop.classList.remove('hidden');
                if (shareBtnMobile) shareBtnMobile.classList.remove('hidden');

                if (state.currentChatTags && state.currentChatTags.length > 0) {
                    await saveTagsToSession(newSessionId, state.currentChatTags);
                }
            }

            // Start Streaming
            await streamAnswer(response, contentDiv);

            // Final Markdown Render & Highlight
            if (state.currentAnswer) {
                contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(state.currentAnswer));

                // Re-apply toxicity warning to AI message
                const meta = messageDiv.dataset.metadata ? JSON.parse(messageDiv.dataset.metadata) : null;
                if (meta && meta.toxicity) {
                    applyToxicityWarning(messageDiv, meta.toxicity.aiScore);
                }

                // Also re-apply to user message if needed
                const userMsg = messageDiv.previousElementSibling;
                if (userMsg && userMsg.classList.contains('user-message') && meta && meta.toxicity) {
                    applyToxicityWarning(userMsg, meta.toxicity.userScore);
                }
            }

            // Copy full text logic
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(state.currentAnswer);
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

            // Voice playback handler (for manual playback button)
            addVoicePlayHandler(messageDiv, state.currentAnswer);

        } catch (error) {
            if (error.name === 'AbortError') {
                contentDiv.textContent += '';
            } else if (error.message === 'SESSION_EXPIRED') {
                showError('セッションの有効期限が切れました。新しいチャットを開始してください。', startNewChat, '新しいチャットを始める');
                contentDiv.textContent = '（セッション期限切れ）';
                messageDiv.classList.add('error');
            } else {
                showError(error.message || 'エラーが発生しました', submitQuestion);
                contentDiv.textContent = 'エラーが発生しました。';
                messageDiv.classList.add('error');
            }
        } finally {
            state.isLoading = false;
            state.abortController = null;
            submitBtn.disabled = false;
            submitBtn.classList.remove('hidden');
            cancelBtn.classList.add('hidden');
            updateButtonState();

            const cursor = contentDiv.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
        }
    };

    // Event Listeners
    submitBtn.addEventListener('click', submitQuestion);

    cancelBtn.addEventListener('click', () => {
        if (state.abortController) {
            state.abortController.abort();
        }
    });

    questionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!submitBtn.disabled) submitQuestion();
        }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key to close modals
        if (e.key === 'Escape') {
            if (!termsModal.classList.contains('hidden')) {
                // Don't allow closing terms modal on first visit
                const visited = localStorage.getItem(STORAGE_KEY_VISITED);
                if (visited) {
                    closeModal(termsModal);
                }
            }
            if (!confirmModal.classList.contains('hidden')) {
                closeModal(confirmModal);
            }
            if (!settingsModal.classList.contains('hidden')) {
                closeModal(settingsModal);
            }
        }

        // Ctrl+/ or Cmd+/ for new chat
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            startNewChat();
        }
    });

    // Modal Logic (accepts pre-fetched settings to avoid duplicate API calls)
    const checkFirstVisit = async (preloadedSettings = null) => {
        // For logged-in users, check server-side setting
        if (state.isLoggedIn) {
            let settings = preloadedSettings;
            if (!settings) {
                try {
                    const response = await fetch('/api/user/settings');
                    settings = await response.json();
                } catch (e) {
                    // Fallback to localStorage if server fails
                    const visited = localStorage.getItem(STORAGE_KEY_VISITED);
                    if (!visited) {
                        termsModal.classList.remove('hidden');
                    }
                    return;
                }
            }
            // Check server-side OR localStorage (for migration of existing users)
            const localVisited = localStorage.getItem(STORAGE_KEY_VISITED);
            if (!settings.has_agreed_terms && !localVisited) {
                termsModal.classList.remove('hidden');
            } else if (localVisited && !settings.has_agreed_terms) {
                // Migrate existing user's agreement to server
                try {
                    await fetch('/api/user/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ has_agreed_terms: true })
                    });
                } catch (e) {
                    console.error('Failed to migrate terms agreement:', e);
                }
            }
        } else {
            // Non-logged-in users use localStorage
            const visited = localStorage.getItem(STORAGE_KEY_VISITED);
            if (!visited) {
                termsModal.classList.remove('hidden');
            }
        }
    };

    if (agreeBtn) {
        agreeBtn.addEventListener('click', async () => {
            // Save to server for logged-in users
            if (state.isLoggedIn) {
                try {
                    await fetch('/api/user/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ has_agreed_terms: true })
                    });
                } catch (e) {
                    console.error('Failed to save terms agreement to server:', e);
                }
            }
            // Always save to localStorage as backup
            localStorage.setItem(STORAGE_KEY_VISITED, 'true');
            closeModal(termsModal);
            // Focus on input after agreeing
            questionInput.focus();
        });
    }

    // Generic Confirmation Modal
    const confirmModal = document.getElementById('confirmModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmOkBtn = document.getElementById('confirmOkBtn');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    let onConfirmAction = null;

    // Helper to create a safe text node
    const createSafeTextNode = (text) => document.createTextNode(text);

    const showConfirmModal = (titleOrMessage, messageOrCallback, onConfirmOrCallback, options = {}) => {
        let title, message, onConfirm, opts = options;

        if (typeof messageOrCallback === 'function') {
            // New Style Call: showConfirmModal(message, callback, options)
            message = titleOrMessage;
            onConfirm = messageOrCallback;
            opts = onConfirmOrCallback || {};
            title = opts.title || '確認';

            // Flag to indicate callback wants boolean result
            onConfirm.wantsResult = true;
        } else {
            // Legacy Style: showConfirmModal(title, message, callback, options)
            title = titleOrMessage;
            message = messageOrCallback;
            onConfirm = onConfirmOrCallback;
            opts = options || {};
        }

        confirmTitle.textContent = title;
        confirmMessage.innerHTML = ''; // Start fresh

        if (typeof message === 'string' && message.trim().startsWith('<')) {
            confirmMessage.innerHTML = message;
        } else if (typeof message === 'string') {
            const lines = message.split('\n');
            lines.forEach((line, index) => {
                if (index > 0) confirmMessage.appendChild(document.createElement('br'));

                if (line.includes('<a href=')) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = line;
                    confirmMessage.appendChild(tempDiv.firstChild || createSafeTextNode(line));
                } else {
                    confirmMessage.appendChild(createSafeTextNode(line));
                }
            });
        }

        confirmOkBtn.textContent = opts.confirmText || 'OK';
        confirmCancelBtn.textContent = opts.cancelText || 'キャンセル';
        confirmCancelBtn.style.display = ''; // Ensure visible

        onConfirmAction = onConfirm;
        confirmModal.classList.remove('hidden');
    };
    window.showConfirmModal = showConfirmModal;

    // Alert modal (only OK button)
    const showAlertModal = (title, message) => {
        confirmTitle.textContent = title;
        confirmMessage.textContent = '';
        const lines = message.split('\n');
        lines.forEach((line, index) => {
            if (index > 0) {
                confirmMessage.appendChild(document.createElement('br'));
            }
            confirmMessage.appendChild(createSafeTextNode(line));
        });
        onConfirmAction = null;
        confirmModal.classList.remove('hidden');
    };
    window.showAlertModal = showAlertModal;

    confirmOkBtn.addEventListener('click', () => {
        if (onConfirmAction) {
            if (onConfirmAction.wantsResult) {
                onConfirmAction(true);
            } else {
                onConfirmAction();
            }
        }
        closeModal(confirmModal);
        onConfirmAction = null;
    });

    confirmCancelBtn.addEventListener('click', () => {
        if (onConfirmAction && onConfirmAction.wantsResult) {
            onConfirmAction(false);
        }
        closeModal(confirmModal);
        onConfirmAction = null;
    });

    // Delete all chats (local + server) with confirmation
    const deleteAllChatsBtn = document.getElementById('deleteAllChatsBtn');
    const deleteAllChats = async () => {
        const sessionIds = [...state.history.map(h => h.id)];

        // Clear client-side state immediately
        state.history = [];

        renderHistory();
        startNewChat();

        // Best-effort server cleanup (ignore errors)
        await Promise.all(sessionIds.map(id =>
            fetch(`/api/session/${id}`, { method: 'DELETE' }).catch(err => console.error('Failed to delete session', id, err))
        ));
    };

    if (deleteAllChatsBtn) {
        deleteAllChatsBtn.addEventListener('click', () => {
            showConfirmModal(
                '全チャットを削除',
                'すべてのチャット履歴を削除します。元に戻せません。よろしいですか？',
                () => deleteAllChats()
            );
        });
    }

    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/user/me');
            const data = await response.json();
            const userInfoSidebar = document.getElementById('userInfoSidebar');

            if (!userInfoSidebar) return;

            // Remove skeleton screen
            const skeleton = userInfoSidebar.querySelector('.skeleton-user-info');
            if (skeleton) {
                skeleton.remove();
            }

            if (data.loggedIn) {
                // Set login state
                state.isLoggedIn = true;
                state.userId = data.user.id;
                state.username = data.user.username;

                const isPro = data.user.is_pro;
                const proEnabled = data.user.pro_enabled !== false; // Default to true
                state.isPro = isPro;
                state.proEnabled = proEnabled;

                // User role and pro status updated in state object
                state.role = data.user.role;
                state.isAdmin = data.user.admin;
                const autoRenew = data.user.auto_renew;
                let proBadge = '';
                let upgradeOption = '';

                if (proEnabled) {
                    if (isPro) {
                        // Active Pro
                        let remainingText = 'Pro適用中';
                        if (data.user.pro_expiry) {
                            const expiryDate = new Date(data.user.pro_expiry);
                            const timeDiff = expiryDate.getTime() - Date.now();
                            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                            const label = autoRenew ? '更新まで' : '残り';

                            if (daysDiff > 0) {
                                remainingText = `Pro (${label}${daysDiff}日)`;
                            } else if (daysDiff === 0) {
                                remainingText = 'Pro (本日まで)';
                            } else {
                                remainingText = 'Pro (期限切れ)';
                            }
                        }

                        proBadge = '<span class="pro-badge"><span>PRO</span></span>';
                        upgradeOption = `
                            <a href="/pages/pro" class="dropdown-item spa-link"><i class="fa-solid fa-crown"></i> ${remainingText}</a>
                        `;
                    } else {
                        upgradeOption = `<button id="upgradeBtn" class="dropdown-item"><i class="fa-solid fa-crown"></i> Proにアップグレード</button>`;
                    }
                }

                const escapedUsername = escapeHtml(data.user.username);
                let pointsDisplay = `${data.user.total_points || 0} pts`;
                if (data.user.points_service_available === false) {
                    pointsDisplay = '<span class="text-error" title="ポイントシステムが一時的に利用できません">サービス停止中</span>';
                }

                // Points display in sidebar (hide if proEnabled is false)
                const userPointsCompact = userInfoSidebar.querySelector('.user-points-compact');
                if (userPointsCompact) userPointsCompact.style.display = proEnabled ? '' : 'none';

                // ... check system status ...
                if (data.systemStatus && data.systemStatus.isHealthy === false) {
                    const overlay = document.getElementById('maintenanceOverlay');
                    const reasonEl = document.getElementById('maintenanceReason');
                    if (overlay && reasonEl) {
                        reasonEl.textContent = data.systemStatus.reason || 'システムメンテナンス中です。';
                        overlay.classList.remove('hidden');
                        if (questionInput) questionInput.disabled = true;
                    }
                }

                // Load saved tools if Pro or Pro disabled (all access)
                if (isPro || !proEnabled) {
                    try {
                        const settingsResponse = await fetch('/api/user/settings');
                        const settingsData = await settingsResponse.json();
                        if (settingsData.pro_settings && settingsData.pro_settings.selectedTools) {
                            state.selectedTools = settingsData.pro_settings.selectedTools;
                            state.recentlyUsedTools = settingsData.pro_settings.recentlyUsedTools || [];
                            state.hiddenTools = settingsData.pro_settings.hiddenTools || [];
                            state.skipToolHideConfirm = !!settingsData.pro_settings.skipToolHideConfirm;
                            await loadAvailableTools();
                        }
                    } catch (e) {
                        console.error('Failed to load user tool settings:', e);
                    }
                }

                // Validate avatar ...
                let avatarUrl = data.user.avatar_url;
                if (!avatarUrl || avatarUrl === 'null' || avatarUrl === 'undefined') {
                    avatarUrl = '/default-avatar.svg';
                } else {
                    avatarUrl = `/api/proxy/avatar?url=${encodeURIComponent(avatarUrl)}`;
                }

                userInfoSidebar.innerHTML = `
                    <div class="user-profile-compact" id="userMenuBtn">
                        <img src="${avatarUrl}" alt="Avatar" class="user-avatar-small" id="userAvatarImg">
                        <div class="user-details">
                            <div class="user-name-compact">${escapedUsername} ${proBadge}</div>
                            <div class="user-points-compact" style="${proEnabled ? '' : 'display:none'}">${pointsDisplay}</div>
                        </div>
                    </div>
                    
                    <div id="userDropdown" class="dropdown user-dropdown hidden">
                        ${upgradeOption}
                        <button id="settingsBtn" class="dropdown-item"><i class="fa-solid fa-gear"></i> 設定</button>
                        <a href="/pages" class="dropdown-item spa-link"><i class="fa-regular fa-file"></i> 他のページ</a>
                    </div>
                `;
                setupSpaLinks(userInfoSidebar);

                // ... avatar error handler ...
                const userAvatarImgElement = document.getElementById('userAvatarImg');
                if (userAvatarImgElement) {
                    userAvatarImgElement.addEventListener('error', function () {
                        this.src = '/default-avatar.svg';
                    });
                }

                // Show parameter control container if Pro or Pro disabled (all access)
                if (controlPanelContainer) {
                    controlPanelContainer.style.display = (isPro || !proEnabled) ? '' : 'none';
                }

                // User Menu Dropdown
                const userMenuBtn = document.getElementById('userMenuBtn');
                const userDropdown = document.getElementById('userDropdown');

                // 設定内のアカウントボタンの表示/非表示
                const settingsCancelProBtn = document.getElementById('settingsCancelProBtn');
                if (settingsCancelProBtn) {
                    settingsCancelProBtn.style.display = (isPro && proEnabled) ? '' : 'none';
                }
                if (settingsLogoutBtn) {
                    settingsLogoutBtn.style.display = state.isLoggedIn ? '' : 'none';
                }

                if (userMenuBtn && userDropdown) {
                    userMenuBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isHidden = userDropdown.classList.contains('hidden');

                        if (isHidden) {
                            // Opening
                            userDropdown.classList.remove('hidden');

                            // Position dropdown within viewport bounds (prefer above the trigger)
                            const rect = userMenuBtn.getBoundingClientRect();
                            positionDropdown(userDropdown, rect, { preferAbove: true, offset: 8 });

                            // Move dropdown to body on mobile to escape sidebar's stacking context
                            if (isMobile()) {
                                document.body.appendChild(userDropdown);
                            }

                            // Show overlay on mobile (AFTER moving dropdown to body)
                            if (isMobile() && dropdownOverlay) {
                                dropdownOverlay.classList.add('visible');
                            }

                            // Add visible class after a frame to trigger CSS animation
                            requestAnimationFrame(() => {
                                userDropdown.classList.add('visible');
                            });
                        } else {
                            // Closing
                            userDropdown.classList.remove('visible');
                            userDropdown.classList.add('closing');

                            // Hide overlay on mobile
                            if (isMobile() && dropdownOverlay) {
                                dropdownOverlay.classList.remove('visible');
                            }

                            setTimeout(() => {
                                userDropdown.classList.add('hidden');
                                userDropdown.classList.remove('closing');
                                // Reset positioning
                                userDropdown.style.position = '';
                                userDropdown.style.bottom = '';
                                userDropdown.style.left = '';
                                userDropdown.style.right = '';

                                // Move back to original parent on mobile
                                if (isMobile() && userDropdown.parentElement === document.body) {
                                    userInfoSidebar.appendChild(userDropdown);
                                }
                            }, 150);
                        }
                    });

                    // Close dropdown when clicking outside
                    document.addEventListener('click', (e) => {
                        // Don't close if clicking on the menu button or inside the dropdown
                        if (e.target.closest('#userMenuBtn') || e.target.closest('#userDropdown')) {
                            return;
                        }
                        if (!userDropdown.classList.contains('hidden')) {
                            userDropdown.classList.remove('visible');
                            userDropdown.classList.add('closing');

                            // Hide overlay on mobile
                            if (isMobile() && dropdownOverlay) {
                                dropdownOverlay.classList.remove('visible');
                            }

                            setTimeout(() => {
                                userDropdown.classList.add('hidden');
                                userDropdown.classList.remove('closing');

                                // Move back to original parent on mobile
                                if (isMobile() && userDropdown.parentElement === document.body) {
                                    userInfoSidebar.appendChild(userDropdown);
                                }
                            }, 150);
                        }
                    });

                    if (!isPro) {
                        document.getElementById('upgradeBtn').addEventListener('click', () => {
                            // Close dropdown properly
                            userDropdown.classList.remove('visible');
                            userDropdown.classList.add('hidden');

                            // Hide overlay on mobile
                            if (isMobile() && dropdownOverlay) {
                                dropdownOverlay.classList.remove('visible');
                            }

                            // Move back to original parent on mobile
                            if (isMobile() && userDropdown.parentElement === document.body) {
                                userInfoSidebar.appendChild(userDropdown);
                            }

                            subscribePro();
                        });
                    } else {
                        const settingsBtn = document.getElementById('proSettingsBtn');
                        if (settingsBtn) {
                            settingsBtn.addEventListener('click', () => {
                                // Close dropdown properly
                                userDropdown.classList.remove('visible');
                                userDropdown.classList.add('hidden');

                                // Hide overlay on mobile
                                if (isMobile() && dropdownOverlay) {
                                    dropdownOverlay.classList.remove('visible');
                                }

                                // Move back to original parent on mobile
                                if (isMobile() && userDropdown.parentElement === document.body) {
                                    userInfoSidebar.appendChild(userDropdown);
                                }

                                openSettingsModal('ai');
                            });
                        }
                    }

                    // 設定モーダル内の「解約する」「ログアウト」ボタン
                    if (settingsCancelProBtn) {
                        settingsCancelProBtn.addEventListener('click', () => {
                            cancelPro();
                        });
                    }

                    if (settingsLogoutBtn) {
                        settingsLogoutBtn.addEventListener('click', () => {
                            showConfirmModal('ログアウト確認', '本当にログアウトしますか?', async () => {
                                try {
                                    await fetch('/auth/logout', { method: 'POST' });
                                } catch (e) {
                                    console.error('Logout request failed:', e);
                                }
                                window.location.href = '/';
                            });
                        });
                    }

                    // Add settings button event listener
                    const settingsBtn = document.getElementById('settingsBtn');
                    if (settingsBtn) {
                        settingsBtn.addEventListener('click', () => {
                            // Close dropdown properly
                            userDropdown.classList.remove('visible');
                            userDropdown.classList.add('hidden');

                            // Hide overlay on mobile
                            if (isMobile() && dropdownOverlay) {
                                dropdownOverlay.classList.remove('visible');
                            }

                            // Move back to original parent on mobile
                            if (isMobile() && userDropdown.parentElement === document.body) {
                                userInfoSidebar.appendChild(userDropdown);
                            }

                            openSettingsModal();
                        });
                    }
                }
            } else {
                state.isLoggedIn = false;
                state.userId = null;
                state.isPro = false;

                // Fetch providers dynamically
                let loginHref = '#';
                let loginOnclick = '';
                try {
                    const provRes = await fetch('/api/auth/providers');
                    const providers = await provRes.json();
                    const pluginAuth = providers.find(p => p.type === 'plugin' && p.loginUrl);
                    const local = providers.find(p => p.type === 'local');
                    if (pluginAuth) {
                        loginHref = pluginAuth.loginUrl;
                    } else if (local) {
                        loginHref = '#';
                        loginOnclick = 'event.preventDefault(); window.openLocalLoginModal && window.openLocalLoginModal();';
                    }
                } catch (e) {
                    // fallback: no-op
                }

                userInfoSidebar.innerHTML = `
                    <a href="${loginHref}" class="btn-login-sidebar" id="sidebar-login-btn">
                        <i class="fa-solid fa-right-to-bracket"></i> ログイン
                    </a>
                `;
                const btn = document.getElementById('sidebar-login-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        if (loginOnclick && loginOnclick.includes('window.openLocalLoginModal')) {
                            e.preventDefault();
                            if (window.openLocalLoginModal) window.openLocalLoginModal();
                        }
                    });
                }
            }

        } catch (err) {
            console.error('Failed to check login status:', err);
        }
    }

    async function subscribePro() {
        const proUrl = (state.appConfig && state.appConfig.pro && state.appConfig.pro.upgradeUrl) ? state.appConfig.pro.upgradeUrl : '/pages/pro';
        showConfirmModal('Proプラン登録', `Proプランに登録しますか？\n<a href="${escapeHtml(proUrl)}" target="_blank" class="spa-link">詳しく</a>`, async () => {
            try {
                // Close dropdown
                document.getElementById('userDropdown').classList.remove('visible');

                const response = await fetch('/api/pro/subscribe', { method: 'POST' });
                const data = await response.json();

                // Wait for confirmation modal to close before showing alert
                setTimeout(() => {
                    if (data.success) {
                        showAlertModal('登録完了', 'Proプランへの登録が完了しました！');
                        checkLoginStatus(); // Refresh UI
                    } else {
                        showAlertModal('登録失敗', '' + (data.error || '不明なエラー'));
                    }
                }, 250); // Wait for modal close animation (200ms) + small buffer
            } catch (err) {
                console.error('Subscription error:', err);
                setTimeout(() => {
                    showAlertModal('エラー', 'エラーが発生しました。');
                }, 250);
            }
        });
    }

    async function cancelPro() {
        showConfirmModal('解約確認', '本当に解約しますか?\n解約すると即座にPro機能が利用できなくなります。', async () => {
            try {
                const userDropdownEl = document.getElementById('userDropdown');
                if (userDropdownEl) {
                    userDropdownEl.classList.remove('visible');
                }

                const response = await fetch('/api/pro/cancel', { method: 'POST' });
                const data = await response.json();

                // Wait for confirmation modal to close before showing alert
                setTimeout(async () => {
                    if (data.success) {
                        // Reset Pro settings on server
                        try {
                            await fetch('/api/user/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ pro_settings: { ...DEFAULT_PRO_SETTINGS } })
                            });
                        } catch (e) {
                            console.error('Failed to reset pro settings on server:', e);
                        }
                        // Clear Pro settings from localStorage
                        localStorage.removeItem(STORAGE_KEY_PRO_SETTINGS);
                        state.proSettings = { ...DEFAULT_PRO_SETTINGS };
                        applyTheme(DEFAULT_PRO_SETTINGS.theme); // Reset to default theme
                        showAlertModal('解約完了', '解約しました。Pro設定もリセットされました。');
                        checkLoginStatus(); // Refresh UI
                    } else {
                        showAlertModal('解約失敗', '解約に失敗しました: ' + (data.error || '不明なエラー'));
                    }
                }, 250); // Wait for modal close animation (200ms) + small buffer
            } catch (err) {
                console.error('Cancellation error:', err);
                setTimeout(() => {
                    showAlertModal('エラー', 'エラーが発生しました。');
                }, 250);
            }
        });
    }

    // Settings Modal Elements (Unified)
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveAppearanceBtn = document.getElementById('saveAppearanceBtn');
    const systemPromptInput = document.getElementById('systemPromptInput');
    const tempSlider = document.getElementById('tempSlider');
    const topPSlider = document.getElementById('topPSlider');
    const tempValue = document.getElementById('tempValue');
    const topPValue = document.getElementById('topPValue');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const exportChatBtn = document.getElementById('exportChatBtn');
    const settingsTabs = document.querySelectorAll('.settings-tab');
    const settingsPanels = document.querySelectorAll('.settings-panel');
    const modeBtns = document.querySelectorAll('#modeSelector .mode-btn');
    const proTabs = document.querySelectorAll('.settings-tab-pro');
    const settingsSidebar = document.getElementById('settingsSidebar');
    const settingsMenuToggle = document.getElementById('settingsMenuToggle');
    const settingsBackBtn = document.getElementById('settingsBackBtn');
    const customThemeSelect = document.getElementById('customThemeSelect');

    // Load available themes from json
    const loadAvailableThemes = async () => {
        try {
            const res = await fetch('/themes.json');
            if (res.ok) {
                state.availableThemes = await res.json();
                populateThemeSelect();
                // Apply the saved theme CSS now that we have the path
                if (state.proSettings && state.proSettings.customThemeId) {
                    applyCustomTheme(state.proSettings.customThemeId);
                }
            }
        } catch (e) {
            console.error('Failed to load themes.json', e);
        }
    };

    const populateThemeSelect = () => {
        if (!customThemeSelect || !state.availableThemes.length) return;
        customThemeSelect.innerHTML = '';
        state.availableThemes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.name;
            customThemeSelect.appendChild(option);
        });
        customThemeSelect.value = state.proSettings.customThemeId || 'default';
    };

    const applyCustomTheme = (themeId) => {
        const theme = state.availableThemes.find(t => t.id === themeId);
        let themeLink = document.getElementById('custom-theme-css');

        if (!theme || !theme.css || themeId === 'default') {
            if (themeLink) themeLink.remove();
            document.documentElement.removeAttribute('data-custom-theme');
            return;
        }

        if (!themeLink) {
            themeLink = document.createElement('link');
            themeLink.id = 'custom-theme-css';
            themeLink.rel = 'stylesheet';
            document.head.appendChild(themeLink);
        }
        themeLink.href = theme.css;
        document.documentElement.setAttribute('data-custom-theme', themeId);
    };

    loadAvailableThemes();



    // Load Pro Settings (accepts pre-fetched settings to avoid duplicate API calls)
    const loadProSettings = async (preloadedSettings = null) => {
        // First, try localStorage for immediate theme application (FOUC prevention)
        const stored = localStorage.getItem(STORAGE_KEY_PRO_SETTINGS);
        if (stored) {
            try {
                const settings = JSON.parse(stored);
                state.proSettings = { ...state.proSettings, ...settings };
                applyColorMode(state.proSettings.colorMode || 'system');
                applyTheme(state.proSettings.theme);
                if (state.proSettings.customThemeId) {
                    applyCustomTheme(state.proSettings.customThemeId);
                }
            } catch (e) {
                console.error('Failed to parse cached pro settings', e);
            }
        }

        // Then, if logged in, use pre-fetched or fetch from server
        if (state.isLoggedIn) {
            let serverSettings = preloadedSettings;
            if (!serverSettings) {
                try {
                    const response = await fetch('/api/user/settings');
                    serverSettings = await response.json();
                } catch (e) {
                    console.error('Failed to fetch pro settings from server:', e);
                    return;
                }
            }
            if (serverSettings && serverSettings.pro_settings) {
                state.proSettings = { ...state.proSettings, ...serverSettings.pro_settings };
                // Cache to localStorage for next page load
                localStorage.setItem(STORAGE_KEY_PRO_SETTINGS, JSON.stringify(state.proSettings));
                // Re-apply theme if different from cached
                applyColorMode(state.proSettings.colorMode || 'system');
                applyTheme(state.proSettings.theme);
            }
        }
    };

    const saveProSettings = async () => {
        // Always cache to localStorage for FOUC prevention
        localStorage.setItem(STORAGE_KEY_PRO_SETTINGS, JSON.stringify(state.proSettings));

        // Save to server for logged-in users
        if (state.isLoggedIn) {
            try {
                await fetch('/api/user/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pro_settings: state.proSettings })
                });
            } catch (e) {
                console.error('Failed to save pro settings to server:', e);
            }
        }
    };

    const applyColorMode = (mode) => {
        const root = document.documentElement;

        let effectiveMode = mode;
        if (mode === 'system') {
            // Check system preference
            effectiveMode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }

        if (effectiveMode === 'light') {
            root.setAttribute('data-theme', 'light');
        } else {
            root.removeAttribute('data-theme');
        }
        // Re-apply theme to get correct colors for the mode
        if (state.proSettings?.theme) {
            applyTheme(state.proSettings.theme);
        }
    };

    const applyTheme = (theme) => {
        const root = document.documentElement;
        const isLightMode = root.getAttribute('data-theme') === 'light';
        const mode = isLightMode ? 'light' : 'dark';

        // Use unified function to apply all CSS variables
        applyThemeVariables(theme, mode);
    };

    state.proSettings = { ...DEFAULT_PRO_SETTINGS };
    state.isPro = false; // Initialize isPro flag

    loadProSettings();

    // Listen for system color scheme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (state.proSettings.colorMode === 'system') {
            applyColorMode('system');
        }
    });

    // Settings Modal Logic
    const openSettingsModal = (initialTab = 'appearance') => {
        // Update mode buttons active state
        modeBtns.forEach(btn => {
            if (btn.dataset.mode === (state.proSettings.colorMode || 'system')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Populate Pro settings fields
        systemPromptInput.value = state.proSettings.systemPrompt;
        tempSlider.value = state.proSettings.temperature;
        topPSlider.value = state.proSettings.top_p;
        tempValue.textContent = state.proSettings.temperature;
        topPValue.textContent = state.proSettings.top_p;

        if (customThemeSelect) {
            customThemeSelect.value = state.proSettings.customThemeId || 'default';
        }

        // Active theme
        themeBtns.forEach(btn => {
            if (btn.dataset.theme === state.proSettings.theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Show/hide Pro tabs: only when app has Pro (config.pro) and user is Pro
        const hasPro = state.appConfig && state.appConfig.pro;
        proTabs.forEach(tab => {
            tab.style.display = hasPro && state.isPro ? '' : 'none';
        });

        // If requested tab is Pro-only and user is not Pro or no Pro plugin, fall back to appearance
        if ((!hasPro || !state.isPro) && (initialTab === 'ai' || initialTab === 'data')) {
            initialTab = 'appearance';
        }

        // Set initial tab
        settingsTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === initialTab);
        });
        settingsPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${initialTab}`);
        });

        settingsModal.classList.remove('hidden');
        settingsModal.classList.remove('content-active'); // Reset to list view on mobile
    };

    // Tab switching
    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            settingsTabs.forEach(t => t.classList.remove('active'));
            settingsPanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${targetTab}`).classList.add('active');

            // Toggle view state on mobile (CSS handles the slide animation)
            if (window.innerWidth <= 600) {
                settingsModal.classList.add('content-active');
            }
        });
    });

    if (settingsBackBtn) {
        settingsBackBtn.addEventListener('click', () => {
            settingsModal.classList.remove('content-active');
        });
    }

    // Developer tab: Open embedded sites management
    const openEmbeddedSitesBtn = document.getElementById('openEmbeddedSitesBtn');
    if (openEmbeddedSitesBtn) {
        openEmbeddedSitesBtn.addEventListener('click', () => {
            window.open('/pages/embedded-sites');
        });
    }

    // Settings menu toggle for mobile
    settingsMenuToggle.addEventListener('click', () => {
        settingsSidebar.classList.toggle('open');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsSidebar.classList.remove('open');
        closeModal(settingsModal);
    });

    // 保存ボタン（外観タブとAI設定両方で使用）
    saveAppearanceBtn.addEventListener('click', async () => {
        // AI設定も保存（Pro用）
        if (state.isPro && state.proSettings) {
            state.proSettings.systemPrompt = systemPromptInput.value;
            state.proSettings.temperature = parseFloat(tempSlider.value);
            state.proSettings.top_p = parseFloat(topPSlider.value);
        }

        // 外観設定は全ログインユーザーで保存
        if (state.isLoggedIn) {
            await saveProSettings();
        }

        closeModal(settingsModal);
    });

    tempSlider.addEventListener('input', (e) => {
        tempValue.textContent = e.target.value;
    });

    // Auto-save temperature when slider is released
    tempSlider.addEventListener('change', async (e) => {
        if (state.isPro && state.proSettings) {
            state.proSettings.temperature = parseFloat(e.target.value);
            await saveProSettings();
        }
    });

    topPSlider.addEventListener('input', (e) => {
        topPValue.textContent = e.target.value;
    });

    // Auto-save top_p when slider is released
    topPSlider.addEventListener('change', async (e) => {
        if (state.isPro && state.proSettings) {
            state.proSettings.top_p = parseFloat(e.target.value);
            await saveProSettings();
        }
    });

    // Auto-save system prompt when textarea loses focus
    systemPromptInput.addEventListener('blur', async () => {
        if (state.isPro && state.proSettings) {
            state.proSettings.systemPrompt = systemPromptInput.value;
            await saveProSettings();
        }
    });

    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const theme = btn.dataset.theme;
            state.proSettings.theme = theme;
            saveProSettings(); // Auto-save when theme changes
            applyTheme(theme);
        });
    });

    // Color mode buttons
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            state.proSettings.colorMode = mode;
            saveProSettings(); // Auto-save when mode changes
            applyColorMode(mode);
        });
    });

    if (customThemeSelect) {
        customThemeSelect.addEventListener('change', (e) => {
            const themeId = e.target.value;
            state.proSettings.customThemeId = themeId;
            saveProSettings();
            applyCustomTheme(themeId);
        });
    }

    exportChatBtn.addEventListener('click', () => {
        if (!state.currentSessionId) {
            showAlertModal('エクスポートエラー', 'エクスポートするチャットが開かれていません。');
            return;
        }

        // Fetch full history for export (or use what's in DOM if simple)
        // For better accuracy, we should probably fetch from server or use what we have loaded
        // Let's iterate over DOM for WYSIWYG export
        let md = `# Chat Export - ${new Date().toLocaleString()}\n\n`;

        const messages = messagesList.querySelectorAll('.message');
        messages.forEach(msg => {
            const isUser = msg.classList.contains('user-message');
            const content = msg.querySelector('.message-content').innerText; // Use innerText to preserve newlines

            md += `### ${isUser ? 'User' : 'AI'}\n${content}\n\n`;
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kai-chat-${state.currentSessionId}.md`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Suggestion Cards (delegation: cards are rendered from /api/app/config)
    if (suggestionCards) {
        suggestionCards.addEventListener('click', (e) => {
            const card = e.target.closest('.suggestion-card');
            if (!card || !card.dataset.prompt) return;
            questionInput.value = card.dataset.prompt;
            questionInput.dispatchEvent(new Event('input'));
            submitBtn.click();
        });
    }

    // Suggestion More Button (dropdown toggle) - only if dropdown exists
    const suggestionMoreBtn = document.getElementById('suggestionMoreBtn');
    const suggestionDropdown = document.getElementById('suggestionDropdown');

    if (suggestionMoreBtn && suggestionDropdown) {
        suggestionMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            suggestionDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!suggestionDropdown.contains(e.target) && e.target !== suggestionMoreBtn) {
                suggestionDropdown.classList.add('hidden');
            }
        });

        suggestionDropdown.addEventListener('click', (e) => {
            const card = e.target.closest('.suggestion-card');
            if (!card || !card.dataset.prompt) return;
            suggestionDropdown.classList.add('hidden');
            questionInput.value = card.dataset.prompt;
            questionInput.dispatchEvent(new Event('input'));
            submitBtn.click();
        });
    }

    // ============== Voice Recognition & Synthesis ==============
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    const voiceAutoPlayCheckbox = document.getElementById('voiceAutoPlayCheckbox');

    let recognition = null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Check VOICEVOX availability
    const checkVoiceAvailability = async () => {
        try {
            const response = await fetch('/api/voice/status');
            const data = await response.json();
            state.voiceSettings.available = data.available || false;

            if (state.voiceSettings.available) {
                document.querySelectorAll('.voice-play-btn').forEach(btn => {
                    btn.style.display = '';
                });
            }

            return state.voiceSettings.available;
        } catch (error) {
            console.error('Voice availability check failed:', error);
            state.voiceSettings.available = false;
            return false;
        }
    };

    // Initialize voice recognition
    if (SpeechRecognition && voiceInputBtn) {
        recognition = new SpeechRecognition();
        recognition.lang = VOICE_RECOGNITION_LANG;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = VOICE_MAX_ALTERNATIVES;

        recognition.onstart = () => {
            state.isRecording = true;
            voiceInputBtn.classList.add('recording');
            voiceInputBtn.querySelector('i').classList.remove('fa-microphone');
            voiceInputBtn.querySelector('i').classList.add('fa-microphone-slash');

            if (isVoiceModalOpen && voiceStatusText && !isVoicePaused) {
                voiceStatusText.textContent = '聞いています...';
            }
        };

        recognition.onresult = (event) => {
            const results = event.results;
            const lastResult = results[results.length - 1];
            const transcript = lastResult[0].transcript;
            const isFinal = lastResult.isFinal;

            if (isVoiceModalOpen) {
                voiceTranscriptText.textContent = transcript;
            }

            questionInput.value = transcript;
            questionInput.dispatchEvent(new Event('input'));

            if (isFinal && transcript.trim().length > 0) {
                if (isVoiceModalOpen && recognition && state.isRecording) {
                    try {
                        recognition.stop();
                        console.log('Microphone stopped after final recognition result');
                    } catch (error) {
                        console.log('Failed to stop microphone after final result:', error.message);
                    }
                }

                setTimeout(() => {
                    if (submitBtn && !submitBtn.disabled) {
                        submitBtn.click();
                        if (isVoiceModalOpen) {
                            voiceTranscriptText.textContent = '';
                        }
                    }
                }, 500);
            }
        };

        recognition.onerror = (event) => {
            state.isRecording = false;
            voiceInputBtn.classList.remove('recording');
            voiceInputBtn.querySelector('i').classList.remove('fa-microphone-slash');
            voiceInputBtn.querySelector('i').classList.add('fa-microphone');

            if (event.error === 'not-allowed') {
                showError('マイクへのアクセスが拒否されました', 'ブラウザの設定でマイクの使用を許可してください。');
            }
        };

        recognition.onend = () => {
            state.isRecording = false;
            voiceInputBtn.classList.remove('recording');
            voiceInputBtn.querySelector('i').classList.remove('fa-microphone-slash');
            voiceInputBtn.querySelector('i').classList.add('fa-microphone');

            if (isVoiceModalOpen && voiceStatusText) {
                if (!isVoicePaused) {
                    voiceStatusText.textContent = '待機中...';
                }
            }

            // 🔧 改善: より厳密な条件チェック
            const isSpeaking = isVoiceModalOpen && voiceConversationModal && voiceConversationModal.classList.contains('speaking');

            // デバッグ情報を詳細に出力
            const skipConditions = {
                continuousMode: state.voiceSettings.continuousMode,
                isLoading: state.isLoading,
                hasAudio: !!state.currentAudio,
                queueLength: state.voiceQueue.length,
                isProcessing: state.isProcessingVoice,
                isSpeaking: isSpeaking,
                isPaused: isVoiceModalOpen && isVoicePaused
            };

            // 🔧 重要: isProcessingVoiceを最優先でチェック
            if (state.isProcessingVoice) {
                console.log('[Recognition] Auto-restart BLOCKED by isProcessingVoice flag');
                return;
            }

            // その他の条件チェック
            if (!state.voiceSettings.continuousMode ||
                state.isLoading ||
                state.currentAudio ||
                state.voiceQueue.length > 0 ||
                isSpeaking ||
                (isVoiceModalOpen && isVoicePaused)) {
                console.log('[Recognition] Auto-restart skipped:', skipConditions);
                return;
            }

            // 通常の自動再開
            if (!isVoiceModalOpen) {
                setTimeout(() => {
                    try {
                        recognition.start();
                        console.log('[Recognition] Auto-restart successful (normal mode)');
                    } catch (error) {
                        console.log('[Recognition] Auto-restart failed:', error.message);
                    }
                }, 100);
            }
        };

        voiceInputBtn.addEventListener('click', () => {
            openVoiceConversationModal();
        });
    }

    // Voice Conversation Modal
    const voiceConversationModal = document.getElementById('voiceConversationModal');
    const voicePauseResumeBtn = document.getElementById('voicePauseResumeBtn');
    const voiceEndBtn = document.getElementById('voiceEndBtn');
    const voiceTranscriptText = document.getElementById('voiceTranscriptText');
    const voiceStatusText = document.querySelector('.voice-status-text');
    const voiceWavePath = document.querySelector('.voice-wave-path');

    let isVoiceModalOpen = false;
    let isVoicePaused = false;
    let waveAnimationId = null;

    // 波のパスの元のd属性（上部の制御点だけを動かす用）
    const originalWavePath = 'M205.71102,230.28897c-8.83655,0 -16,-7.16345 -16,-16l1.11505,-26.20586c0,-2.3158 8.37697,10.24616 18.43627,9.79972c8.71248,-0.38667 11.57639,-11.74732 22.48322,-12.89842c7.58908,-0.80095 10.39974,9.80483 18.98111,10.80036c7.78981,0.9037 9.50589,-6.22704 23.62834,-8.60211c8.16178,-1.37262 15.71095,5.51526 15.71095,7.36777l0.22301,19.73855c0,8.83655 -7.16345,16 -16,16z';

    // 波のアニメーション関数（上部の制御点だけを動かす）
    const animateWave = () => {
        if (!voiceWavePath) {
            return;
        }

        const startTime = performance.now();
        const duration = 1500; // 1.5秒
        const amplitude = 1.8; // 動かす距離（ピクセル）

        const animate = (currentTime) => {
            if (!voiceWavePath) {
                waveAnimationId = null;
                return;
            }

            // speaking状態でない、またはpaused状態、またはhidden状態の場合は停止
            const isSpeaking = voiceConversationModal.classList.contains('speaking');
            const isPaused = voiceConversationModal.classList.contains('paused');
            const isHidden = voiceConversationModal.classList.contains('hidden');
            if (!isSpeaking || isPaused || isHidden) {
                waveAnimationId = null;
                return;
            }

            const elapsed = (currentTime - startTime) % duration;
            const progress = elapsed / duration;
            // ease-in-out波形
            const ease = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            // 上部の制御点のY座標を動かす
            const offset = Math.sin(ease * Math.PI * 2) * amplitude;

            // 波のパスの上部の複数の制御点を動かす（波の形状を保つため）
            // l1.11505,-26.20586 の部分と、その後の曲線制御点も動かす
            let newPath = originalWavePath;

            // 上部の点を動かす（l1.11505,-26.20586）
            newPath = newPath.replace(
                /l1\.11505,-26\.20586/,
                `l1.11505,${-26.20586 + offset}`
            );

            // その後の曲線制御点も少し動かす（波の形状を保つため）
            // c0,-2.3158 の部分のY座標も動かす
            newPath = newPath.replace(
                /c0,-2\.3158/,
                `c0,${-2.3158 + offset * 0.3}`
            );

            voiceWavePath.setAttribute('d', newPath);
            waveAnimationId = requestAnimationFrame(animate);
        };

        waveAnimationId = requestAnimationFrame(animate);
    };

    // 波のアニメーションを停止
    const stopWaveAnimation = () => {
        if (waveAnimationId) {
            cancelAnimationFrame(waveAnimationId);
            waveAnimationId = null;
        }
        if (voiceWavePath) {
            voiceWavePath.setAttribute('d', originalWavePath);
        }
    };

    // speaking状態の変更を監視してアニメーションを制御
    const updateWaveAnimation = () => {
        if (!voiceConversationModal || !voiceWavePath) return;

        const isSpeaking = voiceConversationModal.classList.contains('speaking');
        const isPaused = voiceConversationModal.classList.contains('paused');
        const isHidden = voiceConversationModal.classList.contains('hidden');

        // 話しているとき（speaking）のみアニメーションON
        // 待機中（聞いているとき）、一時停止中、非表示のときはアニメーションOFF
        if (isHidden || isPaused || !isSpeaking) {
            stopWaveAnimation();
        } else {
            // 話しているときのみアニメーション開始
            if (!waveAnimationId) {
                animateWave();
            }
        }
    };

    const openVoiceConversationModal = () => {
        if (!recognition) {
            showError('音声認識が利用できません', null, 'OK');
            return;
        }

        isVoiceModalOpen = true;
        isVoicePaused = false;
        voiceConversationModal.classList.remove('hidden');
        voiceConversationModal.classList.remove('speaking');
        voiceTranscriptText.textContent = '';
        voiceStatusText.textContent = '聞いています...';

        // 音声ボタンを非表示（通話モードが開いているため）
        if (voiceInputBtn) {
            voiceInputBtn.classList.add('hidden');
        }

        // 波のアニメーションを開始（待機中のみ）
        animateWave();

        // Start recognition
        // Use a small delay to avoid Android sound issue
        setTimeout(() => {
            try {
                recognition.start();
                state.voiceSettings.continuousMode = true;
            } catch (error) {
                console.error('Failed to start recognition:', error);
            }
        }, 100);
    };

    const closeVoiceConversationModal = () => {
        isVoiceModalOpen = false;
        voiceConversationModal.classList.add('hidden');

        // 波のアニメーションを停止
        stopWaveAnimation();

        // Stop recognition
        if (state.isRecording) {
            recognition.stop();
        }
        state.voiceSettings.continuousMode = false;

        // Reset button state
        isVoicePaused = false;
        voicePauseResumeBtn.classList.remove('resumed');
        voicePauseResumeBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';

        // 音声ボタンを表示（通話モードが閉じたため）
        if (voiceInputBtn) {
            voiceInputBtn.classList.remove('hidden');
        }
    };

    const toggleVoicePause = () => {
        if (isVoicePaused) {
            isVoicePaused = false;
            voiceConversationModal.classList.remove('paused');
            voicePauseResumeBtn.classList.remove('resumed');
            voicePauseResumeBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';

            voiceStatusText.textContent = '聞いています...';

            // 波のアニメーションを更新
            updateWaveAnimation();

            setTimeout(() => {
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Failed to resume recognition:', error);
                }
            }, 100);
        } else {
            isVoicePaused = true;
            voiceConversationModal.classList.add('paused');
            voicePauseResumeBtn.classList.add('resumed');
            voicePauseResumeBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            voiceStatusText.textContent = '一時停止中';

            // 波のアニメーションを停止
            stopWaveAnimation();

            if (state.isRecording) {
                recognition.stop();
            }
        };
    };

    if (voicePauseResumeBtn) {
        voicePauseResumeBtn.addEventListener('click', toggleVoicePause);
    }

    if (voiceEndBtn) {
        voiceEndBtn.addEventListener('click', closeVoiceConversationModal);
    }

    // Update recognition handlers to work with modal
    if (recognition) {
        const originalOnResult = recognition.onresult;
        recognition.onresult = (event) => {
            const results = event.results;
            const lastResult = results[results.length - 1];
            const transcript = lastResult[0].transcript;
            const isFinal = lastResult.isFinal;

            // Update modal transcript if open
            if (isVoiceModalOpen) {
                voiceTranscriptText.textContent = transcript;
            }

            // Update input field
            questionInput.value = transcript;
            questionInput.dispatchEvent(new Event('input'));

            if (isFinal && transcript.trim().length > 0) {
                // Stop microphone immediately after final result to prevent feedback
                if (isVoiceModalOpen && recognition && state.isRecording) {
                    try {
                        recognition.stop();
                        console.log('Microphone stopped after final recognition result');
                    } catch (error) {
                        console.log('Failed to stop microphone after final result:', error.message);
                    }
                }

                setTimeout(() => {
                    if (submitBtn && !submitBtn.disabled) {
                        submitBtn.click();
                        // Clear transcript after submission
                        if (isVoiceModalOpen) {
                            voiceTranscriptText.textContent = '';
                        }
                    }
                }, 500);
            }
        };
    }

    // Voice synthesis function
    const synthesizeAndPlayVoice = async (text, shouldRestartMic = true) => {
        if (!state.voiceSettings.available || !text) {
            console.log('Voice not available or no text:', { available: state.voiceSettings.available, text });
            return null;
        }

        try {
            // 既存の音声を停止
            if (state.currentAudio) {
                state.currentAudio.pause();
                state.currentAudio = null;
            }

            console.log('[Voice Synth] Starting synthesis, shouldRestartMic:', shouldRestartMic);

            const response = await fetch('/api/voice/synthesize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text.substring(0, 150),
                    speaker: state.voiceSettings.speaker
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Voice synthesis failed:', response.status, errorText);
                throw new Error('Voice synthesis failed');
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // 単独再生時のみマイクを停止（キュー処理時は既に停止済み）
            if (shouldRestartMic && isVoiceModalOpen && recognition && state.isRecording && !isVoicePaused) {
                try {
                    recognition.stop();
                    console.log('[Voice Synth] Microphone stopped (single play mode)');
                } catch (error) {
                    console.log('[Voice Synth] Failed to stop microphone:', error.message);
                }
            }

            // 単独再生時のみspeaking状態にする
            if (shouldRestartMic && isVoiceModalOpen && voiceConversationModal) {
                voiceConversationModal.classList.add('speaking');
                if (voiceStatusText) {
                    voiceStatusText.textContent = 'AI応答中...';
                }
                updateWaveAnimation();
            }

            const cleanupAndRestart = () => {
                URL.revokeObjectURL(audioUrl);
                state.currentAudio = null;
                console.log('[Voice Synth] Audio cleanup complete, shouldRestartMic:', shouldRestartMic);

                // 🔧 重要: キュー処理中（shouldRestartMic=false）は何もしない
                if (!shouldRestartMic) {
                    console.log('[Voice Synth] Skipping mic restart (queue mode)');
                    return;
                }

                // 単独再生モードの場合のみ、マイク再開とUI復元
                if (isVoiceModalOpen) {
                    if (voiceConversationModal) {
                        voiceConversationModal.classList.remove('speaking');
                        updateWaveAnimation();
                    }

                    if (voiceStatusText && !isVoicePaused) {
                        voiceStatusText.textContent = '待機中...';
                    }

                    if (recognition && !isVoicePaused && state.voiceSettings.continuousMode) {
                        setTimeout(() => {
                            try {
                                // 🔧 追加: isLoadingとisProcessingVoiceもチェック
                                if (!state.isRecording && !state.isLoading && !state.isProcessingVoice) {
                                    console.log('[Voice Synth] Restarting microphone (single play mode)');
                                    recognition.start();
                                } else {
                                    console.log('[Voice Synth] Mic restart skipped:', {
                                        isRecording: state.isRecording,
                                        isLoading: state.isLoading,
                                        isProcessing: state.isProcessingVoice
                                    });
                                }
                            } catch (error) {
                                console.log('[Voice Synth] Failed to restart microphone:', error.message);
                            }
                        }, 100);
                    }
                }
            };

            // 再生終了を待つPromise
            const playbackPromise = new Promise((resolve, reject) => {
                audio.onended = () => {
                    console.log('[Voice Synth] Audio playback ended');
                    cleanupAndRestart();
                    resolve();
                };

                audio.onerror = (e) => {
                    console.error('[Voice Synth] Audio playback error:', e, audio.error);
                    cleanupAndRestart();
                    reject(e);
                };
            });

            await audio.play();
            console.log('[Voice Synth] Audio playback started');
            state.currentAudio = audio;

            await playbackPromise;
            return audio;

        } catch (error) {
            console.error('[Voice Synth] Error:', error);

            // エラー時のクリーンアップ（単独再生モードのみ）
            if (shouldRestartMic && isVoiceModalOpen) {
                if (voiceConversationModal) {
                    voiceConversationModal.classList.remove('speaking');
                    updateWaveAnimation();
                }

                if (voiceStatusText && !isVoicePaused) {
                    voiceStatusText.textContent = '待機中...';
                }

                if (recognition && !isVoicePaused && state.voiceSettings.continuousMode) {
                    setTimeout(() => {
                        try {
                            if (!state.isRecording && !state.isLoading && !state.isProcessingVoice) {
                                recognition.start();
                            }
                        } catch (error) {
                            console.log('[Voice Synth] Failed to restart microphone after error:', error.message);
                        }
                    }, 100);
                }
            }

            return null;
        }
    };

    // Add voice play button handlers
    const addVoicePlayHandler = (messageElement, text) => {
        if (!state.voiceSettings.available) return;

        const voicePlayBtn = messageElement.querySelector('.voice-play-btn');
        if (!voicePlayBtn) return;

        voicePlayBtn.style.display = '';

        voicePlayBtn.addEventListener('click', async () => {
            const icon = voicePlayBtn.querySelector('i');

            if (state.currentAudio && voicePlayBtn.classList.contains('playing')) {
                state.currentAudio.pause();
                state.currentAudio = null;
                voicePlayBtn.classList.remove('playing');
                icon.classList.remove('fa-stop');
                icon.classList.add('fa-volume-high');
                return;
            }

            voicePlayBtn.classList.add('playing');
            icon.classList.remove('fa-volume-high');
            icon.classList.add('fa-stop');

            const audio = await synthesizeAndPlayVoice(text);

            if (audio) {
                audio.onended = () => {
                    voicePlayBtn.classList.remove('playing');
                    icon.classList.remove('fa-stop');
                    icon.classList.add('fa-volume-high');
                };
            } else {
                voicePlayBtn.classList.remove('playing');
                icon.classList.remove('fa-stop');
                icon.classList.add('fa-volume-high');
            }
        });
    };

    // Voice auto-play setting
    if (voiceAutoPlayCheckbox) {
        voiceAutoPlayCheckbox.checked = state.voiceSettings.autoPlay;
        voiceAutoPlayCheckbox.addEventListener('change', (e) => {
            state.voiceSettings.autoPlay = e.target.checked;
            localStorage.setItem('kai_voice_autoplay', e.target.checked);
        });

        const savedAutoPlay = localStorage.getItem('kai_voice_autoplay');
        if (savedAutoPlay !== null) {
            state.voiceSettings.autoPlay = savedAutoPlay === 'true';
            voiceAutoPlayCheckbox.checked = state.voiceSettings.autoPlay;
        }
    }



    // 初回の通知ロード（1ページ目のみ）
    checkSystemStatus(questionInput);
    checkVoiceAvailability();

    // History and route init run inside scheduleLazyInit after lazy modules load.

    // --- Local Auth Modal Logic ---
    (function () {
        const modal = document.getElementById('localAuthModal');
        const closeBtn = document.getElementById('closeLocalAuthModalBtn');
        const titleEl = document.getElementById('localAuthModalTitle');
        const errorEl = document.getElementById('localAuthError');
        const usernameInput = document.getElementById('localAuthUsername');
        const emailInput = document.getElementById('localAuthEmail');
        const emailGroup = document.getElementById('localAuthEmailGroup');
        const passwordInput = document.getElementById('localAuthPassword');
        const passwordConfirmGroup = document.getElementById('localAuthPasswordConfirmGroup');
        const passwordConfirmInput = document.getElementById('localAuthPasswordConfirm');
        const submitBtn = document.getElementById('localAuthSubmitBtn');
        const toggleBtn = document.getElementById('localAuthToggleBtn');

        if (!modal) return;

        let isRegisterMode = false;

        const setMode = (register) => {
            isRegisterMode = register;
            if (register) {
                titleEl.innerHTML = '<i class="fa-solid fa-user-plus"></i> 新規登録';
                submitBtn.textContent = '登録';
                toggleBtn.textContent = 'ログインに戻る';
                emailGroup.style.display = '';
                passwordConfirmGroup.style.display = '';
            } else {
                titleEl.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> ログイン';
                submitBtn.textContent = 'ログイン';
                toggleBtn.textContent = 'アカウントを作成';
                emailGroup.style.display = 'none';
                passwordConfirmGroup.style.display = 'none';
            }
            errorEl.classList.add('hidden');
            errorEl.textContent = '';
        };

        window.openLocalLoginModal = (register = false) => {
            if (!modal) return;
            setMode(register);
            usernameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';
            if (passwordConfirmInput) passwordConfirmInput.value = '';
            modal.classList.remove('hidden');
            setTimeout(() => usernameInput.focus(), 50);
        };

        closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

        toggleBtn?.addEventListener('click', () => setMode(!isRegisterMode));

        submitBtn?.addEventListener('click', async () => {
            errorEl.classList.add('hidden');
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            if (!username || !password) {
                errorEl.textContent = 'ユーザー名とパスワードを入力してください。';
                errorEl.classList.remove('hidden');
                return;
            }

            if (isRegisterMode) {
                const confirm = passwordConfirmInput?.value;
                if (password !== confirm) {
                    errorEl.textContent = 'パスワードが一致しません。';
                    errorEl.classList.remove('hidden');
                    return;
                }
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '処理中...';

            try {
                const endpoint = isRegisterMode ? '/auth/local/register' : '/auth/local/login';
                const body = isRegisterMode
                    ? { username, password, email: emailInput?.value.trim() || undefined }
                    : { username, password };

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    modal.classList.add('hidden');
                    window.location.reload();
                } else {
                    errorEl.textContent = data.error || (isRegisterMode ? '登録に失敗しました。' : 'ログインに失敗しました。');
                    errorEl.classList.remove('hidden');
                }
            } catch (e) {
                errorEl.textContent = 'エラーが発生しました。';
                errorEl.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                setMode(isRegisterMode);
            }
        });

        // Enter key trigger
        [usernameInput, emailInput, passwordInput, passwordConfirmInput].forEach(el => {
            el?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBtn?.click(); });
        });
    })();



    // Check for upgrade parameter in URL
    const urlParamsForUpgrade = new URLSearchParams(window.location.search);
    if (urlParamsForUpgrade.get('upgrade') === 'pro') {
        // Wait for login status to be checked, then show upgrade popup
        setTimeout(() => {
            if (state.isPro) {
                showAlertModal('登録済み', '既にProプランに登録済みです。');
            } else {
                // Check if user is logged in
                fetch('/api/user/me')
                    .then(res => res.json())
                    .then(data => {
                        if (data.loggedIn) {
                            subscribePro();
                        } else {
                            showAlertModal('ログインが必要', 'Proプランに登録するにはログインが必要です。');
                        }
                    });
            }
            // Remove the parameter from URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 500);
    }

    if (questionInput) questionInput.focus();
    if (questionInput) questionInput.focus();

    // ============== Clipboard Paste for Images ==============
    document.addEventListener('paste', async (e) => {
        // Only handle paste if question input is focused
        if (document.activeElement !== questionInput) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    handleImageSelection(file);
                }
                break;
            }
        }
    });

    // ============== Collapsible Sections ==============
    const setupCollapsibleSections = () => {
        const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking on a button inside the header
                if (e.target.closest('button') && !e.target.closest('.btn-collapse')) return;

                const section = header.closest('.collapsible-section');
                const sectionName = header.dataset.section;

                if (section) {
                    section.classList.toggle('collapsed');

                    // Save state to localStorage
                    const isCollapsed = section.classList.contains('collapsed');
                    state.collapsedSections[sectionName] = isCollapsed;
                    try {
                        localStorage.setItem('collapsedSections', JSON.stringify(state.collapsedSections));
                    } catch (e) {
                        console.warn('Failed to save collapsed state:', e);
                    }
                }
            });
        });

        // Restore collapsed state from localStorage
        try {
            const saved = localStorage.getItem('collapsedSections');
            if (saved) {
                state.collapsedSections = JSON.parse(saved);
                Object.entries(state.collapsedSections).forEach(([sectionName, isCollapsed]) => {
                    if (isCollapsed) {
                        const header = document.querySelector(`.collapsible-header[data-section="${sectionName}"]`);
                        const section = header?.closest('.collapsible-section');
                        if (section) {
                            section.classList.add('collapsed');
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('Failed to restore collapsed state:', e);
        }
    };









    // ============== Feedback Reason Modal ==============
    const showFeedbackReasonModal = (type, requestId, sessionId, messageId) => {
        const modal = document.getElementById('feedbackReasonModal');
        const reasonText = document.getElementById('feedbackReasonText');
        const tagsList = document.getElementById('feedbackTagsList');
        const skipBtn = document.getElementById('skipFeedbackBtn');
        const submitBtn = document.getElementById('submitFeedbackBtn');
        const closeBtn = document.getElementById('closeFeedbackReasonBtn');

        if (!modal) return;

        const feedbackTags = type === 'good'
            ? ['正確', '詳しい', '簡潔', '分かりやすい']
            : ['不正確', '不十分', '冗長', '分かりにくい'];

        const selectedTags = [];
        tagsList.innerHTML = '';
        feedbackTags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = 'feedback-tag';
            tagEl.textContent = tag;
            tagEl.addEventListener('click', () => {
                if (selectedTags.includes(tag)) {
                    selectedTags.splice(selectedTags.indexOf(tag), 1);
                    tagEl.classList.remove('selected');
                } else {
                    selectedTags.push(tag);
                    tagEl.classList.add('selected');
                }
            });
            tagsList.appendChild(tagEl);
        });

        const updateFeedbackUI = () => {
            // Find by messageId or metadata search
            const containers = document.querySelectorAll(
                `.message[data-message-id="${messageId}"], .message[data-request-id="${requestId}"], .message[data-metadata*='"id":"${requestId}"']`
            );

            containers.forEach(container => {
                const buttons = container.querySelectorAll('.feedback-btn');
                buttons.forEach(b => b.classList.remove('active'));
                const activeBtn = Array.from(buttons).find(b => b.dataset.type === type);
                if (activeBtn) activeBtn.classList.add('active');
            });
        };

        const sendFeedback = async (includeReason) => {
            try {
                const payload = { requestId, type, sessionId, messageId };
                if (includeReason) {
                    payload.reason = reasonText.value.trim();
                    payload.reasonTags = selectedTags;
                }
                await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                updateFeedbackUI();
                closeModal(modal);
                reasonText.value = '';
            } catch (error) {
                console.error('Feedback error:', error);
            }
        };

        skipBtn.onclick = () => sendFeedback(false);
        submitBtn.onclick = () => sendFeedback(true);
        closeBtn.onclick = () => { closeModal(modal); reasonText.value = ''; };
        modal.classList.remove('hidden');
    };

    // ============== Regenerate Response ==============
    const regenerateResponse = async (messageDiv) => {
        const messages = Array.from(messagesList.children);
        const aiMsgIndex = messages.indexOf(messageDiv);
        if (aiMsgIndex <= 0) return;
        let userMessage = null;
        for (let i = aiMsgIndex - 1; i >= 0; i--) {
            if (messages[i].classList.contains('user-message')) {
                userMessage = messages[i];
                break;
            }
        }
        if (!userMessage) return;
        const userContent = userMessage.querySelector('.message-content');
        if (!userContent) return;
        const question = userContent.textContent.trim();
        const timestamp = messageDiv.dataset.metadata ? JSON.parse(messageDiv.dataset.metadata).timestamp : null;

        if (timestamp && state.currentSessionId) {
            try {
                await fetch(`/api/session/${state.currentSessionId}/truncate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ timestamp })
                });
                for (let i = aiMsgIndex; i < messages.length; i++) messages[i].remove();
                questionInput.value = question;
                await submitQuestion();
            } catch (error) {
                console.error('Regenerate error:', error);
                showAlert('エラー', '再生成に失敗しました');
            }
        }
    };

    // ============== Initialize New Features ==============
    setupCollapsibleSections();

    // --- Shared Session Dropdown Logic ---
    const sessionMenuDropdown = document.getElementById('sessionMenuDropdown');

    const openSessionDropdown = (sessionId, anchorBtn, isPinned, tags = [], currentTitle = '') => {
        if (!sessionMenuDropdown) return;

        sessionMenuDropdown.innerHTML = `
            <button class="dropdown-item history-pin-item">
                <i class="fa-solid fa-thumbtack"></i> ${isPinned ? 'ピン止め解除' : 'ピン止め'}
            </button>
            <button class="dropdown-item history-rename-item">
                <i class="fa-solid fa-pen"></i> 名前変更
            </button>
            <button class="dropdown-item history-tags-item">
                <i class="fa-solid fa-tags"></i> タグ設定
            </button>
            <button class="dropdown-item history-share-item">
                <i class="fa-solid fa-share-nodes"></i> 共有
            </button>
            <button class="dropdown-item history-delete-item">
                <i class="fa-solid fa-trash-can"></i> 削除
            </button>
        `;

        // Handle Pin
        sessionMenuDropdown.querySelector('.history-pin-item').onclick = async (e) => {
            e.stopPropagation();
            closeDropdown(sessionMenuDropdown);
            await togglePinChat(sessionId, isPinned);
        };

        // Handle Rename
        sessionMenuDropdown.querySelector('.history-rename-item').onclick = (e) => {
            e.stopPropagation();
            closeDropdown(sessionMenuDropdown);
            openRenameModal(sessionId, currentTitle || (chatTitle ? chatTitle.textContent : ''));
        };

        // Handle Tags
        sessionMenuDropdown.querySelector('.history-tags-item').onclick = (e) => {
            e.stopPropagation();
            closeDropdown(sessionMenuDropdown);
            showTagManagementModal(sessionId, tags);
        };

        // Handle Share
        sessionMenuDropdown.querySelector('.history-share-item').onclick = (e) => {
            e.stopPropagation();
            closeDropdown(sessionMenuDropdown);
            openShareModal(sessionId);
        };

        // Handle Delete
        sessionMenuDropdown.querySelector('.history-delete-item').onclick = (e) => {
            e.stopPropagation();
            closeDropdown(sessionMenuDropdown);
            confirmDeleteChat(sessionId);
        };

        // Toggle visibility
        const isHidden = sessionMenuDropdown.classList.contains('hidden');
        if (!isHidden) {
            closeDropdown(sessionMenuDropdown);
            return;
        }

        // Close all other dropdowns
        document.querySelectorAll('.dropdown').forEach(d => {
            if (d !== sessionMenuDropdown) d.classList.add('hidden');
        });

        sessionMenuDropdown.classList.remove('hidden');

        // Show/hide overlay on mobile
        if (isMobile() && dropdownOverlay) {
            dropdownOverlay.classList.add('visible');
        }

        // Position dropdown
        if (!isMobile()) {
            const rect = anchorBtn.getBoundingClientRect();
            positionDropdown(sessionMenuDropdown, rect);
        }
    };

    // Header Menu (Session actions + Tags)
    const setupHeaderMenu = (btn) => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.currentSessionId) return;
            openSessionDropdown(state.currentSessionId, btn, state.isPinned, state.currentChatTags, chatTitle ? chatTitle.textContent : '');
        });
    };

    setupHeaderMenu(desktopHeaderMenuBtn);
    setupHeaderMenu(mobileHeaderMenuBtn);

    // Also mobile title clicks should open the menu
    const mobileChatTitle = document.getElementById('mobileChatTitle');
    if (mobileChatTitle) {
        mobileChatTitle.addEventListener('click', (e) => {
            if (isMobile() && state.currentSessionId && state.isOwner) {
                e.stopPropagation();
                openSessionDropdown(state.currentSessionId, mobileHeaderMenuBtn, state.isPinned, state.currentChatTags, mobileChatTitle.textContent);
            }
        });
    }

    const tagDropdown = document.getElementById('tagDropdown');
    if (tagDropdown) {
        // Close tag dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!tagDropdown.contains(e.target) && (!desktopHeaderMenuBtn || !desktopHeaderMenuBtn.contains(e.target))) {
                tagDropdown.classList.add('hidden');
            }
            if (sessionMenuDropdown && !sessionMenuDropdown.contains(e.target) &&
                (!desktopHeaderMenuBtn || !desktopHeaderMenuBtn.contains(e.target)) &&
                (!mobileHeaderMenuBtn || !mobileHeaderMenuBtn.contains(e.target)) &&
                (!mobileChatTitle || !mobileChatTitle.contains(e.target))) {
                if (!sessionMenuDropdown.classList.contains('hidden')) {
                    closeDropdown(sessionMenuDropdown);
                }
            }
        });
    }

    // Keep old addTagBtn compatibility
    const initAddTagBtn = document.getElementById('addTagBtn');
    if (initAddTagBtn) {
        initAddTagBtn.addEventListener('click', () => {
            if (state.currentSessionId) showTagManagementModal(state.currentSessionId, state.currentChatTags);
        });
    }
    // loadAvailableTags, updatePinnedSection, updateTagsSection run in scheduleLazyInit after tags load.

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/js/sw.js').catch(err => console.log('sw registration failed: ', err));
        });
    }

    // ============== Feedback Button Event Delegation ==============
    if (messagesList) {
        messagesList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.feedback-btn');
            if (!btn) return;

            const messageDiv = btn.closest('.message');
            if (!messageDiv) return;

            const metadata = messageDiv.dataset.metadata ? JSON.parse(messageDiv.dataset.metadata) : {};
            const requestId = messageDiv.dataset.requestId || metadata.id || state.currentRequestId;
            const messageId = messageDiv.dataset.messageId || metadata.id;
            const sessionId = state.currentSessionId || metadata.sessionId;

            if (!requestId) {
                console.error('Missing ID for feedback');
                return;
            }

            // Toggle off if already active
            if (btn.classList.contains('active')) {
                try {
                    await fetch('/api/feedback', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId, sessionId, messageId })
                    });
                    btn.classList.remove('active');
                } catch (error) {
                    console.error('Failed to remove feedback:', error);
                }
                return;
            }

            // Normal flow: Show modal
            const type = btn.dataset.type; // 'good' or 'bad'
            showFeedbackReasonModal(type, requestId, sessionId, messageId);
        });
    }

    // Export navigateTo to window
    window.navigateTo = navigateTo;

});

// Outside DOMContentLoaded to be globally accessible
window.initApiPage = async function () {
    const loginPrompt = document.getElementById('api-login-prompt');
    const proPrompt = document.getElementById('api-pro-prompt');
    const apiContent = document.getElementById('api-content');
    const apiKeyDisplay = document.getElementById('api-key-display');
    const apiKeyCreate = document.getElementById('api-key-create');
    const apiKeyValue = document.getElementById('api-key-value');
    const apiKeyCreateBtn = document.getElementById('api-key-create-btn');
    const apiKeyCopyBtn = document.getElementById('api-key-copy-btn');
    const apiKeyDeleteBtn = document.getElementById('api-key-delete-btn');
    const apiUsageCount = document.getElementById('api-usage-count');
    const apiSuccessCount = document.getElementById('api-success-count');
    const apiFailureCount = document.getElementById('api-failure-count');
    const apiCompletionCount = document.getElementById('api-completion-count');
    const apiModelsCount = document.getElementById('api-models-count');
    const apiLastUsed = document.getElementById('api-last-used');

    try {
        const res = await fetch('/api/user/me');
        const userData = await res.json();
        if (!userData.loggedIn) { loginPrompt.classList.remove('hidden'); return; }
        if (!userData.user.is_pro) { proPrompt.classList.remove('hidden'); return; }
        apiContent.classList.remove('hidden');
        await loadApiKeyStatus();
        await initApiUsageChart();
    } catch (e) {
        console.error('Failed to check user status:', e);
        loginPrompt.classList.remove('hidden');
    }

    async function loadApiKeyStatus() {
        try {
            const res = await fetch('/api/user/api-key');
            const data = await res.json();
            if (data.exists) {
                apiKeyDisplay.classList.remove('hidden');
                apiKeyCreate.classList.add('hidden');
                apiKeyValue.textContent = '••••••••••••••••••••••••';
                apiUsageCount.textContent = data.usageCount || 0;
                apiSuccessCount.textContent = data.successCount || 0;
                apiFailureCount.textContent = data.failureCount || 0;
                apiCompletionCount.textContent = data.completionCount || 0;
                apiModelsCount.textContent = data.modelsCount || 0;
                apiLastUsed.textContent = data.lastUsedAt ? new Date(data.lastUsedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
            } else {
                apiKeyDisplay.classList.add('hidden');
                apiKeyCreate.classList.remove('hidden');
            }
        } catch (e) { console.error('Failed to load API key status:', e); }
    }

    async function initApiUsageChart() {
        const ctx = document.getElementById('apiUsageChart');
        if (!ctx) return;
        try {
            if (typeof Chart === 'undefined') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
                    script.onload = resolve; script.onerror = reject;
                    document.head.appendChild(script);
                });
            }
            const res = await fetch('/api/user/api-key/stats');
            const { stats } = await res.json();
            ctx.parentElement.style.display = 'block';
            if (!stats || stats.length === 0) {
                const ctx2d = ctx.getContext('2d');
                const width = ctx.clientWidth || 300;
                const height = ctx.clientHeight || 150;
                ctx.width = width; ctx.height = height;
                ctx2d.font = '14px sans-serif';
                ctx2d.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
                ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
                ctx2d.fillText('十分なデータがありません。使用を開始するとグラフが表示されます。', width / 2, height / 2);
                return;
            }
            const labels = stats.map(s => s.date.split('-').slice(1).join('/'));
            const successData = stats.map(s => s.success_count);
            const failureData = stats.map(s => s.failure_count);
            const completionData = stats.map(s => s.completion_count);
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: '成功', data: successData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
                        { label: '失敗', data: failureData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4 },
                        { label: '回答済み', data: completionData, borderColor: '#3b82f6', borderDash: [5, 5], fill: false, tension: 0.4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'top', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(), usePointStyle: true, boxWidth: 6 } } },
                    scales: {
                        y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(), stepSize: 1 }, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() } },
                        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() }, grid: { display: false } }
                    }
                }
            });
        } catch (e) {
            console.error('Failed to init API usage chart:', e);
            ctx.parentElement.style.display = 'none';
        }
    }

    if (apiKeyCreateBtn) {
        apiKeyCreateBtn.addEventListener('click', async () => {
            apiKeyCreateBtn.disabled = true;
            apiKeyCreateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 作成中...';
            try {
                const res = await fetch('/api/user/api-key/create', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    apiKeyDisplay.classList.remove('hidden');
                    apiKeyCreate.classList.add('hidden');
                    apiKeyValue.textContent = data.apiKey;
                    apiUsageCount.textContent = '0'; apiSuccessCount.textContent = '0';
                    apiFailureCount.textContent = '0'; apiCompletionCount.textContent = '0';
                    apiModelsCount.textContent = '0'; apiLastUsed.textContent = '-';
                    if (window.showAlert) window.showAlert('APIキーが作成されました', 'このキーは一度しか表示されません。必ず安全な場所にコピーして保存してください。');
                    await initApiUsageChart();
                } else { if (window.showAlert) window.showAlert('エラー', data.error || 'APIキーの作成に失敗しました。'); }
            } catch (e) { if (window.showAlert) window.showAlert('エラー', 'APIキーの作成に失敗しました。'); }
            finally { apiKeyCreateBtn.disabled = false; apiKeyCreateBtn.innerHTML = '<i class="fa-solid fa-plus"></i> APIキーを作成'; }
        });
    }

    if (apiKeyCopyBtn) {
        apiKeyCopyBtn.addEventListener('click', () => {
            const keyText = apiKeyValue.textContent;
            if (keyText && keyText !== '••••••••••••••••••••••••') {
                navigator.clipboard.writeText(keyText);
                apiKeyCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => { apiKeyCopyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
            }
        });
    }

    if (apiKeyDeleteBtn) {
        apiKeyDeleteBtn.addEventListener('click', () => {
            if (window.showConfirmModal) {
                window.showConfirmModal('APIキーの削除', '本当にAPIキーを削除しますか？この操作は取り消せません。', async () => {
                    try {
                        const res = await fetch('/api/user/api-key', { method: 'DELETE' });
                        const data = await res.json();
                        if (data.success) {
                            apiKeyDisplay.classList.add('hidden');
                            apiKeyCreate.classList.remove('hidden');
                        } else {
                            if (window.showAlert) window.showAlert('エラー', data.error || 'APIキーの削除に失敗しました。');
                        }
                    } catch (e) {
                        if (window.showAlert) window.showAlert('エラー', 'APIキーの削除に失敗しました。');
                    }
                });
            }
        });
    }
};

// ============== Plugin Page Action Handler (汎用インフラ) ==============
// プラグインが返すHTMLのdata-plugin-action属性を処理する汎用ハンドラー
// data-plugin-action="confirm"  : 確認モーダル付きPOSTアクション
// data-plugin-action="navigate" : SPA遷移
// data-plugin-action="toggle"   : チェックボックストグル（即時POST、確認なし）
//   必須: data-endpoint    送信先エンドポイント
//   任意: data-body-key    送信するJSONキー名（デフォルト: "enabled"）
//   任意: data-reload-url  成功後にリロードするプラグインページURL
function setupPluginActionButtons(container, reloadUrl) {
    container.querySelectorAll('[data-plugin-action]').forEach((el) => {
        const action = el.dataset.pluginAction;
        // toggle は change イベント、それ以外は click
        const eventName = (action === 'toggle') ? 'change' : 'click';

        el.addEventListener(eventName, async () => {
            if (action === 'confirm') {
                const title = el.dataset.confirmTitle || '確認';
                const msg = el.dataset.confirmMsg || '続けますか？';
                const endpoint = el.dataset.endpoint;
                const successMsg = el.dataset.successMsg;
                const successUrl = el.dataset.successUrl;
                const reload = el.dataset.reloadUrl || reloadUrl;
                window.showConfirmModal(title, msg, async () => {
                    el.disabled = true;
                    try {
                        const res = await fetch(endpoint, { method: 'POST' });
                        const data = await res.json();
                        if (data.success) {
                            if (successMsg) window.showAlertModal('完了', successMsg);
                            if (successUrl) {
                                setTimeout(() => {
                                    if (typeof window.navigateTo === 'function') window.navigateTo(successUrl);
                                }, successMsg ? 1200 : 0);
                            } else if (reload) {
                                setTimeout(() => loadPluginPage(container, reload), successMsg ? 1200 : 0);
                            }
                        } else {
                            window.showAlertModal('エラー', data.error || 'エラーが発生しました。');
                            el.disabled = false;
                        }
                    } catch (e) {
                        window.showAlertModal('エラー', '通信エラーが発生しました。');
                        el.disabled = false;
                    }
                });

            } else if (action === 'navigate') {
                const url = el.dataset.url;
                if (url && typeof window.navigateTo === 'function') window.navigateTo(url);

            } else if (action === 'toggle') {
                // 汎用トグル: チェックボックスの状態を即時POSTする（確認モーダルなし）
                const enabled = el.checked;
                const endpoint = el.dataset.endpoint;
                const bodyKey  = el.dataset.bodyKey || 'enabled';
                const reload   = el.dataset.reloadUrl || reloadUrl;
                el.disabled = true;
                try {
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ [bodyKey]: enabled })
                    });
                    const data = await res.json();
                    if (!data.success) {
                        el.checked = !enabled; // 失敗時は元に戻す
                        window.showAlertModal('エラー', data.error || 'エラーが発生しました。');
                    } else if (reload) {
                        await loadPluginPage(container, reload);
                    }
                } catch (e) {
                    el.checked = !enabled;
                    window.showAlertModal('エラー', '通信エラーが発生しました。');
                } finally {
                    el.disabled = false;
                }
            }
        });
    });
}

/** プラグインCSSを document.head に動的注入（重複注入防止付き） */
function injectPluginCSS(href) {
    const id = 'plugin-css-' + href.replace(/[^a-z0-9]/gi, '-');
    if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.id = id;
        document.head.appendChild(link);
    }
}

async function loadPluginPage(container, apiUrl) {
    container.innerHTML = '<div class="pro-status-loader"><div class="loading-spinner"></div></div>';
    try {
        const res = await fetch(apiUrl);
        if (res.ok) {
            // プラグインが登録したCSSをヘッダーから取得して注入
            const pluginCSS = res.headers.get('X-Plugin-CSS');
            if (pluginCSS) {
                pluginCSS.split(',').map(s => s.trim()).filter(Boolean).forEach(injectPluginCSS);
            }
            const html = await res.text();
            container.innerHTML = html;
            if (typeof setupSpaLinks === 'function') setupSpaLinks(container);
            setupPluginActionButtons(container, apiUrl);
        } else {
            container.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">読み込みに失敗しました。</p>';
        }
    } catch (e) {
        console.error('[loadPluginPage] Failed:', e);
        container.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">読み込みに失敗しました。</p>';
    }
}

// Pro設定ページ（/pages/pro/settings）
window.initProSettingsPage = async function () {
    const container = document.getElementById('pro-settings-container');
    if (!container) return;
    await loadPluginPage(container, '/api/app/page/pro-settings');
};

// Proプランページ（/pages/pro）
window.initProPage = async function () {
    const container = document.getElementById('pro-page-container');
    if (!container) return;
    await loadPluginPage(container, '/api/app/page/pro');
};




window.initBlogPage = async function () {
    const contentArea = document.getElementById('blog-content-area');
    if (!contentArea) return;

    const path = window.location.pathname;
    const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
    const blogMatch = normalizedPath.match(/\/blogs\/(\d{4}-\d{2}-\d{2})(?:\/(\d+))?/);

    if (blogMatch) {
        // Individual blog post
        const date = blogMatch[1];
        const id = blogMatch[2] || '1';
        try {
            const res = await fetch(`/api/blogs/${date}/${id}`);
            if (!res.ok) throw new Error('Blog not found');
            const data = await res.json();

            const pageTitle = `${data.title} - KAiブログ`;
            document.title = pageTitle;

            // Update mobile header title
            const mobileChatTitle = document.getElementById('mobileChatTitle');
            if (mobileChatTitle) {
                mobileChatTitle.textContent = data.title;
            }
            if (chatTitle) {
                chatTitle.textContent = data.title;
            }

            // Update meta description
            let metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                // Strip markdown and take first 150 chars
                const plainText = data.content.replace(/[#*`]/g, '').trim();
                metaDesc.content = plainText.substring(0, 150) + (plainText.length > 150 ? '...' : '');
            }

            // Strip first H1 if it exists to avoid duplication
            let displayContent = data.content;
            if (displayContent.trim().startsWith('# ')) {
                displayContent = displayContent.trim().replace(/^#\s+.+$/m, '').trim();
            }

            contentArea.innerHTML = `
                <div class="blog-post">
                    <div class="blog-nav">
                        <a href="/blogs" class="spa-link btn-back-blog"><i class="fa-solid fa-arrow-left"></i> ブログ一覧に戻る</a>
                    </div>
                    <div class="blog-author">
                        <img src="${sanitizeAvatarUrl(data.author_icon)}" alt="Author Icon" class="blog-author-icon">
                        <span class="blog-author-name">${escapeHtml(data.author || 'KAi')}</span>
                    </div>
                    <h1 class="blog-title">${escapeHtml(data.title)}</h1>
                    <div class="blog-meta-footer">
                        <div class="blog-date">投稿日: ${date}</div>
                        ${data.tags && data.tags.length > 0 ? `<div class="blog-tags">${data.tags.map(tag => `<span class="blog-tag">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                    </div>
                    <hr class="blog-divider">
                    <div class="blog-body markdown-body">${DOMPurify.sanitize(marked.parse(displayContent))}</div>
                    
                    <div class="blog-comments-section">
                        <h3>コメント</h3>
                        <div id="blog-comments-container">読み込み中...</div>
                        <div id="blog-comment-form-container"></div>
                    </div>
                </div>
            `;

            // SPA link re-setup
            contentArea.querySelectorAll('.spa-link').forEach(link => {
                link.onclick = (e) => {
                    e.preventDefault();
                    window.navigateTo(link.getAttribute('href'));
                };
            });

            const loadComments = async () => {
                const container = document.getElementById('blog-comments-container');
                try {
                    const res = await fetch(`/api/blogs/${date}/${id}/comments`);
                    const { comments } = await res.json();
                    if (!comments || comments.length === 0) {
                        container.innerHTML = '<p class="no-comments">コメントはまだありません。</p>';
                        return;
                    }
                    const map = {};
                    const roots = [];
                    comments.forEach(c => {
                        c.replies = [];
                        map[c.id] = c;
                        if (c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(c);
                        else roots.push(c);
                    });
                    const render = (c, depth = 0) => {
                        const hasReplies = c.replies && c.replies.length > 0;
                        const isExpanded = state.expandedCommentIds.has(c.id);
                        return `
                            <div class="blog-comment" style="margin-left: ${depth * 20}px">
                                <div class="comment-main">
                                    <div class="comment-header">
                                        <img src="${sanitizeAvatarUrl(c.avatar_url)}" class="comment-avatar">
                                        <span class="comment-author">${escapeHtml(c.username || '元ユーザー')}</span>
                                        <span class="comment-date">${new Date(c.created_at).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}${c.updated_at ? ' <span class="comment-edited">編集済</span>' : ''}</span>
                                        <div class="comment-admin-actions">
                                            ${state.isLoggedIn && (c.user_id === state.userId) ? `<button class="btn-edit-comment btn-icon-only" data-id="${c.id}"><i class="fa-solid fa-pen"></i></button>` : ''}
                                            ${state.isLoggedIn && (c.user_id === state.userId || state.username === 'bac0n') ? `<button class="btn-delete-comment btn-icon-only" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
                                        </div>
                                    </div>
                                    <div class="comment-content markdown-body" id="comment-content-${c.id}">${DOMPurify.sanitize(marked.parse(c.content))}</div>
                                    <div class="comment-actions">
                                        ${state.isLoggedIn ? `<button class="btn-reply-comment btn-icon-only" data-id="${c.id}" title="返信する"><i class="fa-solid fa-reply"></i></button>` : ''}
                                        ${hasReplies ? `
                                            <button class="btn-toggle-replies" data-id="${c.id}">
                                                ${isExpanded ? `<i class="fa-solid fa-chevron-up"></i> 返信を隠す` : `<i class="fa-solid fa-chevron-down"></i> ${c.replies.length}件の返信を表示`}
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                                <div id="reply-form-${c.id}" class="reply-form-container"></div>
                                ${hasReplies ? `
                                    <div id="replies-container-${c.id}" class="replies-container ${isExpanded ? '' : 'hidden'}">
                                        ${c.replies.map(r => render(r, depth + 1)).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    };
                    container.innerHTML = roots.map(r => render(r)).join('');
                    container.querySelectorAll('.btn-reply-comment').forEach(btn => {
                        btn.onclick = () => {
                            const pid = btn.dataset.id;
                            const f = document.getElementById(`reply-form-${pid}`);
                            if (f.innerHTML) { f.innerHTML = ''; return; }
                            f.innerHTML = `
                                <div class="reply-form">
                                    <div class="reply-form-header">
                                        <span>返信を入力</span>
                                        <button class="btn-close-reply-form btn-icon-only" data-id="${pid}"><i class="fa-solid fa-xmark"></i></button>
                                    </div>
                                    <textarea id="rt-${pid}" placeholder="Markdownが使えます..."></textarea>
                                    <div class="reply-form-actions">
                                        <button class="btn-sr" data-pid="${pid}">送信</button>
                                    </div>
                                </div>`;
                            f.querySelector('.btn-sr').onclick = () => submit(pid);
                            f.querySelector('.btn-close-reply-form').onclick = () => { f.innerHTML = ''; };
                        };
                    });
                    container.querySelectorAll('.btn-toggle-replies').forEach(btn => {
                        btn.onclick = () => {
                            const cid = parseInt(btn.dataset.id);
                            const rc = document.getElementById(`replies-container-${cid}`);
                            const isHidden = rc.classList.toggle('hidden');
                            if (isHidden) state.expandedCommentIds.delete(cid);
                            else state.expandedCommentIds.add(cid);
                            btn.innerHTML = isHidden ?
                                `<i class="fa-solid fa-chevron-down"></i> ${rc.children.length}件の返信を表示` :
                                `<i class="fa-solid fa-chevron-up"></i> 返信を隠す`;
                        };
                    });
                    container.querySelectorAll('.btn-delete-comment').forEach(btn => {
                        btn.onclick = () => {
                            if (window.showConfirmModal) {
                                window.showConfirmModal('コメントの削除', 'このコメントを削除しますか？', async () => {
                                    const cid = btn.dataset.id;
                                    try {
                                        const res = await fetch(`/api/blogs/${date}/${id}/comments/${cid}`, { method: 'DELETE' });
                                        if (res.ok) await loadComments();
                                        else {
                                            const d = await res.json();
                                            if (window.showAlert) window.showAlert('エラー', d.error || '削除に失敗しました');
                                        }
                                    } catch (e) {
                                        if (window.showAlert) window.showAlert('エラー', '通信エラーが発生しました');
                                    }
                                });
                            }
                        };
                    });
                    container.querySelectorAll('.btn-edit-comment').forEach(btn => {
                        btn.onclick = () => {
                            const cid = btn.dataset.id;
                            const ce = document.getElementById(`comment-content-${cid}`);
                            const original = ce.textContent;
                            if (ce.querySelector('textarea')) return;
                            ce.innerHTML = `
                                <div class="edit-comment-form">
                                    <textarea id="edit-ta-${cid}">${original}</textarea>
                                    <div class="edit-actions">
                                        <button class="btn-secondary btn-cancel-edit" data-id="${cid}">キャンセル</button>
                                        <button class="btn-primary btn-save-edit" data-id="${cid}">保存</button>
                                    </div>
                                </div>
                            `;
                            ce.querySelector('.btn-cancel-edit').onclick = () => { ce.textContent = original; };
                            ce.querySelector('.btn-save-edit').onclick = async () => {
                                const newVal = document.getElementById(`edit-ta-${cid}`).value.trim();
                                if (!newVal || newVal === original) { ce.textContent = original; return; }
                                try {
                                    const res = await fetch(`/api/blogs/${date}/${id}/comments/${cid}`, {
                                        method: 'PUT',
                                        body: JSON.stringify({ content: newVal }),
                                        headers: { 'Content-Type': 'application/json' }
                                    });
                                    if (res.ok) await loadComments();
                                    else {
                                        const d = await res.json();
                                        if (window.showAlert) window.showAlert('エラー', d.error || '更新に失敗しました');
                                        ce.textContent = original;
                                    }
                                } catch (e) {
                                    if (window.showAlert) window.showAlert('エラー', '通信エラーが発生しました');
                                    ce.textContent = original;
                                }
                            };
                        };
                    });
                } catch (err) { container.innerHTML = '<p>コメントの読み込みに失敗しました。</p>'; }
            };

            const submit = async (pid = null) => {
                const tid = pid ? `rt-${pid}` : 'comment-text-main';
                const ta = document.getElementById(tid);
                const content = ta.value.trim();
                if (!content) return;
                try {
                    const res = await fetch(`/api/blogs/${date}/${id}/comments`, {
                        method: 'POST',
                        body: JSON.stringify({ content, parent_id: pid }),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const d = await res.json();
                    if (!res.ok) {
                        if (window.showAlert) window.showAlert('エラー', d.error || '投稿に失敗しました');
                        return;
                    }
                    ta.value = '';
                    if (pid) state.expandedCommentIds.add(parseInt(pid));
                    await loadComments();
                } catch (err) {
                    if (window.showAlert) window.showAlert('エラー', '通信エラーが発生しました');
                }
            };

            const setupForm = () => {
                const fContainer = document.getElementById('blog-comment-form-container');
                if (state.isLoggedIn) {
                    fContainer.innerHTML = `
                        <div class="comment-form">
                            <h4>コメントを投稿する</h4>
                            <textarea id="comment-text-main" placeholder="コメントを入力..."></textarea>
                            <button id="btn-submit-blog-comment">投稿</button>
                        </div>
                    `;
                    document.getElementById('btn-submit-blog-comment').onclick = () => submit();
                } else {
                    fContainer.innerHTML = '<p class="login-prompt">コメントするにはログインが必要です。</p>';
                }
            };

            await loadComments();
            setupForm();
        } catch (e) {
            contentArea.innerHTML = `
                <div class="blog-error">
                    <h2>記事が見つかりませんでした</h2>
                    <p>お探しのブログ記事は存在しないか、移動された可能性があります。</p>
                    <a href="/blogs" class="spa-link btn-primary" id="blog-back-to-list-error">一覧に戻る</a>
                </div>
            `;
            const backBtn = document.getElementById('blog-back-to-list-error');
            if (backBtn) {
                backBtn.onclick = (e) => {
                    e.preventDefault();
                    window.navigateTo('/blogs');
                };
            }
        }
    } else {
        // Blog list
        try {
            const res = await fetch('/api/blogs');
            const { blogs } = await res.json();

            if (!blogs || blogs.length === 0) {
                contentArea.innerHTML = '<div class="blog-empty">ブログ記事がまだありません。</div>';
                return;
            }

            contentArea.innerHTML = `
                <div class="blog-list">
                    <h1>ブログ一覧</h1>
                    <div class="blog-grid">
                        ${blogs.map(blog => `
                            <a href="/blogs/${blog.date}/${blog.id}" class="blog-card blog-spa-link">
                                <img src="${sanitizeAvatarUrl(blog.author_icon)}" alt="" class="blog-card-author-icon">
                                <div class="blog-card-main">
                                    <div class="blog-card-meta">
                                        <span class="blog-card-author">${escapeHtml(blog.author || 'KAi')}</span>
                                        <span class="blog-card-date">${blog.date}</span>
                                    </div>
                                    <h3 class="blog-card-title">${escapeHtml(blog.title)}</h3>
                                    ${blog.tags && blog.tags.length > 0 ? `
                                        <div class="blog-card-tags">
                                            ${blog.tags.map(t => `<span class="blog-card-tag">#${escapeHtml(t)}</span>`).join(' ')}
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="blog-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;

            contentArea.querySelectorAll('.blog-spa-link').forEach(link => {
                link.onclick = (e) => {
                    e.preventDefault();
                    const href = link.getAttribute('href');
                    window.navigateTo(href);
                };
            });
        } catch (e) {
            contentArea.innerHTML = '<div class="blog-error">一覧の読み込みに失敗しました。</div>';
        }
    }
};

// Make navigateTo globally accessible for init functions
window.addEventListener('DOMContentLoaded', () => {
    // navigateTo is already exported inside the main DOMContentLoaded
});
