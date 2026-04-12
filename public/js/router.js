import { state } from './state.js';
import { getSessionIdFromPath, closeAllActiveDropdowns } from './utils.js';
import { startNewChat, loadSession } from './session.js';
import { routeMap } from './routes-map.js';
import { escapeHtml } from './sanitize.js';

let showTagTreeView = null;
let updateHeaderTagsDisplay = null;
let closeMobileSidebar = null;
let showSidebarHistory = null;
let showSidebarPageNav = null;
let showSidebarAdmin = null;
let updatePageNavActive = null;
let getTagMappings = null;

// UI Elements
let chatContainer = null;
let staticPageContainer = null;
let adminSidebarSection = null;
let mainContent = null;
let welcomeMessage = null;
let headerMenuBtns = null; // { desktop, mobile }
let shareBtns = null; // { desktop, mobile }
let chatTitle = null;
let mobileChatTitle = null;
let desktopChatHeader = null;
let tagsContainer = null;
let pinnedContainer = null;
let inputWrapper = null;
let pageLoadingIndicator = null;
let suggestionCards = null;

export const initRouter = (elements, deps) => {
    chatContainer = elements.chatContainer;
    staticPageContainer = elements.staticPageContainer;
    adminSidebarSection = elements.adminSidebarSection;
    mainContent = elements.mainContent;
    welcomeMessage = elements.welcomeMessage;
    headerMenuBtns = elements.headerMenuBtns;
    shareBtns = elements.shareBtns;
    chatTitle = elements.chatTitle;
    mobileChatTitle = elements.mobileChatTitle;
    desktopChatHeader = elements.desktopChatHeader;
    tagsContainer = elements.tagsContainer;
    pinnedContainer = elements.pinnedContainer;
    inputWrapper = elements.inputWrapper;
    inputWrapper = elements.inputWrapper;
    suggestionCards = elements.suggestionCards;

    showTagTreeView = deps.showTagTreeView;
    updateHeaderTagsDisplay = deps.updateHeaderTagsDisplay;
    closeMobileSidebar = deps.closeMobileSidebar;
    showSidebarHistory = deps.showSidebarHistory;
    showSidebarPageNav = deps.showSidebarPageNav;
    showSidebarAdmin = deps.showSidebarAdmin;
    updatePageNavActive = deps.updatePageNavActive;
    getTagMappings = deps.getTagMappings;

    // Create loading indicator
    pageLoadingIndicator = document.createElement('div');
    pageLoadingIndicator.className = 'page-loading-indicator';
    pageLoadingIndicator.innerHTML = '<div class="page-loading-bar"></div>';
    document.body.appendChild(pageLoadingIndicator);
};

export const showPageLoading = () => {
    if (pageLoadingIndicator) pageLoadingIndicator.classList.add('active');
};

export const hidePageLoading = () => {
    if (pageLoadingIndicator) pageLoadingIndicator.classList.remove('active');
};

const getStaticPageContainer = () => staticPageContainer || document.getElementById('staticPageContainer');

export const showChatUI = () => {
    // Show chat elements
    if (chatContainer) chatContainer.style.display = '';
    if (welcomeMessage) welcomeMessage.style.display = '';
    // Re-query inputWrapper if not cached or lost (it might be moved by layout changes?)
    // But we cached it.
    if (inputWrapper) inputWrapper.style.display = '';

    // Hide static page
    const container = getStaticPageContainer();
    if (container) {
        container.classList.add('hidden');
    }
    if (adminSidebarSection) {
        adminSidebarSection.classList.add('hidden');
    }
    // Update root class for CSS-based display control
    document.documentElement.classList.remove('is-static-page');
    // Show history in sidebar
    if (showSidebarHistory) showSidebarHistory();

    // Ensure desktop header visibility and title
    if (desktopChatHeader) {
        desktopChatHeader.classList.remove('hidden');
        if (!state.currentSessionId) {
            if (chatTitle) chatTitle.textContent = '';
            document.title = (state.appConfig && state.appConfig.siteTitle) ? state.appConfig.siteTitle : 'KAi';
            if (mobileChatTitle) mobileChatTitle.textContent = '';

            // Hide header menu buttons when no session
            if (headerMenuBtns.desktop) headerMenuBtns.desktop.classList.add('hidden');
            if (headerMenuBtns.mobile) headerMenuBtns.mobile.classList.add('hidden');
        } else if (state.isOwner) {
            // Show header menu buttons if returning to owner session
            if (headerMenuBtns.desktop) headerMenuBtns.desktop.classList.remove('hidden');
            if (headerMenuBtns.mobile) headerMenuBtns.mobile.classList.remove('hidden');
        }
    }
};

