// ============== Sanitization Utilities ==============

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} - The escaped text
 */
export const escapeHtml = (text) => {
    if (typeof text !== 'string') return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * Sanitizes user input by removing potentially dangerous content
 * @param {string} input - The input to sanitize
 * @returns {string} - The sanitized input
 */
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return '';

    // Remove any HTML tags
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

/**
 * Creates a text node safely
 * @param {string} text - The text content
 * @returns {Text} - A text node
 */
export const createSafeTextNode = (text) => {
    return document.createTextNode(text || '');
};

/**
 * Sanitizes avatar URL to prevent XSS (javascript:, data:, onerror via src, etc.)
 * Only allows https: URLs (routed via proxy) or known safe relative paths.
 * @param {string} avatarUrl - Raw avatar URL from user/comment data
 * @returns {string} - Safe URL for img src (default-avatar.svg or proxy path)
 */
export const sanitizeAvatarUrl = (avatarUrl) => {
    if (typeof avatarUrl !== 'string' || !avatarUrl.trim()) {
        return '/default-avatar.svg';
    }
    const url = avatarUrl.trim();
    const lower = url.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:') || lower.startsWith('file:')) {
        return '/default-avatar.svg';
    }
    if (url === '/default-avatar.svg' || url.startsWith('/api/proxy/avatar')) {
        return url;
    }
    if (lower.startsWith('https://')) {
        return '/api/proxy/avatar?url=' + encodeURIComponent(url);
    }
    return '/default-avatar.svg';
};
