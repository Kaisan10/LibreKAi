import { state } from './state.js';
import { escapeHtml } from './sanitize.js';
import { closeMobileSidebar, showSidebarHistory } from './sidebar.js';

// --- Tag ID Mapping Helper ---
export const getTagMappings = () => {
    const allTagsSet = new Set();
    state.history.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => allTagsSet.add(tag));
        }
    });
    const sortedTags = Array.from(allTagsSet).sort();
    const nameToId = {};
    const idToName = {};
    sortedTags.forEach((name, index) => {
        const id = (index + 1).toString();
        nameToId[name] = id;
        idToName[id] = name;
    });
    return { nameToId, idToName };
};

import { closeModal } from './utils.js';

let loadingDiv = null;
let chatContainer = null;
let staticPageContainer = null;
let inputWrapper = null;
let tagDropdown = null;

// Dependencies
let loadSession = null;
let showAlert = null;
let renderHistory = null;

const availableTagsCache = [];

export const initTags = (elements, deps) => {
    loadingDiv = elements.loadingDiv;
    chatContainer = elements.chatContainer;
    staticPageContainer = elements.staticPageContainer;
    inputWrapper = elements.inputWrapper;
    tagDropdown = elements.tagDropdown;

    loadSession = deps.loadSession;
    showAlert = deps.showAlert;
    renderHistory = deps.renderHistory;
};

// Get color for tag
export const getTagColor = (tag) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const saturation = 65 + (Math.abs(hash >> 8) % 15); // 65-80%
    return { h: hue, s: saturation };
};

export const loadAvailableTags = async () => {
    if (availableTagsCache.length > 0) return availableTagsCache;

    try {
        const response = await fetch('/api/tags');
        if (!response.ok) throw new Error('Failed to fetch tags');
        const data = await response.json();
        availableTagsCache.push(...data.tags);
        return data.tags;
    } catch (error) {
        console.error('Failed to load tags:', error);
        // Fallback tags
        const defaultTags = ['マイクラ', 'コマンド', '建築', 'ゲーム', '雑談', 'その他'];
        availableTagsCache.push(...defaultTags);
        return defaultTags;
    }
};

// Update tags section visibility in sidebar
export const updateTagsSection = () => {
    const tagsContainer = document.getElementById('tagsContainer');
    const tagsList = document.getElementById('tagsList');
    if (!tagsContainer || !tagsList) return;

    const allTags = {};
    state.history.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => {
                if (!allTags[tag]) allTags[tag] = 0;
                allTags[tag]++;
            });
        }
    });

    const tagNames = Object.keys(allTags);

    if (tagNames.length === 0) {
        tagsContainer.classList.add('hidden');
    } else {
        tagsContainer.classList.remove('hidden');
        tagsList.innerHTML = '';
        tagNames.forEach(tagName => {
            const count = allTags[tagName];
            const div = document.createElement('div');
            div.className = 'tag-item';
            div.innerHTML = `
                <span class="tag-name">${escapeHtml(tagName)}</span>
                <span class="tag-count">${count}</span>
            `;
            div.addEventListener('click', () => {
                const { nameToId } = getTagMappings();
                const tagId = nameToId[tagName];

                // Filter history by tag
                const filteredChats = state.history.filter(item =>
                    item.tags && item.tags.includes(tagName)
                );

                // Show tag tree view
                showTagTreeView(tagName, filteredChats, true);
                closeMobileSidebar();
            });
            tagsList.appendChild(div);
        });
    }
};