export const hideChatUI = (currentPath) => {
    // Hide chat elements  
    if (chatContainer) chatContainer.style.display = 'none';
    if (welcomeMessage) welcomeMessage.style.display = 'none';
    if (inputWrapper) inputWrapper.style.display = 'none';
    if (tagsContainer) tagsContainer.classList.add('hidden');
    if (pinnedContainer) pinnedContainer.classList.add('hidden');
    if (suggestionCards) suggestionCards.classList.add('hidden');
    // Show static page
    const container = getStaticPageContainer();
    if (container) {
        container.classList.remove('hidden');
    }
    // Update root class for CSS-based display control
    document.documentElement.classList.add('is-static-page');
    // Show page nav in sidebar
    if (currentPath && currentPath.startsWith('/admin')) {
        if (showSidebarAdmin) showSidebarAdmin(currentPath);
    } else {
        if (showSidebarPageNav) showSidebarPageNav(currentPath);
    }

    // Hide header menu buttons on static pages
    if (headerMenuBtns.desktop) headerMenuBtns.desktop.classList.add('hidden');
    if (headerMenuBtns.mobile) headerMenuBtns.mobile.classList.add('hidden');

    // Hide share buttons on static pages
    if (shareBtns.desktop) shareBtns.desktop.classList.add('hidden');
    if (shareBtns.mobile) shareBtns.mobile.classList.add('hidden');

    // Clear titles on static pages
    if (chatTitle) chatTitle.textContent = '';
    if (mobileChatTitle) mobileChatTitle.textContent = '';
};

const ADMIN_CSS = '/css/admin.css';

