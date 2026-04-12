/**
 * state.js - Global Application State
 * Extracted from script.js lines 39-80
 */

import {
    VOICE_AUTO_PLAY_DEFAULT,
    VOICEVOX_DEFAULT_SPEAKER
} from './constants.js';

export const state = {
    isLoading: false,
    abortController: null,
    currentRequestId: null,
    currentSessionId: null,
    currentAnswer: '',
    history: [], // Array of { id, title, timestamp }
    historySearchQuery: '', // Search query for history
    isPro: false, // Track Pro status
    isLoggedIn: null, // Track login status for history management (null = unknown)
    userId: null, // Current user ID
    username: null, // Current username
    selectedImage: null, // File object for selected image
    imageDataUrl: null, // Base64 data URL of selected image
    dataSettings: { saveText: true, saveImage: true }, // Data saving settings (Default: save, OFF state)
    voiceSettings: {
        autoPlay: VOICE_AUTO_PLAY_DEFAULT,
        speaker: VOICEVOX_DEFAULT_SPEAKER,
        available: false,
        continuousMode: false // Track if user manually started recording
    }, // Voice settings
    isRecording: false, // Voice input recording state
    currentAudio: null, // Currently playing audio
    voiceQueue: [], // Queue of sentences to synthesize
    isProcessingVoice: false, // Flag to prevent concurrent processing
    isOwner: true, // Track if current user is owner of session
    isPublic: false, // Track if session is public
    expiresAt: null, // Track session expiration
    isPreviewMode: false, // Track if viewing a shared session in read-only mode
    shortUrl: null,
    pinnedChats: [], // Pinned chats list
    tags: [], // Available tags
    currentChatTags: [], // Current chat's tags
    collapsedSections: {}, // Track collapsed sections (pinned, history, tags)
    historyDisplayLimit: 10, // Limit for initial history display
    expandedCommentIds: new Set(), // Track expanded blog comment IDs
    selectedTools: [], // Array of selected tool IDs
    recentlyUsedTools: [], // Array of recently used tool IDs
    hiddenTools: [], // Array of tool IDs to hide from sub-menu
    skipToolHideConfirm: false, // Whether to skip the hide confirmation modal
    availableThemes: [], // List of themes from themes.json
    appConfig: null // { siteTitle, metaDescription, metaKeywords, suggestionCards, navExtensions, pro } from GET /api/app/config
};
