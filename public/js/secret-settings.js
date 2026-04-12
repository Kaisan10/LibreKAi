/**
 * Secret Settings module
 * ロゴ長押しで開く隠し設定（ズーム・回転）
 */
import { closeModal } from './utils.js';

// DOM参照（initで設定）
let secretSettingsModal = null;
let secretZoomSlider = null;
let secretZoomValue = null;
let secretRotateSelect = null;
let alertModal = null;
let alertTitle = null;
let alertMessage = null;
let alertOkBtn = null;

const applySecretSettings = (zoom, rotate) => {
    // Use CSS zoom directly - this is exactly what the user wants
    // zoom 150% = everything 1.5x bigger, viewport adjusts automatically
    const zoomValue = zoom / 100;

    // Reset body styles first
    document.body.style.transform = '';
    document.body.style.transformOrigin = '';
    document.body.style.width = '';
    document.body.style.height = '';

    // Apply zoom to html element for proper viewport scaling
    document.documentElement.style.zoom = zoomValue;

    // Handle rotation with proper sizing for landscape orientations
    const isLandscape = rotate === 90 || rotate === 270;
    const appContainer = document.querySelector('.app-container');

    if (appContainer) {
        if (isLandscape) {
            // For landscape: swap width/height and adjust position
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            appContainer.style.width = `${vh}px`;
            appContainer.style.height = `${vw}px`;
            appContainer.style.transform = `rotate(${rotate}deg)`;

            if (rotate === 90) {
                appContainer.style.transformOrigin = 'top left';
                appContainer.style.position = 'absolute';
                appContainer.style.top = '0';
                appContainer.style.left = `${vh}px`;
            } else { // 270
                appContainer.style.transformOrigin = 'top left';
                appContainer.style.position = 'absolute';
                appContainer.style.top = `${vw}px`;
                appContainer.style.left = '0';
            }
        } else {
            // For portrait: normal sizing
            appContainer.style.width = '';
            appContainer.style.height = '';
            appContainer.style.position = '';
            appContainer.style.top = '';
            appContainer.style.left = '';
            appContainer.style.transform = rotate === 180 ? 'rotate(180deg)' : '';
            appContainer.style.transformOrigin = rotate === 180 ? 'center center' : '';
        }
    }

    // Always hide overflow
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    if (secretZoomValue) secretZoomValue.textContent = `${zoom}%`;
};

const loadSecretSettings = () => {
    const saved = localStorage.getItem('ka_secret_settings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            if (secretZoomSlider) secretZoomSlider.value = settings.zoom || 100;
            if (secretRotateSelect) secretRotateSelect.value = settings.rotate || 0;
            applySecretSettings(settings.zoom || 100, settings.rotate || 0);
        } catch (e) {
            console.error('Failed to load secret settings', e);
        }
    }
};

/**
 * Initialize secret settings module
 * @param {Object} elements - DOM element references
 */