function ensureAdminCss() {
    if (document.querySelector(`link[href="${ADMIN_CSS}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ADMIN_CSS;
    document.head.appendChild(link);
}

export const renderPage = async (path) => {
    const modulePath = routeMap[path];
    if (!modulePath) return false;

    // Admin pages: always ensure admin.css is loaded before rendering (so all /admin/* get it)
    if (typeof path === 'string' && (path === '/admin' || path.startsWith('/admin/'))) {
        ensureAdminCss();
    }

    let page;
    try {
        page = await import(modulePath);
    } catch (err) {
        console.error('Failed to load page module:', path, err);
        return false;
    }

    // Load page-specific CSS if defined
    if (page.css) {
        const existingLink = document.querySelector(`link[href="${page.css}"]`);
        if (!existingLink) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = page.css;
            document.head.appendChild(link);
        }
    }

    const container = getStaticPageContainer();
    if (!container) {
        console.error('SPA Error: #staticPageContainer not found in DOM.');
        return false;
    }

    container.innerHTML = page.content;
    container.style.display = ''; // Clear inline style, let CSS control display
    document.title = page.title;

    // Update mobile header title for static pages
    if (mobileChatTitle) {
        mobileChatTitle.textContent = page.title;
    }
    if (chatTitle) {
        chatTitle.textContent = page.title;
    }

    // Update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
    }
    metaDesc.content = page.description || (state.appConfig && state.appConfig.metaDescription) || 'KAi';

    // Update meta keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.name = 'keywords';
        document.head.appendChild(metaKeywords);
    }
    metaKeywords.content = page.keywords || (state.appConfig && state.appConfig.metaKeywords) || 'KAi, AI';
    state.currentSessionId = null; // Clear session ID as we are on a static page
    setupSpaLinks(container);
    hideChatUI(path);

    // Call page-specific init if defined
    if (typeof page.init === 'function') {
        try {
            await page.init();
        } catch (err) {
            console.error('Failed to run page init:', path, err);
        }
    }

    return true;
};

export const setupSpaLinks = (container) => {
    container.querySelectorAll('.spa-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            navigateTo(href);
        });
    });
};

const showStaticPageSkeleton = (container) => {
    container.scrollTop = 0;
    container.innerHTML = `
        <div class="skeleton-static-page">
            <div class="skeleton-header skeleton"></div>
            <div class="skeleton-line skeleton"></div>
            <div class="skeleton-line skeleton"></div>
            <div class="skeleton-line medium skeleton"></div>
            <div class="skeleton-line skeleton"></div>
            <div class="skeleton-line short skeleton"></div>
            <br>
            <div class="skeleton-line skeleton"></div>
            <div class="skeleton-line medium skeleton"></div>
        </div>
    `;
    // Force display with inline style to override any CSS
    container.style.display = 'flex';
    container.classList.remove('hidden');
};

export const prepareForStaticPage = (path) => {
    const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
    // Check if is a known static page or blog page
    const isStaticPage = !!routeMap[normalizedPath] || normalizedPath === '/blogs' || normalizedPath.startsWith('/blogs/');
    const isAdminPage = normalizedPath === '/admin' || normalizedPath.startsWith('/admin/');
    const isChatRoute = getSessionIdFromPath(normalizedPath) || normalizedPath === '/';

    if (isStaticPage || isAdminPage || (!isChatRoute && routeMap['notFound'])) {
        if (mainContent) mainContent.scrollTop = 0;
        const container = getStaticPageContainer();
        if (container) {
            showStaticPageSkeleton(container);
            hideChatUI(normalizedPath);
            return true;
        }
    }
    return false;
};

export const navigateTo = (path) => {
    const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    const isAdminToAdmin = normalizedPath.startsWith('/admin') && currentPath.startsWith('/admin');

    if (!isAdminToAdmin) {
        showPageLoading();
        prepareForStaticPage(path);
    } else if (mainContent) {
        mainContent.scrollTop = 0;
    }

    if (closeMobileSidebar) closeMobileSidebar(); // Close sidebar on mobile after selecting a link
    window.history.pushState({}, '', path);

    if (isAdminToAdmin) {
        handleRoute();
    } else {
        setTimeout(() => {
            handleRoute();
            hidePageLoading();
        }, 200);
    }
};

export const handleRoute = () => {
    closeAllActiveDropdowns(); // Close any open menus on page change
    const path = window.location.pathname;
    const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;

    // Check for SPA static pages first
    if (routeMap[normalizedPath]) {
        hideChatUI(normalizedPath);
        renderPage(normalizedPath);
        // Scroll to top for new page
        if (mainContent) mainContent.scrollTop = 0;
        return;
    }

    // Handle dynamic blog routes /blogs/:date/:id
    if (normalizedPath === '/blogs' || normalizedPath.startsWith('/blogs/')) {
        hideChatUI(normalizedPath);
        renderPage('/blogs'); // We use /blogs meta but the individual page logic will handle the rest
        return;
    }

    // Handle dynamic /admin/plugins/:id route
    const pluginDetailMatch = normalizedPath.match(/^\/admin\/plugins\/([a-zA-Z0-9\-_]+)$/);
    if (pluginDetailMatch) {
        const pluginId = pluginDetailMatch[1];
        hideChatUI(normalizedPath);
        if (showSidebarAdmin) showSidebarAdmin(normalizedPath);
        // プラグイン詳細は renderPage を経由しないため、admin.css を明示的にロード
        const adminCss = '/css/admin.css';
        if (!document.querySelector(`link[href="${adminCss}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = adminCss;
            document.head.appendChild(link);
        }
        const container = document.getElementById('staticPageContainer');
        if (container) {
            container.innerHTML = `<div class="legal-container"><div id="admin-plugin-detail-container"></div></div>`;
            container.classList.remove('hidden');
        }
        document.title = `プラグイン詳細 - KAi Admin`;
        import('./admin.js').then(m => { if (m.initAdminPluginDetailPage) m.initAdminPluginDetailPage(pluginId); });
        return;
    }

    // Handle dynamic tags route /tags/:id
    const tagMatch = normalizedPath.match(/^\/tags\/(\d+)$/);
    if (tagMatch && getTagMappings) {
        const tagId = tagMatch[1];
        const { idToName } = getTagMappings();
        const tagName = idToName[tagId];
        if (tagName) {
            const filteredChats = state.history.filter(item =>
                item.tags && item.tags.includes(tagName)
            );
            if (showTagTreeView) showTagTreeView(tagName, filteredChats, false); // false = don't push state again
            return;
        }
    }

    // Handle chat sessions /c/:id
    const sessionId = getSessionIdFromPath(path);
    if (sessionId) {
        showChatUI();
        if (updatePageNavActive) updatePageNavActive(path);
        loadSession(sessionId);
    } else {
        // Default to new chat (also handles '/')
        if (normalizedPath === '/') {
            showChatUI();
            if (updatePageNavActive) updatePageNavActive(path);
            startNewChat();
        } else {
            // 404 Not Found
            hideChatUI(normalizedPath);
            renderPage('notFound');
        }
    }
};


window.initTagsListPage = () => {
    const grid = document.getElementById('tagsGrid');
    if (!grid) return;
    if (!getTagMappings) return;

    const { nameToId } = getTagMappings();
    const allTags = {};
    state.history.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => {
                if (!allTags[tag]) allTags[tag] = 0;
                allTags[tag]++;
            });
        }
    });

    const sortedNames = Object.keys(allTags).sort();

    if (sortedNames.length === 0) {
        grid.innerHTML = '<div class="tags-empty">タグがありません</div>';
    } else {
        grid.innerHTML = sortedNames.map(name => {
            const id = nameToId[name];
            return `
                <a href="/tags/${id}" class="tag-card spa-link" data-path="/tags/${id}">
                    <div class="tag-card-name">${escapeHtml(name)}</div>
                    <div class="tag-card-count">${allTags[name]}件の会話</div>
                </a>
            `;
        }).join('');
        setupSpaLinks(grid);
    }
};
