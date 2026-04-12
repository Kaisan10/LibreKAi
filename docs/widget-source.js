/**
 * KAi Embedded Widget
 * 外部サイト用埋め込みチャットウィジェット
 * 
 * KAiのProに入ってる人しか自分のサイトで使えないよ！もしかしてこれを見て無理やり使おうと思った？やめなさいませ
 * まあでもProプランはポイント使うだけでできるもんね、悪用対策って、大事なんですよ。
 */
(function () {
    'use strict';

    // Read widget script tag and optional embedded API key (data-api-key)
    const scriptTag = document.currentScript || document.querySelector('script[src*="widget.js"]');
    const scriptSrc = scriptTag ? scriptTag.src : '';

    // Configuration
    const API_BASE_URL = scriptSrc.split('/embedded/')[0] || window.location.origin;
    const API_URL = `${API_BASE_URL}/api/embedded/ask`;
    const EMBEDDED_API_KEY = (scriptTag?.dataset.apiKey || '').trim();
    if (!EMBEDDED_API_KEY) {
        console.warn('[KAi Widget] data-api-key is not set. This will stop working after the migration grace period.');
    }

    // Position settings from data attributes
    const config = {
        desktop: scriptTag?.dataset.positionDesktop || 'bottom-right',
        mobile: scriptTag?.dataset.positionMobile || 'bottom-right',
        offsetXDesktop: scriptTag?.dataset.offsetXDesktop || '20px',
        offsetYDesktop: scriptTag?.dataset.offsetYDesktop || '20px',
        offsetXMobile: scriptTag?.dataset.offsetXMobile || '20px',
        offsetYMobile: scriptTag?.dataset.offsetYMobile || '20px'
    };

    // Widget state
    let isOpen = false;
    let isProcessing = false;
    let shadowRoot = null;
    let currentSessionId = null; // Session for history persistence

    // Create widget HTML structure
    function createWidget() {
        const host = document.createElement('div');
        host.id = 'kai-widget-host';
        host.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 2147483647; /* Max z-index */
            pointer-events: none; /* Let clicks pass through */
            overflow: hidden;
        `;
        document.body.appendChild(host);

        shadowRoot = host.attachShadow({ mode: 'open' }); // Open for debugging

        const style = document.createElement('style');
        style.textContent = `
            :host {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                line-height: 1.5;
            }
            * {
                box-sizing: border-box;
            }
            .widget-container {
                position: absolute;
                display: flex;
                flex-direction: column;
                pointer-events: auto; /* Re-enable clicks for widget */
                transition: all 0.3s ease;
            }
            .toggle-btn {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: none;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                margin: 0;
            }
            .toggle-btn svg {
                border: none;
                box-shadow: 0 4px 12px rgba(76, 0, 255, 0.15);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                transition: transform 0.2s, box-shadow 0.2s;
                padding: 0;
                margin: 0;
                border-radius: 6px;
            }
            .toggle-btn svg:hover {
                box-shadow: 0 6px 16px rgba(76, 0, 255, 0.25);
            }
            .chat-window {
                display: none;
                position: absolute;
                width: 380px;
                max-width: calc(100vw - 40px);
                height: 600px;
                max-height: calc(100vh - 100px);
                background: white;
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(76, 0, 255, 0.05);
                flex-direction: column;
                overflow: hidden;
                animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid rgba(76, 0, 255, 0.1);
            }
            .chat-window.open {
                display: flex;
            }
            @keyframes slideIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
            .header {
                background: #242424;
                color: white;
                padding: 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .header-title {
                font-weight: 600;
                font-size: 16px;
                margin-bottom: 2px;
            }
            .header-subtitle {
                font-size: 12px;
                opacity: 0.9;
            }
            .close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                padding: 0;
                transition: background 0.2s;
            }
            .close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            .messages {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f8f9fa;
                scroll-behavior: smooth;
            }
            .message-row {
                margin-bottom: 16px;
                display: flex;
            }
            .message-row.user {
                justify-content: flex-end;
            }
            .message-row.bot {
                justify-content: flex-start;
            }
            .bubble {
                max-width: 80%;
                padding: 12px 16px;
                border-radius: 16px;
                font-size: 14px;
                line-height: 1.5;
                word-wrap: break-word;
                white-space: pre-wrap;
            }
            .message-row.user .bubble {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-bottom-right-radius: 4px;
            }
            .message-row.bot .bubble {
                background: white;
                color: #212529;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                border-bottom-left-radius: 4px;
            }
            .input-area {
                padding: 16px;
                background: white;
                border-top: 1px solid #e9ecef;
            }
            .input-group {
                display: flex;
                gap: 8px;
            }
            textarea {
                flex: 1;
                padding: 12px;
                border: 1px solid #dee2e6;
                border-radius: 22px;
                resize: none;
                font-family: inherit;
                font-size: 14px;
                max-height: 100px;
                min-height: 44px;
                outline: none;
                transition: border-color 0.2s;
                overflow: hidden;
            }
            textarea:focus {
                border-color: #667eea;
            }
            .send-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                background: #242424;
                color: white;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                transition: opacity 0.2s;
                width: 44px;
                height: 44px;
            }
            .send-btn:hover {
                opacity: 0.9;
            }
            .send-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .welcome {
                text-align: center;
                padding: 32px 16px;
                color: #6c757d;
            }
            .welcome-emoji {
                display: flex;
                justify-content: center;
                margin-bottom: 16px;
                color: #667eea;
            }
            .welcome-emoji svg {
                width: 48px;
                height: 48px;
            }
            .typing-dots {
                display: flex;
                gap: 4px;
                padding: 4px;
            }
            .dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #667eea;
                animation: bounce 1.4s infinite;
            }
            .dot:nth-child(2) { animation-delay: 0.2s; }
            .dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes bounce {
                0%, 80%, 100% { transform: scale(0); }
                40% { transform: scale(1); }
            }

            @media (max-width: 480px) {
                .widget-container {
                    bottom: 0px;
                    right: 0px;
                    width: 100%;
                    height: 100%;
                    z-index: 99999;
                    pointer-events: none;
                }
                .widget-container.mobile-open {
                    pointer-events: auto;
                    background: white;
                }
                .chat-window {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: none !important;
                    max-height: none !important;
                    bottom: 0 !important;
                    right: 0 !important;
                    border-radius: 0 !important;
                    border: none !important;
                }
                .toggle-btn {
                    display: none !important;
                }
                .widget-container:not(.mobile-open) .toggle-btn {
                    display: flex !important;
                    position: absolute;
                    pointer-events: auto;
                }
            }

            .tooltip {
                position: absolute;
                bottom: 68px; /* Slightly closer to button */
                right: 0;
                background: white;
                border-radius: 12px;
                padding: 12px;
                width: 220px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                opacity: 0;
                transform: translateY(10px) scale(0.95);
                pointer-events: none;
                transition: opacity 0.2s, transform 0.2s;
                z-index: 1000;
                border: 1px solid rgba(0,0,0,0.05);
            }
            /* Add pseudo-element to bridge the gap for hover */
            .tooltip::after {
                content: '';
                position: absolute;
                bottom: -20px;
                left: 0;
                right: 0;
                height: 20px;
                background: transparent;
            }
            .tooltip.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }
            .tooltip-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                font-weight: 600;
                font-size: 13px;
                color: #242424;
            }
            .tooltip-desc {
                font-size: 11px;
                color: #667eea;
                margin-bottom: 8px;
                line-height: 1.4;
            }
            .suggestion-chips {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .chip {
                background: #f1f3f5;
                border: none;
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 11px;
                color: #495057;
                cursor: pointer;
                text-align: left;
                transition: background 0.2s;
            }
            .chip:hover {
                background: #e9ecef;
            }
        `;

        shadowRoot.appendChild(style);

        const container = document.createElement('div');
        container.className = 'widget-container';
        container.innerHTML = `
            <div id="chat-window" class="chat-window">
                <div class="header">
                    <div>
                        <div class="header-title">かい鯖グループAI Beta</div>
                        <div class="header-subtitle"><a href="https://ai.bac0n.f5.si" target="_blank" style="color: #889eff; text-decoration: none;">Powered by KAi</a></div>
                    </div>
                    <button id="close-btn" class="close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div id="messages" class="messages">
                    <div class="welcome">
                        <div class="welcome-emoji">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path fill="#EF9645" d="M4.861 9.147c.94-.657 2.357-.531 3.201.166l-.968-1.407c-.779-1.111-.5-2.313.612-3.093 1.112-.777 4.263 1.312 4.263 1.312-.786-1.122-.639-2.544.483-3.331 1.122-.784 2.67-.513 3.456.611l10.42 14.72L25 31l-11.083-4.042L4.25 12.625c-.793-1.129-.519-2.686.611-3.478z"/><path fill="#FFDC5D" d="M2.695 17.336s-1.132-1.65.519-2.781c1.649-1.131 2.78.518 2.78.518l5.251 7.658c.181-.302.379-.6.6-.894L4.557 11.21s-1.131-1.649.519-2.78c1.649-1.131 2.78.518 2.78.518l6.855 9.997c.255-.208.516-.417.785-.622L7.549 6.732s-1.131-1.649.519-2.78c1.649-1.131 2.78.518 2.78.518l7.947 11.589c.292-.179.581-.334.871-.498L12.238 4.729s-1.131-1.649.518-2.78c1.649-1.131 2.78.518 2.78.518l7.854 11.454 1.194 1.742c-4.948 3.394-5.419 9.779-2.592 13.902.565.825 1.39.26 1.39.26-3.393-4.949-2.357-10.51 2.592-13.903L24.515 8.62s-.545-1.924 1.378-2.47c1.924-.545 2.47 1.379 2.47 1.379l1.685 5.004c.668 1.984 1.379 3.961 2.32 5.831 2.657 5.28 1.07 11.842-3.94 15.279-5.465 3.747-12.936 2.354-16.684-3.11L2.695 17.336z"/><g fill="#5DADEC"><path d="M12 32.042C8 32.042 3.958 28 3.958 24c0-.553-.405-1-.958-1s-1.042.447-1.042 1C1.958 30 6 34.042 12 34.042c.553 0 1-.489 1-1.042s-.447-.958-1-.958z"/><path d="M7 34c-3 0-5-2-5-5 0-.553-.447-1-1-1s-1 .447-1 1c0 4 3 7 7 7 .553 0 1-.447 1-1s-.447-1-1-1zM24 2c-.552 0-1 .448-1 1s.448 1 1 1c4 0 8 3.589 8 8 0 .552.448 1 1 1s1-.448 1-1c0-5.514-4-10-10-10z"/><path d="M29 .042c-.552 0-1 .406-1 .958s.448 1.042 1 1.042c3 0 4.958 2.225 4.958 4.958 0 .552.489 1 1.042 1s.958-.448.958-1C35.958 3.163 33 .042 29 .042z"/></g></svg>
                        </div>
                        <div style="font-weight: 600; margin-bottom: 8px; color: #495057;">こんにちは!</div>
                        <div>何かお手伝いできることはありますか?</div>
                    </div>
                </div>
                <div class="input-area">
                    <div class="input-group">
                        <textarea id="chat-input" placeholder="メッセージを入力..." rows="1"></textarea>
                        <button id="send-btn" class="send-btn">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div id="tooltip" class="tooltip">
                <div class="tooltip-header">
                    <span>KAiくん</span>
                </div>
                <div class="tooltip-desc">
                    こんにちは!何かお手伝いできることはありますか?
                </div>
                <div class="suggestion-chips">
                    <button class="chip">かい鯖って何？</button>
                    <button class="chip">マイクラの遊び方を教えて</button>
                </div>
            </div>

            <button id="toggle-btn" class="toggle-btn">
                <span><svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="36" height="36" viewBox="0,0,104.57795,104.57795"><defs><linearGradient x1="189.71103" y1="137.80254" x2="290.28897" y2="222.19746" gradientUnits="userSpaceOnUse" id="color-1"><stop offset="0" stop-color="#1563e5"/><stop offset="0.97877" stop-color="#ac16e5"/></linearGradient><linearGradient x1="189.71103" y1="137.80254" x2="290.28898" y2="222.19746" gradientUnits="userSpaceOnUse" id="color-2"><stop offset="0" stop-color="#1b60e5"/><stop offset="1" stop-color="#ab16e5"/></linearGradient></defs><g transform="translate(-187.71102,-127.71102)"><g stroke-miterlimit="10"><path d="M205.71103,230.28898c-8.83656,0 -16,-7.16344 -16,-16v-68.57795c0,-8.83656 7.16344,-16 16,-16h68.57795c8.83655,0 16,7.16344 16,16v68.57795c0,8.83656 -7.16345,16 -16,16z" fill="#ffffff" stroke="none" stroke-width="4" stroke-linecap="butt"/><path d="M205.71102,230.28897c-8.83655,0 -16,-7.16345 -16,-16l1.11505,-26.20586c0,-2.3158 8.37697,10.24616 18.43627,9.79972c8.71248,-0.38667 11.57639,-11.74732 22.48322,-12.89842c7.58908,-0.80095 10.39974,9.80483 18.98111,10.80036c7.78981,0.9037 9.50589,-6.22704 23.62834,-8.60211c8.16178,-1.37262 15.71095,5.51526 15.71095,7.36777l0.22301,19.73855c0,8.83655 -7.16345,16 -16,16z" fill="url(#color-1)" stroke="none" stroke-width="4" stroke-linecap="butt"/><path d="M223.38259,150.46475v19.62497" fill="none" stroke="#000000" stroke-width="6" stroke-linecap="round"/><path d="M254.25187,149.88948v19.62497" fill="none" stroke="#000000" stroke-width="6" stroke-linecap="round"/><path d="M205.71103,230.28898c-8.83656,0 -16,-7.16344 -16,-16v-68.57795c0,-8.83656 7.16344,-16 16,-16h68.57795c8.83655,0 16,7.16344 16,16v68.57795c0,8.83656 -7.16345,16 -16,16z" fill="none" stroke="url(#color-2)" stroke-width="4" stroke-linecap="butt"/></g></g></svg><!--rotationCenter:52.28897499999999:52.28897499999999--></span>
            </button>
        `;

        shadowRoot.appendChild(container);

        // Bind events
        const toggleBtn = shadowRoot.getElementById('toggle-btn');
        const closeBtn = shadowRoot.getElementById('close-btn');
        const sendBtn = shadowRoot.getElementById('send-btn');
        const input = shadowRoot.getElementById('chat-input');
        const chatWindow = shadowRoot.getElementById('chat-window');
        const messagesDiv = shadowRoot.getElementById('messages');

        const tooltip = shadowRoot.getElementById('tooltip');
        const chips = shadowRoot.querySelectorAll('.chip');
        const widgetContainer = shadowRoot.querySelector('.widget-container');

        // Toggle properties
        toggleBtn.addEventListener('click', () => {
            isOpen = !isOpen;
            chatWindow.classList.toggle('open', isOpen);
            widgetContainer.classList.toggle('mobile-open', isOpen);
            tooltip.classList.remove('visible');

            if (isOpen) {
                setTimeout(() => input.focus(), 100);
            }
        });

        // Hover events for tooltip
        toggleBtn.addEventListener('mouseenter', () => {
            if (!isOpen) {
                tooltip.classList.add('visible');
            }
        });

        toggleBtn.addEventListener('mouseleave', (e) => {
            setTimeout(() => {
                const isHoveringTooltip = tooltip.matches(':hover');
                const isHoveringBtn = toggleBtn.matches(':hover');
                if (!isHoveringTooltip && !isHoveringBtn) {
                    tooltip.classList.remove('visible');
                }
            }, 100);
        });

        tooltip.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!toggleBtn.matches(':hover') && !tooltip.matches(':hover')) {
                    tooltip.classList.remove('visible');
                }
            }, 100);
        });

        // Chip click events
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.textContent;
                if (!isOpen) {
                    isOpen = true;
                    chatWindow.classList.add('open');
                    widgetContainer.classList.add('mobile-open');
                }

                input.value = text;
                tooltip.classList.remove('visible');
                sendMessage();
            });
        });

        // 位置調整関数
        function adjustPosition() {
            const isMobile = window.innerWidth <= 480;
            const pos = isMobile ? config.mobile : config.desktop;
            const offX = isMobile ? config.offsetXMobile : config.offsetXDesktop;
            const offY = isMobile ? config.offsetYMobile : config.offsetYDesktop;

            // Ensure units
            const formatOffset = (val) => {
                if (!val) return '0px';
                if (/^-?\d+(\.\d+)?$/.test(val)) return val + 'px';
                return val;
            };

            const formattedOffX = formatOffset(offX);
            const formattedOffY = formatOffset(offY);

            // Reset all styles
            container.style.top = 'auto';
            container.style.bottom = 'auto';
            container.style.left = 'auto';
            container.style.right = 'auto';
            container.style.alignItems = 'center';

            chatWindow.style.top = 'auto';
            chatWindow.style.bottom = 'auto';
            chatWindow.style.left = 'auto';
            chatWindow.style.right = 'auto';
            chatWindow.style.transformOrigin = 'center';

            tooltip.style.top = 'auto';
            tooltip.style.bottom = 'auto';
            tooltip.style.left = 'auto';
            tooltip.style.right = 'auto';

            toggleBtn.style.top = 'auto';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.left = 'auto';
            toggleBtn.style.right = 'auto';

            const [vertical, horizontal] = pos.split('-');

            if (isMobile) {
                // Mobile layout covers screen when open, button floating when closed
                if (vertical === 'top') {
                    toggleBtn.style.top = formattedOffY;
                    tooltip.style.top = `calc(${formattedOffY} + 50px)`;
                } else {
                    toggleBtn.style.bottom = formattedOffY;
                    tooltip.style.bottom = `calc(${formattedOffY} + 50px)`;
                }

                if (horizontal === 'left') {
                    toggleBtn.style.left = formattedOffX;
                    tooltip.style.left = formattedOffX;
                } else {
                    toggleBtn.style.right = formattedOffX;
                    tooltip.style.right = formattedOffX;
                }
            } else {
                // Desktop layout
                if (vertical === 'top') {
                    container.style.top = formattedOffY;
                    chatWindow.style.top = '60px';
                    tooltip.style.top = '55px';
                } else {
                    container.style.bottom = formattedOffY;
                    chatWindow.style.bottom = '60px';
                    tooltip.style.bottom = '55px';
                }

                if (horizontal === 'left') {
                    container.style.left = formattedOffX;
                    container.style.alignItems = 'flex-start';
                    chatWindow.style.left = '0';
                    tooltip.style.left = '0';
                    chatWindow.style.transformOrigin = (vertical === 'top' ? 'top left' : 'bottom left');
                } else {
                    container.style.right = formattedOffX;
                    container.style.alignItems = 'flex-end';
                    chatWindow.style.right = '0';
                    tooltip.style.right = '0';
                    chatWindow.style.transformOrigin = (vertical === 'top' ? 'top right' : 'bottom right');
                }
            }
        }

        // 初回実行
        adjustPosition();

        // イベントリスナー
        window.addEventListener('resize', adjustPosition);

        closeBtn.addEventListener('click', () => {
            isOpen = false;
            chatWindow.classList.remove('open');
            widgetContainer.classList.remove('mobile-open');
        });

        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);

        async function sendMessage() {
            const message = input.value.trim();
            if (!message || isProcessing) return;

            const welcome = messagesDiv.querySelector('.welcome');
            if (welcome) welcome.remove();

            addMessage(message, true);
            input.value = '';
            input.style.height = 'auto';

            isProcessing = true;
            sendBtn.disabled = true;
            const loadingId = addLoading();

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(EMBEDDED_API_KEY ? { 'X-Embedded-Key': EMBEDDED_API_KEY } : {})
                    },
                    body: JSON.stringify({
                        question: message,
                        sessionId: currentSessionId, // Send existing session ID
                        agreedToTerms: true,
                        saveTextHistory: true, // Enable history persistence
                        saveImageHistory: false
                    })
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: 'エラーが発生しました' }));
                    throw new Error(error.error || 'エラーが発生しました');
                }

                // Update session ID if returned
                const newSessionId = response.headers.get('X-Session-ID');
                if (newSessionId) {
                    currentSessionId = newSessionId;
                }

                removeLoading(loadingId);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullAnswer = '';
                const bubble = addMessage('', false);

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value, { stream: true });
                    const lines = text.split('\n');

                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.content) {
                                    fullAnswer += data.content;
                                    bubble.textContent = fullAnswer;
                                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                                }
                            } catch (e) { }
                        }
                    }
                }

            } catch (error) {
                removeLoading(loadingId);
                addMessage('エラー: ' + error.message, false);
            } finally {
                isProcessing = false;
                sendBtn.disabled = false;
                setTimeout(() => input.focus(), 100);
            }
        }

        function addMessage(text, isUser) {
            const row = document.createElement('div');
            row.className = `message-row ${isUser ? 'user' : 'bot'}`;

            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.textContent = text;

            row.appendChild(bubble);
            messagesDiv.appendChild(row);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return bubble;
        }

        function addLoading() {
            const id = 'loading-' + Date.now();
            const row = document.createElement('div');
            row.id = id;
            row.className = 'message-row bot';

            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.innerHTML = '<div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';

            row.appendChild(bubble);
            messagesDiv.appendChild(row);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return id;
        }

        function removeLoading(id) {
            const el = shadowRoot.getElementById(id);
            if (el) el.remove();
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createWidget);
    } else {
        createWidget();
    }
})();