export function initSecretSettings(elements) {
    secretSettingsModal = elements.secretSettingsModal || document.getElementById('secretSettingsModal');
    secretZoomSlider = elements.secretZoomSlider || document.getElementById('secretZoomSlider');
    secretZoomValue = elements.secretZoomValue || document.getElementById('secretZoomValue');
    secretRotateSelect = elements.secretRotateSelect || document.getElementById('secretRotateSelect');
    alertModal = elements.alertModal;
    alertTitle = elements.alertTitle;
    alertMessage = elements.alertMessage;
    alertOkBtn = elements.alertOkBtn;

    // Long press logic for logo
    let logoPressTimer = null;
    const LOGO_LONG_PRESS_DURATION = 2000; // 2 seconds

    const handleLogoPressStart = (e) => {
        // Only trigger on actual logo images
        if (!e.target.classList.contains('logo-img')) return;

        clearTimeout(logoPressTimer);
        logoPressTimer = setTimeout(() => {
            if (secretSettingsModal) {
                secretSettingsModal.classList.remove('hidden');
            }
        }, LOGO_LONG_PRESS_DURATION);
    };

    const handleLogoPressEnd = () => {
        clearTimeout(logoPressTimer);
    };

    // Add listeners to document to catch all current and future .logo-img elements
    document.addEventListener('mousedown', handleLogoPressStart);
    document.addEventListener('touchstart', handleLogoPressStart, { passive: true });
    document.addEventListener('mouseup', handleLogoPressEnd);
    document.addEventListener('touchend', handleLogoPressEnd);
    document.addEventListener('mouseleave', handleLogoPressEnd);

    if (secretZoomSlider) {
        secretZoomSlider.addEventListener('input', () => {
            if (secretZoomValue) secretZoomValue.textContent = `${secretZoomSlider.value}%`;
        });
    }

    const closeSecretSettingsBtn = document.getElementById('closeSecretSettingsBtn');
    const resetSecretSettingsBtn = document.getElementById('resetSecretSettingsBtn');
    const saveSecretSettingsBtn = document.getElementById('saveSecretSettingsBtn');

    if (closeSecretSettingsBtn) {
        closeSecretSettingsBtn.addEventListener('click', () => {
            closeModal(secretSettingsModal);
        });
    }

    if (resetSecretSettingsBtn) {
        resetSecretSettingsBtn.addEventListener('click', () => {
            if (secretZoomSlider) secretZoomSlider.value = 100;
            if (secretRotateSelect) secretRotateSelect.value = 0;
            applySecretSettings(100, 0);
        });
    }

    let secretConfirmTimer = null;
    let previousSecretSettings = { zoom: 100, rotate: 0 };

    if (saveSecretSettingsBtn) {
        saveSecretSettingsBtn.addEventListener('click', () => {
            const zoom = parseInt(secretZoomSlider ? secretZoomSlider.value : 100);
            const rotate = parseInt(secretRotateSelect ? secretRotateSelect.value : 0);

            // Store current settings before applying
            const currentSaved = localStorage.getItem('ka_secret_settings');
            if (currentSaved) {
                try {
                    previousSecretSettings = JSON.parse(currentSaved);
                } catch (e) {
                    previousSecretSettings = { zoom: 100, rotate: 0 };
                }
            } else {
                previousSecretSettings = { zoom: 100, rotate: 0 };
            }

            // Apply new settings immediately
            applySecretSettings(zoom, rotate);
            closeModal(secretSettingsModal);

            // Show confirmation dialog
            if (alertModal && alertTitle && alertMessage && alertOkBtn) {
                // Clear any existing timer
                clearTimeout(secretConfirmTimer);

                // Start countdown timer
                let countdown = 5;
                const confirmMessage = `この設定で問題なければOKを押してください。\n${countdown}秒後に元に戻ります。`;

                alertTitle.textContent = '設定の確認';
                alertMessage.textContent = confirmMessage;
                alertModal.classList.remove('hidden');

                let countdownInterval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        alertMessage.textContent = `この設定で問題なければOKを押してください。\n${countdown}秒後に元に戻ります。`;
                    } else {
                        clearInterval(countdownInterval);
                    }
                }, 1000);

                const onOk = () => {
                    clearInterval(countdownInterval);
                    clearTimeout(secretConfirmTimer);
                    closeModal(alertModal);
                    alertOkBtn.removeEventListener('click', onOk);

                    // Save the new settings
                    const settings = { zoom: zoom, rotate: rotate };
                    localStorage.setItem('ka_secret_settings', JSON.stringify(settings));
                };

                alertOkBtn.addEventListener('click', onOk, { once: true });

                // Set timeout to revert if not confirmed
                secretConfirmTimer = setTimeout(() => {
                    clearInterval(countdownInterval);
                    closeModal(alertModal);
                    alertOkBtn.removeEventListener('click', onOk);

                    // Revert to previous settings
                    applySecretSettings(previousSecretSettings.zoom, previousSecretSettings.rotate);
                    if (secretZoomSlider) secretZoomSlider.value = previousSecretSettings.zoom;
                    if (secretRotateSelect) secretRotateSelect.value = previousSecretSettings.rotate;
                }, 5000);
            }
        });
    }

    // Call loadSecretSettings on start
    loadSecretSettings();
}