// Update tags display in header
export const updateHeaderTagsDisplay = () => {
    const desktopTagsDisplay = document.getElementById('desktopTagsDisplay');
    const mobileChatTitle = document.getElementById('mobileChatTitle');
    const chatTitle = document.getElementById('chatTitle');

    // Update desktop tags badges
    if (desktopTagsDisplay) {
        desktopTagsDisplay.innerHTML = '';
        if (state.currentChatTags && state.currentChatTags.length > 0) {
            state.currentChatTags.forEach(tag => {
                const badge = document.createElement('div');
                badge.className = 'tag-badge-header';
                const colors = getTagColor(tag);
                badge.style.setProperty('--tag-hue', colors.h);
                badge.style.setProperty('--tag-saturation', colors.s + '%');

                const textSpan = document.createElement('span');
                textSpan.textContent = tag;
                badge.appendChild(textSpan);

                if (state.isOwner) {
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn-remove-tag-header';
                    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                    removeBtn.title = 'タグを削除';
                    removeBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const newTags = state.currentChatTags.filter(t => t !== tag);
                        await saveTagsToSession(state.currentSessionId, newTags);
                        // If dropdown is open, re-render it
                        if (tagDropdown && !tagDropdown.classList.contains('hidden')) {
                            loadTagDropdown(state.currentSessionId, state.currentChatTags);
                        }
                    });
                    badge.appendChild(removeBtn);
                }
                desktopTagsDisplay.appendChild(badge);
            });
        }
    }

    // Update mobile title to match desktop title
    if (mobileChatTitle && chatTitle) {
        mobileChatTitle.textContent = chatTitle.textContent;
    }
};

