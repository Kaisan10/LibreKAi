// ============== UI Constants ==============
export const MAX_QUESTION_LENGTH = 200;
export const MAX_TEXTAREA_HEIGHT = 200;
export const CHAR_WARNING_THRESHOLD = 160;
export const CHAR_DANGER_THRESHOLD = 190;
export const MAX_HISTORY_ITEMS = 50;
export const HISTORY_TITLE_MAX_LENGTH = 30;
export const HISTORY_WARNING_THRESHOLD = 18;
export const COPY_SUCCESS_DISPLAY_TIME = 2000;
export const AUTO_UPGRADE_CHECK_DELAY = 1000;

// ============== Storage Keys ==============
export const STORAGE_KEY_HISTORY = 'kai_chat_history';
export const STORAGE_KEY_VISITED = 'kai_has_visited';
export const STORAGE_KEY_PRO_SETTINGS = 'kai_pro_settings';

// ============== Status Colors ==============
export const COLOR_MUTED = '#94a3b8';
export const COLOR_WARNING = '#f59e0b';
export const COLOR_DANGER = '#ef4444';

// ============== Default Pro Settings ==============
export const DEFAULT_PRO_SETTINGS = {
    systemPrompt: '',
    temperature: 0.3,
    top_p: 0.85,
    theme: 'blue',
    colorMode: 'system',
    customThemeId: 'default'
};

// ============== Voice Settings ==============
export const VOICE_RECOGNITION_LANG = 'ja-JP';
export const VOICE_MAX_ALTERNATIVES = 1;
export const VOICE_AUTO_PLAY_DEFAULT = true;
export const VOICEVOX_DEFAULT_SPEAKER = 2; // 四国めたん (ノーマル)

// ============== Theme Definitions ==============
// Import from unified themes.js
export { THEMES, applyThemeVariables, getPreferredColorMode } from './themes.js';
