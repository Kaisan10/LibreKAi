export let sidebar = null;
export let sidebarOverlay = null;
export let mobileMenuBtn = null;
export let toggleSidebarBtn = null;
export let historyContainer = null;
export let tagsContainer = null;
export let pinnedContainer = null;
export let pageNavContainer = null;
export let newChatBtnSidebar = null;
export let pageNavList = null;
export let adminSidebarSection = null;

let updateTagsSection = null;
let updatePinnedSection = null;

export function initSidebar(elements, deps) {
    sidebar = elements.sidebar;
    sidebarOverlay = elements.sidebarOverlay;
    mobileMenuBtn = elements.mobileMenuBtn;
    toggleSidebarBtn = elements.toggleSidebarBtn;
    historyContainer = elements.historyContainer;
    tagsContainer = elements.tagsContainer;
    pinnedContainer = elements.pinnedContainer;
    pageNavContainer = elements.pageNavContainer;
    newChatBtnSidebar = elements.newChatBtnSidebar;
    pageNavList = elements.pageNavList;
    adminSidebarSection = elements.adminSidebarSection;
    adminPageNavList = elements.adminPageNavList;

    if (deps) {
        updateTagsSection = deps.updateTagsSection;
        updatePinnedSection = deps.updatePinnedSection;
    }

    if (toggleSidebarBtn) {
        toggleSidebarBtn.removeEventListener('click', toggleSidebar); // remove old if any
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.removeEventListener('click', toggleSidebar);
        mobileMenuBtn.addEventListener('click', toggleSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.removeEventListener('click', closeMobileSidebar);
        sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }
}

// Toggle Sidebar (Desktop & Mobile)
export const toggleSidebar = () => {
    if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('visible');
    } else {
        if (sidebar) sidebar.classList.toggle('collapsed');
    }
};

// Close mobile sidebar when clicking outside or on an item
export const closeMobileSidebar = () => {
    if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('visible');
    }
};

// Show sidebar history, hide page nav
export const showSidebarHistory = () => {
    if (historyContainer) historyContainer.classList.remove('hidden');
    if (tagsContainer) tagsContainer.classList.remove('hidden');
    if (pinnedContainer) pinnedContainer.classList.remove('hidden');
    if (newChatBtnSidebar) newChatBtnSidebar.classList.remove('hidden');
    if (pageNavContainer) pageNavContainer.classList.add('hidden');
    if (adminSidebarSection) adminSidebarSection.classList.add('hidden');

    // Update tags and pinned sections based on content
    if (typeof updateTagsSection === 'function') updateTagsSection();
    if (typeof updatePinnedSection === 'function') updatePinnedSection();
};

// Show sidebar page nav, hide history
export const showSidebarPageNav = (currentPath) => {
    if (historyContainer) historyContainer.classList.add('hidden');
    if (tagsContainer) tagsContainer.classList.add('hidden');
    if (pinnedContainer) pinnedContainer.classList.add('hidden');
    if (newChatBtnSidebar) newChatBtnSidebar.classList.add('hidden');
    if (pageNavContainer) pageNavContainer.classList.remove('hidden');
    if (adminSidebarSection) adminSidebarSection.classList.add('hidden');
    updatePageNavActive(currentPath);
};

// Show sidebar admin nav, hide others
export const showSidebarAdmin = (currentPath) => {
    if (historyContainer) historyContainer.classList.add('hidden');
    if (tagsContainer) tagsContainer.classList.add('hidden');
    if (pinnedContainer) pinnedContainer.classList.add('hidden');
    if (newChatBtnSidebar) newChatBtnSidebar.classList.add('hidden');
    if (pageNavContainer) pageNavContainer.classList.add('hidden');
    if (adminSidebarSection) adminSidebarSection.classList.remove('hidden');
    updatePageNavActive(currentPath);
};

export let adminPageNavList = null;

// Update page nav active state
export const updatePageNavActive = (path) => {
    const lists = [pageNavList, adminPageNavList].filter(l => l !== null);
    lists.forEach(list => {
        list.querySelectorAll('.page-nav-item, .page-nav-item-back').forEach(item => {
            item.classList.remove('active');
            const itemPath = item.getAttribute('data-path');
            if (itemPath === path || (path && path.startsWith('/chat') && itemPath === '/')) {
                item.classList.add('active');
            }
        });
    });
};

// Update admin nav active state is now merged into updatePageNavActive
export const updateAdminNavActive = () => { };
