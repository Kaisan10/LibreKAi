/**
 * utils.js - Utility Functions
 * Extracted from script.js lines 471-622, 2541-2569
 */

// Helper function to check if mobile
export const isMobile = () => window.innerWidth <= 768;

// URL helpers for deep linking chats
export const getSessionIdFromPath = (path) => {
    const p = path || window.location.pathname;
    const match = p.match(/^\/chat\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
};

export const updateUrlForSession = (sessionId) => {
    const newPath = sessionId ? `/chat/${encodeURIComponent(sessionId)}` : '/';
    if (window.location.pathname !== newPath) {
        window.history.replaceState({}, document.title, newPath);
    }
};

// Helper function to position dropdown within viewport bounds
export const positionDropdown = (dropdown, triggerRect, options = {}) => {
    const { preferAbove = false, offset = 5 } = options;
    dropdown.style.position = 'fixed';
    dropdown.style.right = 'auto';

    // Get dropdown dimensions after making it visible
    const dropdownRect = dropdown.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate horizontal position
    let left = triggerRect.left;
    const dropdownWidth = dropdownRect.width || 200; // Estimate if not rendered yet

    // Check if dropdown would go off the right edge
    if (left + dropdownWidth > viewportWidth - 10) {
        left = viewportWidth - dropdownWidth - 10;
    }
    // Ensure it doesn't go off the left edge
    if (left < 10) {
        left = 10;
    }
    dropdown.style.left = `${left}px`;

    // Calculate vertical position
    const dropdownHeight = dropdownRect.height || 150; // Estimate if not rendered yet

    if (preferAbove) {
        // Position above the trigger
        let bottom = viewportHeight - triggerRect.top + offset;
        // Check if dropdown would go off the top edge
        if (triggerRect.top - offset - dropdownHeight < 0) {
            // Position below instead
            dropdown.style.top = `${triggerRect.bottom + offset}px`;
            dropdown.style.bottom = 'auto';
        } else {
            dropdown.style.bottom = `${bottom}px`;
            dropdown.style.top = 'auto';
        }
    } else {
        // Position below the trigger
        let top = triggerRect.bottom + offset;
        // Check if dropdown would go off the bottom edge
        if (top + dropdownHeight > viewportHeight - 10) {
            // Position above instead
            dropdown.style.bottom = `${viewportHeight - triggerRect.top + offset}px`;
            dropdown.style.top = 'auto';
        } else {
            dropdown.style.top = `${top}px`;
            dropdown.style.bottom = 'auto';
        }
    }
};

export const closeDropdown = (dropdown, originalParent = null) => {
    if (dropdown.classList.contains('hidden')) return;
    dropdown.classList.add('closing');

    const dropdownOverlay = document.getElementById('dropdownOverlay');

    // Hide overlay on mobile
    if (isMobile() && dropdownOverlay) {
        dropdownOverlay.classList.remove('visible');
    }

    setTimeout(() => {
        dropdown.classList.add('hidden');
        dropdown.classList.remove('closing');

        // Move back to original parent on mobile
        if (isMobile() && originalParent && dropdown.parentElement !== originalParent) {
            originalParent.appendChild(dropdown);
        }
    }, 150); // Match animation duration
};

// Helper function to close all active dropdowns and bottom sheets
export const closeAllActiveDropdowns = () => {
    const dropdownOverlay = document.getElementById('dropdownOverlay');

    // Close history dropdowns
    document.querySelectorAll('.history-dropdown').forEach(d => {
        const originalParent = d.closest('.history-item');
        closeDropdown(d, originalParent);
    });

    // Close user dropdown
    const userDropdown = document.getElementById('userDropdown');
    if (userDropdown && !userDropdown.classList.contains('hidden')) {
        userDropdown.classList.remove('visible');
        userDropdown.classList.add('closing');
        setTimeout(() => {
            userDropdown.classList.add('hidden');
            userDropdown.classList.remove('closing');
            if (isMobile() && userDropdown.parentElement === document.body) {
                const userInfoSidebar = document.getElementById('userInfoSidebar');
                if (userInfoSidebar) userInfoSidebar.appendChild(userDropdown);
            }
        }, 150);
    }

    // Close other dropdowns by finding them via class
    const panels = [
        'controlPanelDropdown',
        'imageUploadDropdown',
        'aiSettingsPanel'
    ];
    panels.forEach(id => {
        const panel = document.getElementById(id);
        if (panel && !panel.classList.contains('hidden')) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.add('hidden');
                panel.classList.remove('closing');
            }, 150);
        }
    });

    // Hide overlay
    if (dropdownOverlay) {
        dropdownOverlay.classList.remove('visible');
    }
};

// Helper function to close modal with animation
export const closeModal = (modal) => {
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
    }, 200); // Match animation duration
};

// Helper to scroll chat to bottom
export const scrollToBottom = () => {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
};

/**
 * Helper to format message timestamp
 * @param {number|string|Date} timestamp
 * @returns {{short: string, full: string}}
 */
export const formatMessageTime = (timestamp) => {
    if (!timestamp) return { short: '', full: '' };
    const date = new Date(timestamp);

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();

    const fullStr = `${year}年${month}月${day}日 ${hours}時${minutes}分`;

    const now = new Date();
    const isToday = date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (isToday) {
        return { short: `${hours}時${minutes}分`, full: fullStr };
    } else {
        return { short: `${month}月${day}日`, full: fullStr };
    }
};

/**
 * Check system status and show maintenance overlay if needed
 */
export const checkSystemStatus = async (questionInput = null) => {
    try {
        const res = await fetch('/api/system-status');
        if (!res.ok) return;
        const status = await res.json();

        if (!status.isHealthy) {
            const overlay = document.getElementById('maintenanceOverlay');
            const reasonEl = document.getElementById('maintenanceReason');
            if (overlay && reasonEl) {
                reasonEl.textContent = status.reason || '不明なエラーが発生しています。';
                overlay.classList.remove('hidden');
                if (questionInput) questionInput.disabled = true;
            }
        }
    } catch (e) {
        console.error('Failed to check system status', e);
    }
};