export const saveTagsToSession = async (sessionId, tags) => {
    // Handle "New Chat" where session doesn't exist yet
    if (!sessionId) {
        state.currentChatTags = tags;
        updateHeaderTagsDisplay();
        return;
    }

    try {
        const res = await fetch(`/api/session/${sessionId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: tags })
        });
        if (!res.ok) throw new Error('Failed to save tags');
        const historyItem = state.history.find(h => h.id === sessionId);
        if (historyItem) historyItem.tags = tags;
        state.currentChatTags = tags;
        updateHeaderTagsDisplay();
        if (renderHistory) renderHistory();
        updateTagsSection();
    } catch (error) {
        console.error('Failed to save tags:', error);
    }
};

export const showTagManagementModal = async (sessionId, currentTags = []) => {
    const modal = document.getElementById('tagManagementModal');
    const availableList = document.getElementById('availableTagsList');
    const selectedList = document.getElementById('selectedTagsList');
    const tagSearchInput = document.getElementById('tagSearchInput');
    const newTagInput = document.getElementById('newTagInput');
    const createTagBtn = document.getElementById('createTagBtn');
    const saveTagsBtn = document.getElementById('saveTagsBtn');
    const cancelBtn = document.getElementById('cancelTagManagementBtn');
    const closeBtn = document.getElementById('closeTagManagementBtn');

    if (!modal) return;

    const availableTags = await loadAvailableTags();
    const selectedTags = [...currentTags];
    let filteredTags = [...availableTags];

    const renderTags = () => {
        // Render available tags
        availableList.innerHTML = '';
        filteredTags.forEach(tag => {
            if (selectedTags.includes(tag)) return; // Don't show selected tags in available list
            const badge = document.createElement('div');
            badge.className = 'tag-badge';
            badge.textContent = tag;
            const colors = getTagColor(tag);
            badge.style.setProperty('--tag-hue', colors.h);
            badge.style.setProperty('--tag-saturation', colors.s + '%');
            badge.addEventListener('click', () => {
                selectedTags.push(tag);
                renderTags();
                updateTagsInSession();
            });
            availableList.appendChild(badge);
        });

        // Render selected tags
        selectedList.innerHTML = '';
        if (selectedTags.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'tags-empty-message';
            emptyMsg.textContent = 'タグが選択されていません';
            selectedList.appendChild(emptyMsg);
        } else {
            selectedTags.forEach(tag => {
                const badge = document.createElement('div');
                badge.className = 'tag-badge selected';
                const colors = getTagColor(tag);
                badge.style.setProperty('--tag-hue', colors.h);
                badge.style.setProperty('--tag-saturation', colors.s + '%');
                badge.innerHTML = `${escapeHtml(tag)} <button class="btn-remove-tag"><i class="fa-solid fa-xmark"></i></button>`;
                badge.querySelector('.btn-remove-tag').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = selectedTags.indexOf(tag);
                    selectedTags.splice(idx, 1);
                    renderTags();
                    updateTagsInSession();
                });
                selectedList.appendChild(badge);
            });
        }
    };

    const updateTagsInSession = () => {
        // Update inline for mobile bottom sheet or dropdown
        const dropdownSelected = document.getElementById('tagDropdownSelectedList');
        if (dropdownSelected) {
            dropdownSelected.innerHTML = '';
            selectedTags.forEach(tag => {
                const badge = document.createElement('div');
                badge.className = 'tag-badge-inline selected';
                const colorData = getTagColor(tag);
                badge.style.setProperty('--tag-hue', colorData.h);
                badge.style.setProperty('--tag-saturation', colorData.s + '%');
                badge.innerHTML = `${escapeHtml(tag)} <button class="btn-remove-tag-inline"><i class="fa-solid fa-xmark"></i></button>`;
                badge.querySelector('.btn-remove-tag-inline').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = selectedTags.indexOf(tag);
                    selectedTags.splice(idx, 1);
                    renderTags();
                    updateTagsInSession();
                });
                dropdownSelected.appendChild(badge);
            });
        }
    };

    // Search functionality
    if (tagSearchInput) {
        tagSearchInput.value = '';
        tagSearchInput.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            filteredTags = availableTags.filter(tag => tag.toLowerCase().includes(query));
            renderTags();
        };
    }

    // Create tag functionality
    if (createTagBtn && newTagInput) {
        createTagBtn.onclick = async () => {
            const rawInput = newTagInput.value.trim();
            if (!rawInput) return;

            // Split by half-width or full-width comma
            const tagNames = rawInput.split(/[,、]/).map(t => t.trim()).filter(t => t !== '');

            if (tagNames.length === 0) return;

            let addedCount = 0;
            for (const tagName of tagNames) {
                if (tagName.length > 20) {
                    if (showAlert) showAlert('エラー', `タグ名「${tagName}」が長すぎます（最大20文字）`);
                    continue;
                }
                if (availableTags.includes(tagName)) {
                    continue; // Skip existing
                }
                try {
                    const res = await fetch('/api/tags', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tagName })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        availableTags.push(data.tagName);
                        availableTagsCache.push(data.tagName);
                        addedCount++;
                    }
                } catch (error) {
                    console.error('Failed to create tag:', tagName, error);
                }
            }

            if (addedCount > 0) {
                filteredTags = [...availableTags];
                newTagInput.value = '';
                renderTags();
            } else if (tagNames.every(t => availableTags.includes(t))) {
                newTagInput.value = '';
            }
        };
    }

    renderTags();

    saveTagsBtn.onclick = async () => {
        await saveTagsToSession(sessionId, selectedTags);
        closeModal(modal);
    };

    cancelBtn.onclick = () => closeModal(modal);
    closeBtn.onclick = () => closeModal(modal);
    modal.classList.remove('hidden');
};

// Load tag dropdown (for desktop only)
export const loadTagDropdown = async (sessionId, currentTags = []) => {
    const availableList = document.getElementById('tagDropdownAvailableList');
    const selectedList = document.getElementById('tagDropdownSelectedList');
    const searchInput = document.getElementById('tagDropdownSearch');

    if (!availableList) return;

    const availableTags = await loadAvailableTags();
    let selectedTags = [...currentTags];
    let filteredTags = [...availableTags];

    const renderDropdownTags = () => {
        // Render available
        availableList.innerHTML = '';
        filteredTags.forEach(tag => {
            if (selectedTags.includes(tag)) return;
            const badge = document.createElement('div');
            badge.className = 'tag-badge-dropdown';
            badge.textContent = tag;
            const colorData = getTagColor(tag);
            badge.style.setProperty('--tag-hue', colorData.h);
            badge.style.setProperty('--tag-saturation', colorData.s + '%');
            badge.addEventListener('click', async () => {
                selectedTags.push(tag);
                await saveTagsToSession(sessionId, selectedTags);
                renderDropdownTags();
            });
            availableList.appendChild(badge);
        });

        // Render selected
        if (selectedList) {
            selectedList.innerHTML = '';
            selectedTags.forEach(tag => {
                const badge = document.createElement('div');
                badge.className = 'tag-badge-inline selected';
                const colorData = getTagColor(tag);
                badge.style.setProperty('--tag-hue', colorData.h);
                badge.style.setProperty('--tag-saturation', colorData.s + '%');
                badge.innerHTML = `${escapeHtml(tag)} <button class="btn-remove-tag-inline"><i class="fa-solid fa-xmark"></i></button>`;
                badge.querySelector('.btn-remove-tag-inline').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    selectedTags = selectedTags.filter(t => t !== tag);
                    await saveTagsToSession(sessionId, selectedTags);
                    renderDropdownTags();
                });
                selectedList.appendChild(badge);
            });
        }
    };

    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            filteredTags = availableTags.filter(tag => tag.toLowerCase().includes(query));
            renderDropdownTags();
        };
    }

    renderDropdownTags();
};

// Show tag tree view (similar to /pages tree)
export const showTagTreeView = (tagName, filteredChats, shouldPushState = true) => {
    const { nameToId } = getTagMappings();
    const tagId = nameToId[tagName];

    if (shouldPushState) {
        window.history.pushState({}, '', `/tags/${tagId}`);
    }

    // Hide chat UI and show static page container
    if (chatContainer) chatContainer.style.display = 'none';
    if (inputWrapper) inputWrapper.style.display = 'none';

    if (staticPageContainer) {
        staticPageContainer.classList.remove('hidden');

        const renderListView = (chats, query = '') => {
            const listContainer = staticPageContainer.querySelector('.page-list-container');
            if (!listContainer) return;

            const filtered = query
                ? chats.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
                : chats;

            if (filtered.length === 0) {
                listContainer.innerHTML = '<div class="page-nav-empty">該当する会話がありません</div>';
            } else {
                listContainer.innerHTML = filtered.map(chat => `
                    <div class="page-nav-item" data-session-id="${chat.id}" style="cursor: pointer;">
                        <i class="fa-solid fa-comment"></i>
                        <span>${escapeHtml(chat.title)}</span>
                    </div>
                `).join('');

                // Add click handlers
                listContainer.querySelectorAll('.page-nav-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const sessionId = item.dataset.sessionId;
                        // Show chat UI and load session
                        if (chatContainer) chatContainer.style.display = '';
                        if (inputWrapper) inputWrapper.style.display = '';
                        staticPageContainer.classList.add('hidden');
                        if (loadSession) loadSession(sessionId);
                        closeMobileSidebar();
                    });
                });
            }
        };

        staticPageContainer.innerHTML = `
            <div class="static-page-content tag-tree-page">
                <div class="page-header tag-header">
                    <div class="tag-header-title">
                        <h1><i class="fa-solid fa-tag"></i> ${escapeHtml(tagName)}</h1>
                        <p class="page-desc">${filteredChats.length}件の会話</p>
                    </div>
                    <div class="tag-search-container">
                        <div class="tag-search-input-wrapper">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            <input type="text" id="tagConversationSearch" placeholder="会話を検索..." />
                        </div>
                    </div>
                </div>
                <div class="page-list-container">
                    <!-- List items will be rendered here -->
                </div>
            </div>
        `;

        const searchInput = document.getElementById('tagConversationSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                renderListView(filteredChats, e.target.value);
            });
        }

        renderListView(filteredChats);
    }

    // Update sidebar visibility - Keep chat history sidebar
    if (showSidebarHistory) showSidebarHistory();
    closeMobileSidebar();

    // Do NOT add is-static-page class because we want to keep the chat history sidebar
    document.documentElement.classList.remove('is-static-page');
};
