// Theme initialization - runs before body renders to prevent flash of unstyled content
(function () {
    // Early path detection for SPA sidebar state
    const currentPath = window.location.pathname;
    if (currentPath === '/pages' || currentPath.startsWith('/pages/')) {
        document.documentElement.classList.add('is-static-page');
    }

    const STORAGE_KEY = 'kai_pro_settings';

    let colorMode = 'system';
    let theme = 'blue';

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            colorMode = settings.colorMode || 'system';
            theme = settings.theme || 'blue';
        }
    } catch (e) { }


    let actualTheme = 'dark';
    if (colorMode === 'light') actualTheme = 'light';
    else if (colorMode === 'dark') actualTheme = 'dark';
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) actualTheme = 'light';

    document.documentElement.setAttribute('data-theme', actualTheme);

    // Complete theme definitions (same as themes.js)
    const THEMES = {
        blue: {
            dark: { primary: '#3b82f6', hover: '#2563eb', primaryActive: '#1e40af', bgColor: '#0f172a', sidebarBg: '#1e293b', cardBg: '#1e293bb3', bgPrimary: '#263249', bgSecondary: '#32425c', bgHover: '#3d506e', textColor: '#f1f5f9', textMuted: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)', itemHoverBg: 'rgba(255,255,255,0.08)', secondaryColor: '#64748b', btnLoginBg: '#354155', btnLoginHover: '#46556e', proBadgeBg: '#161616', linkColor: '#7b8aff', codeBg: '#1e293b', userProfileBg: '#32425c', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b', cancelColor: '#fbbf24', modalShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.4)', cardShadow: '0 2px 8px rgba(0,0,0,0.3)' },
            light: { primary: '#3b82f6', hover: '#2563eb', primaryActive: '#1e40af', bgColor: '#ffffff', sidebarBg: '#fafbfc', cardBg: 'rgba(255,255,255,0.98)', bgPrimary: '#ddeaf8', bgSecondary: '#dfebf7', bgHover: '#e8eef4', textColor: '#1a202c', textMuted: '#4a5568', borderColor: 'rgba(0,0,0,0.1)', itemHoverBg: 'rgba(0,0,0,0.06)', secondaryColor: '#64748b', btnLoginBg: '#edf2f7', btnLoginHover: '#e2e8f0', proBadgeBg: '#f8fbff', linkColor: '#3b5998', codeBg: '#f4f6f8', userProfileBg: '#e8ecf0', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#c27803', cancelColor: '#b45309', modalShadow: '0 4px 20px rgba(0,0,0,0.08)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.08)', cardShadow: '0 2px 8px rgba(0,0,0,0.06)' }
        },
        purple: {
            dark: { primary: '#8b5cf6', hover: '#7c3aed', primaryActive: '#6d28d9', bgColor: '#0f0f1a', sidebarBg: '#1a1a2e', cardBg: '#1a1a2eb3', bgPrimary: '#2d2d4a', bgSecondary: '#3d3d5c', bgHover: '#4d4d70', textColor: '#f1f5f9', textMuted: '#a8a3b8', borderColor: 'rgba(255,255,255,0.1)', itemHoverBg: 'rgba(255,255,255,0.08)', secondaryColor: '#7c6b9b', btnLoginBg: '#3d3555', btnLoginHover: '#4e466e', proBadgeBg: '#161616', linkColor: '#a78bfa', codeBg: '#1a1a2e', userProfileBg: '#3d3d5c', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b', cancelColor: '#fbbf24', modalShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.4)', cardShadow: '0 2px 8px rgba(0,0,0,0.3)' },
            light: { primary: '#8b5cf6', hover: '#7c3aed', primaryActive: '#6d28d9', bgColor: '#ffffff', sidebarBg: '#fcfaff', cardBg: 'rgba(255,255,255,0.98)', bgPrimary: '#ede9fe', bgSecondary: '#e9e4fc', bgHover: '#ddd6fe', textColor: '#1a202c', textMuted: '#6b5b8a', borderColor: 'rgba(0,0,0,0.1)', itemHoverBg: 'rgba(0,0,0,0.06)', secondaryColor: '#7c6b9b', btnLoginBg: '#f3f0f7', btnLoginHover: '#e9e4f0', proBadgeBg: '#fdfaff', linkColor: '#7c3aed', codeBg: '#f8f6fc', userProfileBg: '#ede9fe', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#c27803', cancelColor: '#b45309', modalShadow: '0 4px 20px rgba(0,0,0,0.08)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.08)', cardShadow: '0 2px 8px rgba(0,0,0,0.06)' }
        },
        green: {
            dark: { primary: '#10b981', hover: '#059669', primaryActive: '#047857', bgColor: '#0a1f1a', sidebarBg: '#132f27', cardBg: '#132f27b3', bgPrimary: '#1a3d32', bgSecondary: '#264a3f', bgHover: '#2f5a4c', textColor: '#f1f5f9', textMuted: '#8ab8a8', borderColor: 'rgba(255,255,255,0.1)', itemHoverBg: 'rgba(255,255,255,0.08)', secondaryColor: '#5b9b8c', btnLoginBg: '#1f4a3f', btnLoginHover: '#2a5b4e', proBadgeBg: '#161616', linkColor: '#34d399', codeBg: '#132f27', userProfileBg: '#264a3f', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b', cancelColor: '#fbbf24', modalShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.4)', cardShadow: '0 2px 8px rgba(0,0,0,0.3)' },
            light: { primary: '#10b981', hover: '#059669', primaryActive: '#047857', bgColor: '#ffffff', sidebarBg: '#f0fdf9', cardBg: 'rgba(255,255,255,0.98)', bgPrimary: '#d1fae5', bgSecondary: '#dcfce7', bgHover: '#bbf7d0', textColor: '#1a202c', textMuted: '#4a6858', borderColor: 'rgba(0,0,0,0.1)', itemHoverBg: 'rgba(0,0,0,0.06)', secondaryColor: '#5b9b8c', btnLoginBg: '#e6f7f2', btnLoginHover: '#d4f0e8', proBadgeBg: '#f0fdf9', linkColor: '#059669', codeBg: '#ecfdf5', userProfileBg: '#d1fae5', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#c27803', cancelColor: '#b45309', modalShadow: '0 4px 20px rgba(0,0,0,0.08)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.08)', cardShadow: '0 2px 8px rgba(0,0,0,0.06)' }
        },
        orange: {
            dark: { primary: '#f59e0b', hover: '#d97706', primaryActive: '#b45309', bgColor: '#1a150a', sidebarBg: '#2b2213', cardBg: '#2b2213b3', bgPrimary: '#3d3019', bgSecondary: '#4a3b1f', bgHover: '#5c4a28', textColor: '#f1f5f9', textMuted: '#b8a894', borderColor: 'rgba(255,255,255,0.1)', itemHoverBg: 'rgba(255,255,255,0.08)', secondaryColor: '#9b8b5b', btnLoginBg: '#4a3b1f', btnLoginHover: '#5c4a28', proBadgeBg: '#161616', linkColor: '#fbbf24', codeBg: '#2b2213', userProfileBg: '#4a3b1f', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b', cancelColor: '#fbbf24', modalShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.4)', cardShadow: '0 2px 8px rgba(0,0,0,0.3)' },
            light: { primary: '#f59e0b', hover: '#d97706', primaryActive: '#b45309', bgColor: '#ffffff', sidebarBg: '#fffbf0', cardBg: 'rgba(255,255,255,0.98)', bgPrimary: '#fef3c7', bgSecondary: '#fef9c3', bgHover: '#fde68a', textColor: '#1a202c', textMuted: '#8a6b4a', borderColor: 'rgba(0,0,0,0.1)', itemHoverBg: 'rgba(0,0,0,0.06)', secondaryColor: '#9b8b5b', btnLoginBg: '#fef6e0', btnLoginHover: '#fdecc7', proBadgeBg: '#fffef5', linkColor: '#b45309', codeBg: '#fefce8', userProfileBg: '#fef3c7', successColor: '#10b981', errorColor: '#ef4444', warningColor: '#c27803', cancelColor: '#b45309', modalShadow: '0 4px 20px rgba(0,0,0,0.08)', dropdownShadow: '0 4px 12px rgba(0,0,0,0.08)', cardShadow: '0 2px 8px rgba(0,0,0,0.06)' }
        }
    };

    const colors = (THEMES[theme] || THEMES.blue)[actualTheme];
    const root = document.documentElement;

    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--primary-hover', colors.hover);
    root.style.setProperty('--primary-color-active', colors.primaryActive);
    root.style.setProperty('--secondary-color', colors.secondaryColor);
    root.style.setProperty('--bg-color', colors.bgColor);
    root.style.setProperty('--sidebar-bg', colors.sidebarBg);
    root.style.setProperty('--card-bg', colors.cardBg);
    root.style.setProperty('--bg-primary', colors.bgPrimary);
    root.style.setProperty('--bg-secondary', colors.bgSecondary);
    root.style.setProperty('--bg-hover', colors.bgHover);
    root.style.setProperty('--text-color', colors.textColor);
    root.style.setProperty('--text-muted', colors.textMuted);
    root.style.setProperty('--border-color', colors.borderColor);
    root.style.setProperty('--item-hover-bg', colors.itemHoverBg);
    root.style.setProperty('--success-color', colors.successColor);
    root.style.setProperty('--error-color', colors.errorColor);
    root.style.setProperty('--warning-color', colors.warningColor);
    root.style.setProperty('--cancel-color', colors.cancelColor);
    root.style.setProperty('--btn-login-bg', colors.btnLoginBg);
    root.style.setProperty('--btn-login-hover', colors.btnLoginHover);
    root.style.setProperty('--pro-badge-bg', colors.proBadgeBg);
    root.style.setProperty('--link-color', colors.linkColor);
    root.style.setProperty('--code-bg', colors.codeBg);
    root.style.setProperty('--user-profile-bg', colors.userProfileBg);
    root.style.setProperty('--modal-shadow', colors.modalShadow);
    root.style.setProperty('--dropdown-shadow', colors.dropdownShadow);
    root.style.setProperty('--card-shadow', colors.cardShadow);

    document.documentElement.classList.add('theme-ready');
})();
