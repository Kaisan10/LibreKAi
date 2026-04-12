/**
 * Search module
 * 検索モーダルの表示・検索実行
 */
import { escapeHtml } from './sanitize.js';
import { closeModal } from './utils.js';

// DOM参照（initで設定）
let searchModal = null;
let searchInput = null;
let searchResults = null;
let openSearchBtn = null;
let closeSearchBtn = null;
let clearSearchBtn = null;

// 外部依存関数（initで設定）
let closeMobileSidebar = null;
let loadSession = null;

let searchDebounceTimer = null;

const openSearchModal = () => {
    if (!searchModal) return;
    searchModal.classList.remove('hidden');
    if (closeMobileSidebar) closeMobileSidebar();
    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 100);
};

const closeSearchModal = () => {
    if (!searchModal) return;
    closeModal(searchModal);
    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
    if (searchResults) {
        searchResults.innerHTML = `
            <div class="search-empty-state">
                <i class="fa-solid fa-search"></i>
                <p>検索キーワードを入力してください</p>
            </div>
        `;
    }
};

const performSearch = async (query) => {
    if (!query.trim()) {
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-empty-state">
                    <i class="fa-solid fa-search"></i>
                    <p>検索キーワードを入力してください</p>
                </div>
            `;
        }
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();

        if (!searchResults) return;

        if (data.results.length === 0) {
            searchResults.innerHTML = `
                <div class="search-no-results">
                    <i class="fa-solid fa-search"></i>
                    <p>「${escapeHtml(query)}」に一致する結果が見つかりませんでした</p>
                </div>
            `;
            return;
        }

        searchResults.innerHTML = data.results.map(result => {
            const escapedPreview = escapeHtml(result.preview);
            const highlightedPreview = escapedPreview.replace(
                new RegExp(`(${escapeHtml(query)})`, 'gi'),
                '<mark>$1</mark>'
            );
            return `
                <div class="search-result-item" data-session-id="${result.sessionId}">
                    <i class="fa-solid fa-comment"></i>
                    <div class="search-result-content">
                        <div class="search-result-title">${escapeHtml(result.title)}</div>
                        <div class="search-result-preview">${highlightedPreview}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers to results
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const sessionId = item.dataset.sessionId;
                closeSearchModal();
                if (loadSession) loadSession(sessionId);
            });
        });

    } catch (error) {
        console.error('Search error:', error);
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-no-results">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>検索中にエラーが発生しました</p>
                </div>
            `;
        }
    }
};

/**
 * Initialize search module
 * @param {Object} deps - Dependencies
 * @param {Function} deps.closeMobileSidebar
 * @param {Function} deps.loadSession
 */
export function initSearch(deps) {
    closeMobileSidebar = deps.closeMobileSidebar;
    loadSession = deps.loadSession;

    searchModal = document.getElementById('searchModal');
    searchInput = document.getElementById('searchInput');
    searchResults = document.getElementById('searchResults');
    openSearchBtn = document.getElementById('openSearchBtn');
    closeSearchBtn = document.getElementById('closeSearchBtn');
    clearSearchBtn = document.getElementById('clearSearchBtn');

    // Search modal event listeners
    if (openSearchBtn) {
        openSearchBtn.addEventListener('click', openSearchModal);
    }

    if (closeSearchBtn) {
        closeSearchBtn.addEventListener('click', closeSearchModal);
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            clearSearchBtn.classList.add('hidden');
            if (searchResults) {
                searchResults.innerHTML = `
                    <div class="search-empty-state">
                        <i class="fa-solid fa-search"></i>
                        <p>検索キーワードを入力してください</p>
                    </div>
                `;
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;

            // Show/hide clear button
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle('hidden', !query);
            }

            // Debounce search
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                performSearch(query);
            }, 300);
        });
    }

    // Close search modal on overlay click
    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            if (e.target === searchModal) {
                closeSearchModal();
            }
        });
    }

    // Keyboard shortcut: Ctrl+K or Cmd+K to open search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (searchModal && searchModal.classList.contains('hidden')) {
                openSearchModal();
            } else {
                closeSearchModal();
            }
        }
    });
}
