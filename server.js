// Load environment variables from .env file
require('dotenv').config();

const Settings = require('./lib/settings');
const db = require('./lib/db');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID: uuidv4 } = require('crypto');
const dns = require('dns').promises;
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const User = require('./lib/user');
const ChatHistory = require('./lib/chat-history');
const ImageStore = require('./lib/image-store');
const ort = require('onnxruntime-node');
const multer = require('multer');
const sharp = require('sharp');
const { spawn } = require('child_process');
const logger = require('./lib/logger');
const pluginManager = require('./lib/plugin-manager');
const bcrypt = require('bcrypt');
const ejs = require('ejs');

const VIEWS_DIR = path.join(__dirname, 'views');

const app = express();
const server = require('http').createServer(app);
app.set('trust proxy', 1); // Trust first proxy
let PORT = process.env.PORT || 3008;

// --- Global Constants (initialized from Settings later) ---
let CORS_ORIGIN = '';
const LLAMA_API_URL = 'http://127.0.0.1:4545/v1/chat/completions'; // Fallback
const REQUEST_TIMEOUT = 30000; // 30 seconds
const DATA_DIR = path.join(__dirname, 'data');
const MODELS_FILE = path.join(DATA_DIR, 'models.json');
const TOOLS_FILE = path.join(__dirname, 'tools.json');
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'data', 'announcements.json');
const WIDGET_SOURCE_FILE = path.join(__dirname, 'docs', 'widget-source.js');

// --- Utility Functions ---
const hashApiKey = (key) => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

const EMBEDDED_AUTH_GRACE_DAYS_DEFAULT = 14;
let embeddedAuthEnforceAt = null;

const parseDateOrNull = (value) => {
    if (!value || typeof value !== 'string') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const isEmbeddedAuthEnforced = () => {
    return embeddedAuthEnforceAt ? Date.now() >= embeddedAuthEnforceAt.getTime() : false;
};

const getEmbeddedKeyFromRequest = (req) => {
    const headerKey = req.headers['x-embedded-key'];
    if (headerKey && typeof headerKey === 'string') return headerKey.trim();
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    return null;
};

// --- Model Management ---
let models = [];
const loadModels = async () => {
    try {
        // First try to load from database settings
        const settingsModels = Settings.get('AI_MODELS');
        if (settingsModels) {
            try {
                models = typeof settingsModels === 'string' ? JSON.parse(settingsModels) : settingsModels;
                // logger.info(`✅ Loaded ${models.length} models from settings.`); // 削除: 不要
                return;
            } catch (e) {
                logger.error('❌ Failed to parse models from settings:', e);
            }
        }

        // Fallback to models.json if settings not available or failed
        if (fs.existsSync(MODELS_FILE)) {
            const raw = fs.readFileSync(MODELS_FILE, 'utf8');
            models = JSON.parse(raw);
            // logger.info(`✅ Loaded ${models.length} models from config.`); // 削除: 不要
        } else {
            // Default models if file doesn't exist
            models = [
                {
                    id: 'normal',
                    name: 'KAi C2.2',
                    apiUrl: 'http://127.0.0.1:4545/v1/chat/completions',
                    modelFile: 'kai-c2.2_preview_Q5_K_M.gguf',
                    isActive: true
                },
                {
                    id: 'tinyswallow',
                    name: 'TinySwallow 1.5B',
                    apiUrl: 'http://127.0.0.1:4546/v1/chat/completions',
                    modelFile: 'models/tinyswallow-1.5b-instruct-q5_k_m.gguf',
                    isActive: true
                }
            ];
            // Also save to settings for future use
            await Settings.set('AI_MODELS', JSON.stringify(models), 'ai', 'List of available AI models');
            fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
            logger.info('✅ Initialized models with defaults.');
        }
    } catch (e) {
        logger.error('❌ Failed to load models:', e);
        // Fallback to minimal working set
        models = [{ id: 'normal', name: 'KAi C2.2', apiUrl: 'http://127.0.0.1:4545/v1/chat/completions', modelFile: 'kai-c2.2_preview_Q5_K_M.gguf', isActive: true }];
    }
};
// Called inside startServer() after Settings.load()

const getModelInfo = (modelId) => {
    const model = models.find(m => m.id === modelId && m.isActive);
    return model || models.find(m => m.id === 'normal') || models[0];
};

const saveModels = async () => {
    try {
        const json = JSON.stringify(models);
        await Settings.set('AI_MODELS', json, 'ai', 'List of available AI models');
        fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
        return true;
    } catch (e) {
        logger.error('❌ Failed to save models:', e);
        return false;
    }
};
const guestSessions = new Map();

// No legacy migrations needed for PostgreSQL

// --- App Startup Logic (Integrated) ---
const startServer = async () => {
    const _startTime = Date.now();
    try {
        // 1. Load Settings from DB（基本設定の初期値はDBに任せる。必要なら scripts/seed-basic-settings.js を実行）
        await Settings.load();
        await loadModels(); // Load models after settings are loaded
        // logger.info("Settings and models loaded from database."); // 削除: 不要

        // Security hardening defaults / warnings
        let enforceAtStr = Settings.get('EMBEDDED_AUTH_ENFORCE_AFTER');
        let parsedEnforceAt = parseDateOrNull(enforceAtStr);
        if (!parsedEnforceAt) {
            parsedEnforceAt = new Date(Date.now() + EMBEDDED_AUTH_GRACE_DAYS_DEFAULT * 24 * 60 * 60 * 1000);
            enforceAtStr = parsedEnforceAt.toISOString();
            await Settings.set(
                'EMBEDDED_AUTH_ENFORCE_AFTER',
                enforceAtStr,
                'security',
                `Embedded key auth enforcement datetime (default ${EMBEDDED_AUTH_GRACE_DAYS_DEFAULT} days grace)`
            );
        }
        embeddedAuthEnforceAt = parsedEnforceAt;

        const sessionSecret = Settings.get('SESSION_SECRET');
        if (!sessionSecret || typeof sessionSecret !== 'string' || sessionSecret.length < 32) {
            logger.error('SESSION_SECRET が設定されていないか、32文字未満です。');
            logger.error('設定例: node bin/settings-cli.js set SESSION_SECRET "あなたの32文字以上の秘密鍵"');
            logger.error('または管理者画面のシステム設定から設定してください。');
            process.exit(1);
        }

        const siteUrl = Settings.get('SITE_URL');
        const adminUsername = Settings.get('ADMIN_USERNAME');
        if (process.env.NODE_ENV === 'production') {
            if (!siteUrl || typeof siteUrl !== 'string' || siteUrl.trim() === '') {
                logger.error('本番環境では SITE_URL を .env に設定してください。例: SITE_URL=https://your-domain.com');
                process.exit(1);
            }
            if (!adminUsername || typeof adminUsername !== 'string' || adminUsername.trim() === '') {
                logger.error('本番環境では ADMIN_USERNAME を .env に設定してください。例: ADMIN_USERNAME=admin');
                process.exit(1);
            }
        } else if (!siteUrl || !adminUsername) {
            logger.warn('開発時は .env に SITE_URL と ADMIN_USERNAME を設定することを推奨します。');
        }

        const corsOrigin = Settings.get('CORS_ORIGIN', process.env.NODE_ENV === 'production' ? 'https://bac0n.f5.si' : '*');
        if (process.env.NODE_ENV === 'production' && corsOrigin === '*') {
            logger.error('本番環境では CORS_ORIGIN に * を指定できません。具体的なオリジンを設定してください。');
            logger.error('設定例: node bin/settings-cli.js set CORS_ORIGIN "https://your-domain.com"');
            process.exit(1);
        }

        // 2. Set global variables
        const defaultOrigin = Settings.get('SITE_URL', '*');
        CORS_ORIGIN = Settings.get('CORS_ORIGIN', process.env.NODE_ENV === 'production' ? defaultOrigin : '*');

        // 3. Load Plugins and Register Routes (lib/plugins 内の .js を自動ロード)
        pluginManager.loadAllPlugins();
        PointsService = pluginManager.getPointsService();
        pluginManager.registerAuthRoutes(app);
        pluginManager.registerProRoutes(app);

        // 3b. Initial dependency check and interval (plugin-driven health checks)
        await checkDependencyServices();
        setInterval(checkDependencyServices, 5 * 60 * 1000);

        // 4. Register final fallback routes (SPA and 404)
        // This must be the absolute LAST set of routes registered
        app.get(['/pages', '/pages/*'], (req, res) => {
            sendIndexWithNonce(req, res);
        });

        app.get(['/admin', '/admin/*'], adminOnly, (req, res) => {
            sendIndexWithNonce(req, res);
        });

        app.use((req, res) => {
            res.status(404);
            sendIndexWithNonce(req, res);
        });

        // 5. Initialize DBs and start listening
        await Promise.all([initBlogDb(), initFeedbackDb(), initSecurityDb()]);

        server.listen(PORT, () => {
            const elapsed = ((Date.now() - _startTime) / 1000).toFixed(2);
            logger.info(`✅ LibreKAi Server ready on port ${PORT} (${elapsed}s)`);
        });
    } catch (err) {
        logger.error("Failed to start server:", err);
        process.exit(1);
    }
};

let PointsService = null;
startServer();

// (Removed redundant sync PointsService declaration)

const MAX_QUESTION_LENGTH = 200;
const MIN_QUESTION_LENGTH = 1;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// (Constants moved into startServer for dependency management)

// (Variable declarations moved into relevant middlewares/routes to ensure reactive Settings usage)
const getCorsOrigin = () => {
    const defaultOrigin = Settings.get('SITE_URL', '*');
    return Settings.get('CORS_ORIGIN', process.env.NODE_ENV === 'production' ? defaultOrigin : '*');
};


// URL Validation Helper
const isValidUrl = (urlString, allowInternal = false) => {
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (!allowInternal && isInternalIP(url.hostname)) return false;
        return true;
    } catch (e) {
        return false;
    }
};

const axios = require('axios');

// Short URL Helper
const createShortUrl = async (longUrl) => {
    const apiKey = Settings.get('SHORT_URL_API_KEY');
    if (!apiKey) {
        logger.verbose('⚠️ SHORT_URL_API_KEY is not set. Skipping short URL generation.');
        return null;
    }

    const shortUrlBaseUrl = Settings.get('SHORT_URL_BASE_URL', 'https://8r.f5.si');

    try {
        const response = await axios.post(`${shortUrlBaseUrl}/rest/v3/short-urls`, {
            longUrl: longUrl,
            customSlug: 'k/' + crypto.randomBytes(6).toString('base64url').substring(0, 8),
            tags: ['chat']
        }, {
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.shortUrl) {
            return response.data.shortUrl;
        }
        return null;
    } catch (e) {
        logger.error('Failed to create short URL:', e.response?.data || e.message);
        return null;
    }
};

// Short URL Deletion Helper
const deleteShortUrl = async (shortUrl) => {
    const apiKey = Settings.get('SHORT_URL_API_KEY');
    if (!apiKey || !shortUrl) return;

    const shortUrlBaseUrl = Settings.get('SHORT_URL_BASE_URL', 'https://8r.f5.si');

    try {
        // Extract slug from URL (e.g., https://8r.f5.si/k/xxxx -> k/xxxx)
        const urlObj = new URL(shortUrl);
        const slug = urlObj.pathname.substring(1); // Remove leading slash

        await axios.delete(`${shortUrlBaseUrl}/rest/v3/short-urls/${encodeURIComponent(slug)}`, {
            headers: { 'X-Api-Key': apiKey }
        });
    } catch (e) {
        logger.error('Failed to delete short URL:', e.response?.data || e.message);
    }
};

// Check if hostname resolves to internal/private IP
const isInternalIP = (hostname) => {
    // Block localhost, private IPs, and link-local addresses
    const internalPatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^(::1|0:0:0:0:0:0:0:1)$/,
        /^fe80:/i,
        /^fc00:/i,
        /^fd00:/i,
        /^0\./ // Source selection/broadcast
    ];
    return internalPatterns.some(pattern => pattern.test(hostname));
};

// Validate avatar URL is from allowed domain (from auth plugin)
const isAllowedAvatarDomain = async (urlString) => {
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'https:') return false;

        // DNS保護: ホスト名を解決して内部IPでないか確認 (DNS Rebinding対策)
        try {
            const { address } = await dns.lookup(url.hostname);
            if (isInternalIP(address)) return false;
        } catch (e) {
            return false;
        }

        const allowedDomains = pluginManager.getAllowedAvatarDomains();
        if (allowedDomains.length === 0) return false;
        return allowedDomains.includes(url.hostname);
    } catch (e) {
        return false;
    }
};

// Middleware
app.use(compression());

// Nonce generation middleware
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});

// Build CSP imgSrc dynamically
const buildCSPImgSrc = () => {
    const base = ["'self'", "data:", "blob:"];
    const siteUrl = Settings.get('SITE_URL');
    if (siteUrl) {
        try {
            const origin = new URL(siteUrl).origin;
            if (!base.includes(origin)) {
                base.push(origin);
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }
    const extraDomains = Settings.get('CSP_ALLOWED_IMG_DOMAINS', '');
    if (extraDomains) {
        const domains = extraDomains.split(',').map(d => d.trim()).filter(d => d);
        base.push(...domains);
    }
    return base;
};

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", (req, res) => `'nonce-${res.locals.nonce}'`],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            imgSrc: buildCSPImgSrc(),
            connectSrc: ["'self'", "https://api.openai.com", "http://127.0.0.1:4545", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            mediaSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow widget.js to be loaded by other origins
    referrerPolicy: { policy: "strict-origin-when-cross-origin" } // Ensure Referer header is sent
}));
// Dynamic CORS middleware to use database settings
const globalCors = cors({
    origin: function (origin, callback) {
        const defaultOrigin = Settings.get('SITE_URL', '*');
        const allowed = Settings.get('CORS_ORIGIN') || (process.env.NODE_ENV === 'production' ? defaultOrigin : '*');
        // Handle lists of origins or wildcard
        if (allowed === '*' || !origin || allowed === origin) {
            callback(null, true);
        } else {
            callback(null, false); // Block other origins
        }
    },
    credentials: true
});

app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/embedded')) {
        const origin = req.headers.origin;
        if (origin) {
            try {
                // Check if origin is allowed by ANY active site
                const sites = await db.getAll('SELECT allowed_origins FROM embedded_sites WHERE is_active = true');
                const isAllowed = sites.some(s => {
                    try {
                        const origins = typeof s.allowed_origins === 'string' ? JSON.parse(s.allowed_origins) : s.allowed_origins;
                        return Array.isArray(origins) && origins.includes(origin);
                    }
                    catch (e) { return false; }
                });

                if (isAllowed) {
                    res.setHeader('Access-Control-Allow-Origin', origin);
                    res.setHeader('Access-Control-Allow-Credentials', 'true');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Embedded-Key, Authorization');
                }
            } catch (e) {
                logger.error('CORS check error:', e);
            }
        }
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    } else {
        globalCors(req, res, next);
    }
});

// Serve widget.js dynamically with Referer check (Before static middleware)
app.get('/embedded/widget.js', async (req, res) => {
    const referer = req.headers.referer;
    logger.verbose(`🔍 Widget Request: Referer=${referer}`);

    if (!referer) {
        logger.verbose('⚠️ Blocked widget access: No Referer header');
        res.status(403).type('application/javascript').send("console.error('KAi Widget Error: Access denied. No Referer header found. This script must be loaded from a web page.');");
        return;
    }

    try {
        const refererUrl = new URL(referer);
        const origin = refererUrl.origin;
        logger.verbose(`🔍 Widget Request: Origin=${origin}`);

        // Allow own origin
        const siteUrl = Settings.get('SITE_URL') || '';
        const corsAllowed = Settings.get('CORS_ORIGIN') || (process.env.NODE_ENV === 'production' ? 'https://bac0n.f5.si' : '*');
        if (origin === corsAllowed || (siteUrl && origin === new URL(siteUrl).origin) || origin.includes('localhost')) {
            logger.verbose('✅ Allowing widget access: Safe Origin');
            res.type('application/javascript');
            return res.sendFile(WIDGET_SOURCE_FILE);
        }

        // Check DB
        const allSites = await db.getAll('SELECT allowed_origins FROM embedded_sites WHERE is_active = true');
        const isAllowed = allSites.some(s => {
            try {
                const origins = typeof s.allowed_origins === 'string' ? JSON.parse(s.allowed_origins) : s.allowed_origins;
                return Array.isArray(origins) && origins.includes(origin);
            }
            catch (e) { return false; }
        });

        if (isAllowed) {
            logger.verbose(`✅ Allowing widget access: DB Allowed Origin`);
            res.type('application/javascript');
            res.sendFile(WIDGET_SOURCE_FILE);
        } else {
            logger.verbose(`⛔ Blocked widget access from unauthorized referer: ${referer}`);
            res.status(403).type('application/javascript').send(`console.error('KAi Widget Error: Access denied. The site ${origin} is not authorized to use this widget.');`);
        }
    } catch (e) {
        logger.error('❌ Widget serving error:', e);
        res.status(403).type('application/javascript').send("console.error('KAi Widget Error: Invalid request.');");
    }
});

app.use(express.json({ limit: '2mb' })); // Limit for base64 images (1MB image ≈ 1.33MB base64)

// CSRF protection: validate Origin/Referer for state-changing API requests
app.use((req, res, next) => {
    const method = req.method;
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
        return next();
    }
    const path = req.path;
    if (path.startsWith('/api/webhooks/')) return next();

    // API v1 routes use API key authentication, skip CSRF but ensure it's handled in the route
    if (path.startsWith('/api/v1/')) return next();

    // Skip CSRF for requests with valid API key headers (even if not /api/v1/)
    if (req.headers['x-api-key'] || req.headers['x-embedded-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))) {
        return next();
    }

    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const allowed = Settings.get('CORS_ORIGIN') || (process.env.NODE_ENV === 'production' ? 'https://bac0n.f5.si' : '*');
    const siteUrl = Settings.get('SITE_URL') || '';

    if (allowed === '*') return next();

    const isAllowedOrigin = (o) => {
        if (!o) return false;
        try {
            const oOrigin = o.startsWith('http') ? new URL(o).origin : null;
            if (!oOrigin) return false;
            if (allowed === oOrigin) return true;
            if (siteUrl && new URL(siteUrl).origin === oOrigin) return true;
            if (/^https?:\/\/localhost(:\d+)?$/i.test(oOrigin)) return true; // Removed 'null' origin allowance
            if (Array.isArray(allowed) && allowed.includes(oOrigin)) return true;
            return false;
        } catch (e) { return false; }
    };

    if (origin) {
        if (!isAllowedOrigin(origin)) {
            logger.warn('CSRF: Rejected request - Origin not allowed:', origin);
            return res.status(403).json({ error: 'Forbidden' });
        }
        return next();
    }
    if (referer) {
        if (!isAllowedOrigin(referer)) {
            logger.warn('CSRF: Rejected request - Referer not allowed:', referer);
            return res.status(403).json({ error: 'Forbidden' });
        }
        return next();
    }

    // OriginもRefererも存在しない場合（ブラウザ外のツール等によるスクリプト的なアクセス以外）を拒否
    if (process.env.NODE_ENV === 'production') {
        logger.warn('CSRF: Rejected request - Both Origin and Referer missing for state-changing request');
        return res.status(403).json({ error: 'Forbidden: Security headers missing' });
    }
    next();
});

// Redirect old static HTML files to new SPA routes
app.get('/privacy.html', (req, res) => res.redirect(301, '/pages/privacy'));
app.get('/terms.html', (req, res) => res.redirect(301, '/pages/terms'));
app.get('/pro.html', (req, res) => res.redirect(301, '/pages/pro'));
app.get('/embedded-sites.html', (req, res) => res.redirect(301, '/pages/embedded-sites'));

// 275行目付近の完全な修正版

const pagesMetaServer = {
    '/pages': {
        title: 'ページ一覧 - KAi',
        description: 'KAiの各種情報や管理ページの一覧です。プライバシーポリシー、利用規約、Proプラン、API管理などにアクセスできます。',
        keywords: 'KAi, ページ一覧, 管理, 情報'
    },
    '/pages/privacy': {
        title: 'プライバシーポリシー - KAi',
        description: '当サービスのプライバシーポリシーです。ユーザーデータの収集、利用、管理、保護について定めています。',
        keywords: 'KAi, プライバシーポリシー, 個人情報, データ保護'
    },
    '/pages/terms': {
        title: '利用規約 - KAi',
        description: 'KAiの利用規約です。サービス利用の条件、禁止事項、免責事項などについて詳しく解説しています。',
        keywords: 'KAi, 利用規約, 規約, 禁止事項'
    },
    '/pages/embedded-sites': {
        title: '埋め込みサイト管理 - KAi',
        description: '自分のサイトにKAiを埋め込むための管理ページです。サイトの追加やウィジェットのカスタマイズが可能です。',
        keywords: 'KAi, 埋め込み, ウィジェット, サイト連携'
    },
    '/pages/api': {
        title: 'API管理 - KAi',
        description: 'KAiのAPI管理ページです。APIキーの作成、管理、利用状況の統計確認ができます。',
        keywords: 'KAi, API, APIキー, 開発者'
    },
    '/pages/faq': {
        title: 'よくある質問 - KAi',
        description: 'KAiに関するよくある質問（FAQ）です。使い方や機能、技術的な疑問についてお答えしています。',
        keywords: 'KAi, よくある質問, FAQ, ヘルプ'
    },
    '/blogs': {
        title: 'ブログ一覧 - KAi',
        description: 'KAiの最新情報や開発の様子をお伝えするブログです。',
        keywords: 'KAi, ブログ, 開発日記, お知らせ'
    }
};

const sendIndexWithNonce = (req, res) => {
    const indexEjsPath = path.join(VIEWS_DIR, 'index.ejs');
    ejs.renderFile(indexEjsPath, { nonce: res.locals.nonce }, async (err, html) => {
        if (err) {
            logger.error('Error rendering index.ejs:', err);
            return res.status(500).send('Internal Server Error');
        }

        // escapeAttr を共通スコープで定義（if/else どちらからでも使用可能）
        const escapeAttr = (str) => (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let dynamicHtml = html;
        const chatMatch = req.path.match(/\/chat\/([a-zA-Z0-9-]+)/);
        const normalizedPath = req.path.endsWith('/') && req.path.length > 1 ? req.path.slice(0, -1) : req.path;

        if (chatMatch) {
            const sessionId = chatMatch[1];
            const session = await getSession(sessionId);
            const currentUserId = req.session?.user?.id || null;
            const currentSid = req.session?.id || null;

            const isOwner = session && (
                session.userId ? (session.userId === currentUserId) : (session.creatorSid && session.creatorSid === currentSid)
            );

            if (session && (session.isPublic || isOwner)) {
                const title = session.title || 'KAi Chat';
                const lastMessage = session.messages.filter(m => m.role === 'assistant').pop() ||
                    session.messages.filter(m => m.role === 'user').pop();
                const defaultDesc = Settings.get('META_DESCRIPTION') || '';
                const description = lastMessage ?
                    escapeAttr(lastMessage.content.substring(0, 150).replace(/\s+/g, ' ').trim()) + '...' :
                    escapeAttr(defaultDesc);
                const siteTitle = Settings.get('SITE_TITLE') || '';

                dynamicHtml = dynamicHtml
                    .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(title)} - ${escapeAttr(siteTitle)}</title>`)
                    .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${description}">`);
            }
        } else if (normalizedPath === '/blogs' || normalizedPath.startsWith('/blogs/')) {
            const blogMatch = normalizedPath.match(/\/blogs\/(\d{4}-\d{2}-\d{2})(?:\/(\d+))?/);
            if (blogMatch) {
                const date = blogMatch[1];
                const id = blogMatch[2] || '1';
                // We could fetch the title from file here, but for now just use a placeholder
                // to keep it fast. The frontend will update it anyway.
                dynamicHtml = dynamicHtml
                    .replace(/<title>.*?<\/title>/, `<title>ブログ ${date} - KAi</title>`)
                    .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="KAiブログ: ${date}の記事です。">`);
            } else {
                const meta = pagesMetaServer['/blogs'];
                dynamicHtml = dynamicHtml
                    .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
                    .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${meta.description}">`)
                    .replace(/<meta name="keywords" content=".*?">/, `<meta name="keywords" content="${meta.keywords}">`);
            }
        } else if (pagesMetaServer[normalizedPath]) {
            const meta = pagesMetaServer[normalizedPath];
            dynamicHtml = dynamicHtml
                .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
                .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${meta.description}">`)
                .replace(/<meta name="keywords" content=".*?">/, `<meta name="keywords" content="${meta.keywords}">`);
        } else {
            const siteTitle = Settings.get('SITE_TITLE') || '';
            const metaDesc = Settings.get('META_DESCRIPTION') || '';
            const metaKw = Settings.get('META_KEYWORDS') || '';
            if (siteTitle) {
                dynamicHtml = dynamicHtml.replace(/<title>.*?<\/title>/, `<title>${escapeAttr(siteTitle)}</title>`);
            }
            if (metaDesc) {
                dynamicHtml = dynamicHtml.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${escapeAttr(metaDesc)}">`);
            }
            if (metaKw) {
                dynamicHtml = dynamicHtml.replace(/<meta name="keywords" content=".*?">/, `<meta name="keywords" content="${escapeAttr(metaKw)}">`);
            }
        }

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // 🔧 強力な nonce 置換処理 & セキュアなHTML生成
        const escapeHtml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        let cleanedHtml = dynamicHtml;

        // すべての script/link タグに nonce を挿入し、既存の nonce 属性をクリーンアップ
        cleanedHtml = cleanedHtml
            .replace(/\s+nonce=["'][^"']*?["']/gi, '')
            .replace(/<script(\s|>)/gi, `<script nonce="${res.locals.nonce}"$1`)
            .replace(/<link(\s|>)/gi, `<link nonce="${res.locals.nonce}"$1`);

        // 4. Vite ビルドがあれば /js/index.js を /dist/assets/index-*.js に差し替え
        const distAssets = path.join(__dirname, 'dist', 'assets');
        if (fs.existsSync(distAssets)) {
            const files = fs.readdirSync(distAssets);
            const indexJs = files.find((f) => f.startsWith('index') && f.endsWith('.js') && !f.endsWith('.map'));
            if (indexJs) {
                cleanedHtml = cleanedHtml.replace(
                    /src="\/js\/index\.js"/,
                    `src="/dist/assets/${indexJs}"`
                );
            }
        }

        res.send(cleanedHtml);
    });
};

app.get(['/', '/index.html', '/chat/*', '/pages', '/pages/*', '/blogs', '/blogs/*'], sendIndexWithNonce);

// --- Image Serving Route (Database) ---
app.get('/uploads/:filename', async (req, res) => {
    const { filename } = req.params;
    try {
        const image = await db.getRow('SELECT data, mime_type FROM images WHERE filename = $1', [filename]);
        if (image) {
            res.setHeader('Content-Type', image.mime_type);
            res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
            return res.send(image.data);
        }

        // Fallback to local file system if not in DB (for backward compatibility during migration)
        const filePath = path.join(__dirname, 'public', 'uploads', path.basename(filename));
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }

        res.status(404).send('Not Found');
    } catch (err) {
        logger.error(`Error serving image ${filename}:`, err);
        res.status(500).send('Internal Server Error');
    }
});

app.use(express.static('public'));
// Built frontend (npm run build) is served at /dist; does not overwrite public/ or EJS
if (fs.existsSync(path.join(__dirname, 'dist'))) {
    app.use('/dist', express.static(path.join(__dirname, 'dist')));
}

// プラグインが持つ静的アセット（CSS/JS）を配信する汎用ルート
// プラグイン固有のCSSやクライアントJSはここから取得される
app.get('/plugin-assets/:plugin/:file', (req, res) => {
    const { plugin, file } = req.params;
    // パストラバーサル防止: 英数字・ハイフン・アンダースコアのみ許可
    if (!/^[\w-]+$/.test(plugin) || !/^[\w.-]+$/.test(file) || file.includes('..')) {
        return res.status(400).end();
    }
    const filePath = path.join(__dirname, 'lib', 'plugins', plugin, file);
    res.sendFile(filePath, (err) => {
        if (err) res.status(404).end();
    });
});

// Session Middleware - startServer() で Settings.load() 済みなのでここでは再ロード不要
let sessionMiddlewareInstance = null;
const sessionReadyPromise = (async () => {
    // Settings は startServer() 内で既にロード済み。再ロードすると二重ログになるため省略。
    const secret = Settings.get('SESSION_SECRET');
    if (!secret || typeof secret !== 'string' || secret.length < 32) {
        return null;
    }
    sessionMiddlewareInstance = session({
        store: new PgStore({
            pool: db.pool,
            tableName: 'user_sessions',
            createTableIfMissing: true,
            ttl: 24 * 60 * 60
        }),
        secret: secret,
        resave: false,
        saveUninitialized: false,
        name: 'kai.sid',
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        }
    });
    return sessionMiddlewareInstance;
})();

app.use((req, res, next) => {
    if (sessionMiddlewareInstance) {
        return sessionMiddlewareInstance(req, res, next);
    }
    sessionReadyPromise.then((m) => {
        if (m) m(req, res, next);
        else {
            logger.error('SESSION_SECRET not configured');
            res.status(503).json({ error: 'Server not ready' });
        }
    }).catch((err) => next(err));
});

// Logging Setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(ANNOUNCEMENTS_FILE)) {
    // デフォルトは空配列
    fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify([], null, 2));
}

// --- System Status Monitoring (plugin-driven) ---
const SERVICE_REASON_MAP = { forum: '認証フォーラムが停止しています。', points: 'ポイントシステムが停止しています。' };
let systemStatus = {
    isHealthy: true,
    reason: null,
    services: {},
    lastCheck: null
};

const refreshServiceStatus = (serviceName, healthy) => {
    const previousStatus = systemStatus.isHealthy;

    if (!systemStatus.services[serviceName]) {
        systemStatus.services[serviceName] = { healthy: true, url: null };
    }
    systemStatus.services[serviceName].healthy = healthy;

    let allHealthy = true;
    const reasons = [];
    for (const s in systemStatus.services) {
        if (!systemStatus.services[s].healthy) {
            allHealthy = false;
            if (SERVICE_REASON_MAP[s]) reasons.push(SERVICE_REASON_MAP[s]);
        }
    }

    systemStatus.isHealthy = allHealthy;
    systemStatus.reason = allHealthy ? null : reasons.join(' ');
    systemStatus.lastCheck = new Date().toISOString();

    if (!allHealthy) {
        if (previousStatus || systemStatus.reason !== reasons.join(' ')) {
            logger.warn(`⚠️ System status updated to UNHEALTHY: ${systemStatus.reason}`);
        } else {
            logger.verbose(`System status remains UNHEALTHY: ${systemStatus.reason}`);
        }
    } else {
        if (!previousStatus) {
            logger.info('✅ System status has recovered to HEALTHY');
        } else {
            logger.verbose('System status remains HEALTHY');
        }
    }
};

const checkDependencyServices = async () => {
    logger.verbose('🔍 Checking dependency services...');
    const healthChecks = pluginManager.getHealthChecks();

    for (const [name, checkFn] of Object.entries(healthChecks)) {
        try {
            const healthy = await checkFn();
            if (!systemStatus.services[name]) {
                systemStatus.services[name] = { healthy: true, url: null };
            }
            refreshServiceStatus(name, healthy);
        } catch (e) {
            logger.error(`❌ ${name} service check failed: ${e.message}`);
            refreshServiceStatus(name, false);
        }
    }

    if (Object.keys(healthChecks).length === 0) {
        systemStatus.isHealthy = true;
        systemStatus.reason = null;
        systemStatus.lastCheck = new Date().toISOString();
    }
};

const systemStatusGuard = (req, res, next) => {
    if (!systemStatus.isHealthy && !req.session?.user?.admin) {
        return res.status(503).json({
            error: 'Service Unavailable',
            message: '前提サービスが停止しているため、現在AIサービスをご利用いただけません。',
            reason: systemStatus.reason
        });
    }
    next();
};

const adminOnly = (req, res, next) => {
    if (!req.session?.user?.admin) {
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            res.status(403);
            return sendIndexWithNonce(req, res);
        }
        return res.status(403).json({ error: '管理者権限が必要です。' });
    }
    next();
};

// Admin Model Management API
app.get('/api/admin/models', adminOnly, (req, res) => {
    res.json(models);
});

// Admin Stats API
app.get('/api/admin/stats', adminOnly, async (req, res) => {
    const range = req.query.range || '1D'; // 1D, 1W, 1M, 1Y
    const logsDir = path.join(__dirname, 'logs');

    try {
        const files = await fs.promises.readdir(logsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

        let targetFiles = [];
        const now = new Date();

        if (range === '1D') {
            targetFiles = jsonFiles.slice(0, 1);
        } else if (range === '1W') {
            targetFiles = jsonFiles.slice(0, 7);
        } else if (range === '1M') {
            targetFiles = jsonFiles.slice(0, 30);
        } else if (range === '1Y') {
            targetFiles = jsonFiles.slice(0, 365);
        }

        let stats = {
            totalRequests: 0,
            modelUsage: {},
            responseTimeSeries: [],
            dailyRequests: {},
            avgResponseTime: 0
        };

        let totalTime = 0;

        for (const file of targetFiles) {
            const filePath = path.join(logsDir, file);
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() !== '');
            const dateStr = file.replace('.json', '');

            stats.dailyRequests[dateStr] = lines.length;
            stats.totalRequests += lines.length;

            lines.forEach(line => {
                try {
                    const log = JSON.parse(line);
                    const model = log.model_version || 'unknown';
                    stats.modelUsage[model] = (stats.modelUsage[model] || 0) + 1;
                    totalTime += log.response_time || 0;

                    // For 1D, we might want hourly, but for simplicity let's stay with daily/per-log
                    stats.responseTimeSeries.push({
                        t: log.timestamp,
                        v: log.response_time
                    });
                } catch (e) {
                    // Ignore malformed lines
                }
            });
        }

        stats.avgResponseTime = stats.totalRequests > 0 ? totalTime / stats.totalRequests : 0;

        res.json(stats);
    } catch (error) {
        logger.error(`Failed to fetch admin stats: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

app.post('/api/admin/models', adminOnly, async (req, res) => {
    const { model } = req.body;
    if (!model || !model.id) {
        return res.status(400).json({ error: 'モデル情報が不足しています。' });
    }

    const index = models.findIndex(m => m.id === model.id);
    if (index !== -1) {
        // Update
        models[index] = { ...models[index], ...model };
    } else {
        // Add
        models.push(model);
    }

    if (await saveModels()) {
        res.json({ success: true, models });
    } else {
        res.status(500).json({ error: 'モデルの保存に失敗しました。' });
    }
});

app.delete('/api/admin/models/:id', adminOnly, async (req, res) => {
    const { id } = req.params;
    if (id === 'normal') {
        return res.status(400).json({ error: 'デフォルトモデルは削除できません。' });
    }

    const index = models.findIndex(m => m.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'モデルが見つかりません。' });
    }

    models.splice(index, 1);
    if (await saveModels()) {
        res.json({ success: true, models });
    } else {
        res.status(500).json({ error: 'モデルの保存に失敗しました。' });
    }
});

// i18n helper (extend later with req.locale / Accept-Language and locale files)
const t = (key) => {
    const ja = {
        'admin.settings.key_required': 'キーは必須です。',
        'admin.settings.key_invalid': 'キーが無効です。',
        'admin.settings.save_failed': '設定の保存に失敗しました。',
    };
    return ja[key] || key;
};

// Keys managed only in .env — not editable via admin API
const ENV_ONLY_KEYS = new Set(['SITE_URL', 'ADMIN_USERNAME']);

// Admin System Settings API (excludes SITE_URL and ADMIN_USERNAME; those are .env-only)
app.get('/api/admin/settings', adminOnly, async (req, res) => {
    try {
        const rows = await db.getAll('SELECT key, value, category, description, updated_at FROM settings ORDER BY category, key');
        const filtered = rows.filter(r => !ENV_ONLY_KEYS.has(r.key));
        res.json(filtered);
    } catch (e) {
        logger.error('Failed to fetch settings:', e);
        res.status(500).json({ error: '設定の取得に失敗しました。' });
    }
});

const SANITIZE_STRING = (s, maxLen = 1000) => {
    if (s == null || typeof s !== 'string') return '';
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen);
};

app.post('/api/admin/settings', adminOnly, async (req, res) => {
    const { key, value, category, description } = req.body;
    if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: t('admin.settings.key_required') });
    }
    const sanitizedKey = SANITIZE_STRING(key.trim(), 255);
    if (!sanitizedKey) {
        return res.status(400).json({ error: t('admin.settings.key_invalid') });
    }
    if (ENV_ONLY_KEYS.has(sanitizedKey)) {
        return res.status(400).json({ error: 'SITE_URL と ADMIN_USERNAME は .env で設定してください。' });
    }
    const sanitizedValue = SANITIZE_STRING(value != null ? String(value) : '', 10000);
    const sanitizedCategory = SANITIZE_STRING(category != null ? String(category) : 'general', 100);
    const sanitizedDescription = SANITIZE_STRING(description != null ? String(description) : '', 500);

    try {
        const success = await Settings.set(sanitizedKey, sanitizedValue, sanitizedCategory, sanitizedDescription);
        if (success) {
            // Need to update global constants if changed
            // This is a bit tricky for SITE_URL, DISCOURSE_URL etc. without a reload
            // but for now we just save it.
            res.json({ success: true });
        } else {
            res.status(500).json({ error: t('admin.settings.save_failed') });
        }
    } catch (e) {
        logger.error('Failed to save setting:', e);
        res.status(500).json({ error: t('admin.settings.save_failed') });
    }
});

// Basic settings keys (category = 'basic')
const BASIC_KEYS = ['SITE_TITLE', 'META_DESCRIPTION', 'META_KEYWORDS', 'SUGGESTION_CARDS'];

app.get('/api/admin/basic-settings', adminOnly, async (req, res) => {
    try {
        if (BASIC_KEYS.length === 0) {
            return res.json({ siteTitle: '', metaDescription: '', metaKeywords: '', suggestionCards: [] });
        }
        const placeholders = BASIC_KEYS.map((_, i) => `$${i + 1}`).join(', ');
        const rows = await db.getAll(
            `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
            BASIC_KEYS
        );
        const map = {};
        rows.forEach((r) => { map[r.key] = r.value; });
        const suggestionCardsRaw = map.SUGGESTION_CARDS;
        let suggestionCards = [];
        if (suggestionCardsRaw) {
            try {
                suggestionCards = JSON.parse(suggestionCardsRaw);
                if (!Array.isArray(suggestionCards)) suggestionCards = [];
            } catch (_) { suggestionCards = []; }
        }
        res.json({
            siteTitle: map.SITE_TITLE || '',
            metaDescription: map.META_DESCRIPTION || '',
            metaKeywords: map.META_KEYWORDS || '',
            suggestionCards
        });
    } catch (e) {
        logger.error('Failed to fetch basic settings:', e);
        res.status(500).json({ error: '基本設定の取得に失敗しました。' });
    }
});

app.put('/api/admin/basic-settings', adminOnly, async (req, res) => {
    const { siteTitle, metaDescription, metaKeywords, suggestionCards } = req.body;
    const SANITIZE = (s, max = 500) => {
        if (s == null || typeof s !== 'string') return '';
        return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, max);
    };
    try {
        await Settings.set('SITE_TITLE', SANITIZE(siteTitle, 200), 'basic', 'サイトタイトル');
        await Settings.set('META_DESCRIPTION', SANITIZE(metaDescription, 500), 'basic', 'meta description');
        await Settings.set('META_KEYWORDS', SANITIZE(metaKeywords, 500), 'basic', 'meta keywords');
        const cards = Array.isArray(suggestionCards) ? suggestionCards : [];
        const sanitizedCards = cards.slice(0, 50).map((c) => {
            const iconType = (c.iconType === 'svg') ? 'svg' : 'fa';
            const maxIcon = iconType === 'svg' ? 4000 : 100;
            let icon = SANITIZE(c.icon || '', maxIcon);
            if (iconType === 'svg' && icon) {
                icon = icon.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
            }
            return {
                prompt: SANITIZE(c.prompt, 500),
                text: SANITIZE(c.text, 200),
                iconType,
                icon
            };
        });
        await Settings.set('SUGGESTION_CARDS', JSON.stringify(sanitizedCards), 'basic', '提案カード');
        res.json({ success: true });
    } catch (e) {
        logger.error('Failed to save basic settings:', e);
        res.status(500).json({ error: '基本設定の保存に失敗しました。' });
    }
});

// ============== Admin: Features Management ==============
// コアが定義する基本機能の一覧
const CORE_FEATURES = [
    { id: 'chat', label: 'チャット', description: 'AIとのチャット機能', defaultLevel: 'loggedout', coreOnly: true },
    { id: 'chat-history', label: 'チャット履歴の保存', description: 'チャットを保存してあとで確認できる', defaultLevel: 'loggedin' },
    { id: 'chat-share', label: 'チャットの共有', description: 'チャットをURLで共有できる', defaultLevel: 'loggedin' },
    { id: 'voice-input', label: '音声入力', description: 'マイクでAIに話しかける', defaultLevel: 'loggedin' },
    { id: 'image-upload', label: '画像アップロード', description: 'AIに画像を送って質問できる', defaultLevel: 'loggedin' },
    { id: 'embedded-sites', label: '埋め込みサイト管理', description: '外部サイトへの埋め込みウィジェット', defaultLevel: 'loggedin' },
];

app.get('/api/admin/features', adminOnly, (req, res) => {
    try {
        const pluginFeatures = pluginManager.getRegisteredAdminFeatures ? pluginManager.getRegisteredAdminFeatures() : [];
        const allFeatures = [...CORE_FEATURES, ...pluginFeatures];

        // DBから保存済みのレベルを読み込む
        const savedRaw = Settings.get('FEATURE_LEVELS');
        let savedLevels = {};
        if (savedRaw) {
            try { savedLevels = JSON.parse(savedRaw); } catch (e) { /* ignore */ }
        }

        const features = allFeatures.map(f => ({
            ...f,
            level: savedLevels[f.id] || f.defaultLevel,
        }));

        res.json({ features, hasProPlugin: !!pluginManager.pointsPlugin });
    } catch (e) {
        logger.error('Failed to get features:', e);
        res.status(500).json({ error: '機能一覧の取得に失敗しました。' });
    }
});

app.post('/api/admin/features', adminOnly, async (req, res) => {
    try {
        const { levels } = req.body; // { featureId: 'loggedout'|'loggedin'|'pro' }
        if (!levels || typeof levels !== 'object') {
            return res.status(400).json({ error: '不正なリクエストです。' });
        }
        // バリデーション
        const validLevels = ['loggedout', 'loggedin', 'pro'];
        const sanitized = {};
        for (const [id, level] of Object.entries(levels)) {
            if (validLevels.includes(level)) sanitized[id] = level;
        }
        await Settings.set('FEATURE_LEVELS', JSON.stringify(sanitized), 'features', '機能アクセスレベル設定');
        res.json({ success: true });
    } catch (e) {
        logger.error('Failed to save features:', e);
        res.status(500).json({ error: '機能設定の保存に失敗しました。' });
    }
});

// Pro page HTML from plugin (user-aware: plugin decides what to show based on login/pro status)
app.get('/api/app/page/pro', async (req, res) => {
    const pointsPlugin = pluginManager.pointsPlugin;
    if (pointsPlugin && typeof pointsPlugin.getProPageHtml === 'function') {
        let user = null;
        if (req.session && req.session.user) {
            try { user = await User.findById(req.session.user.id); } catch (e) { /* ignore */ }
        }
        const html = pointsPlugin.getProPageHtml(user);
        if (html && typeof html === 'string') {
            // 登録済みCSSアセットをヘッダーで通知（コアはURLだけ渡す、Pro知識なし）
            const assets = pluginManager.getClientAssets();
            const cssUrls = assets.map(a => a.css).filter(Boolean);
            if (cssUrls.length) res.setHeader('X-Plugin-CSS', cssUrls.join(','));
            res.type('text/html').send(html);
            return;
        }
    }
    res.status(404).send('');
});

// Pro settings page HTML from plugin
app.get('/api/app/page/pro-settings', async (req, res) => {
    const pointsPlugin = pluginManager.pointsPlugin;
    if (pointsPlugin && typeof pointsPlugin.getProSettingsHtml === 'function') {
        let user = null;
        if (req.session && req.session.user) {
            try { user = await User.findById(req.session.user.id); } catch (e) { /* ignore */ }
        }
        const html = pointsPlugin.getProSettingsHtml(user);
        if (html && typeof html === 'string') {
            // 登録済みCSSアセットをヘッダーで通知（コアはURLだけ渡す、Pro知識なし）
            const assets = pluginManager.getClientAssets();
            const cssUrls = assets.map(a => a.css).filter(Boolean);
            if (cssUrls.length) res.setHeader('X-Plugin-CSS', cssUrls.join(','));
            res.type('text/html').send(html);
            return;
        }
    }
    res.status(404).send('');
});


// Public app config (title, meta, suggestion cards, nav extensions, pro metadata)
app.get('/api/app/config', (req, res) => {
    try {
        const siteTitle = Settings.get('SITE_TITLE') || '';
        const metaDescription = Settings.get('META_DESCRIPTION') || '';
        const metaKeywords = Settings.get('META_KEYWORDS') || '';
        let suggestionCards = [];
        const raw = Settings.get('SUGGESTION_CARDS');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    suggestionCards = parsed.map((c) => {
                        const iconType = (c.iconType === 'svg') ? 'svg' : 'fa';
                        const maxIcon = iconType === 'svg' ? 4000 : 100;
                        return {
                            prompt: String(c.prompt || '').slice(0, 500),
                            text: String(c.text || '').slice(0, 200),
                            iconType,
                            icon: String(c.icon || '').slice(0, maxIcon)
                        };
                    });
                }
            } catch (_) { /* ignore */ }
        }
        const navExtensions = (pluginManager.getNavExtensions() || []).slice(0, 20).map((n) => ({
            path: String(n.path || '').slice(0, 200),
            label: String(n.label || '').slice(0, 100),
            icon: String(n.icon || '').slice(0, 80)
        }));
        let pro = null;
        if (pluginManager.hasCapability('points')) {
            const meta = pluginManager.getProMetadata();
            if (meta && typeof meta === 'object') {
                pro = {
                    modalTitle: String(meta.modalTitle || meta.title || 'Pro').slice(0, 100),
                    modalMessage: String(meta.modalMessage || meta.message || '').slice(0, 500),
                    upgradeUrl: String(meta.upgradeUrl || meta.url || '').slice(0, 500),
                    features: Array.isArray(meta.features) ? meta.features.slice(0, 20).map((f) => String(f).slice(0, 100)) : []
                };
            }
        }
        res.json({
            siteTitle,
            metaDescription,
            metaKeywords,
            suggestionCards,
            navExtensions,
            pro
        });
    } catch (e) {
        logger.error('Failed to get app config:', e);
        res.status(500).json({ error: '設定の取得に失敗しました。' });
    }
});

// Admin User Management API
app.get('/api/admin/users', adminOnly, async (req, res) => {
    try {
        const users = await db.getAll('SELECT id, username, name, avatar_url, role, is_pro, created_at FROM users ORDER BY created_at DESC');
        // logger.info(`👥 Fetched ${users.length} users for admin panel`);
        res.json(users);
    } catch (e) {
        logger.error('Failed to fetch users:', e);
        res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました。' });
    }
});

app.post('/api/admin/users/:id/role', adminOnly, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
        return res.status(400).json({ error: '不正な権限です。' });
    }

    try {
        const result = await db.query('UPDATE users SET role = $1, updated_at = $2 WHERE id = $3', [role, new Date().toISOString(), id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'ユーザーが見つかりません。' });
        }
        res.json({ success: true });
    } catch (e) {
        logger.error('Failed to update user role:', e);
        res.status(500).json({ error: '権限の更新に失敗しました。' });
    }
});

// --- Admin: Plugin Management ---
app.get('/api/admin/plugins', adminOnly, (req, res) => {
    const plugins = pluginManager.getPluginList();
    const providers = pluginManager.getAuthProviders();
    res.json({ plugins, providers });
});

// プラグインの有効/無効は設定変更 → サーバー再起動で反映（実行中の差し替えは行わない）
app.post('/api/admin/plugins/note', adminOnly, (req, res) => {
    res.json({
        message: 'プラグインの有効/無効は設定（DISCOURSE_URL, POINTS_API_KEY等）の変更後、サーバーを再起動してください。',
        requiredRestart: true
    });
});

// --- Auth Providers API ---
app.get('/api/auth/providers', (req, res) => {
    res.json(pluginManager.getAuthProviders());
});

// --- Local Auth: Register ---
const BCRYPT_ROUNDS = 10;
app.post('/auth/local/register', async (req, res) => {
    const { username, password, email } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
    }
    if (typeof username !== 'string' || username.length < 2 || username.length > 40) {
        return res.status(400).json({ error: 'ユーザー名は2〜40文字にしてください。' });
    }
    if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'パスワードは6文字以上にしてください。' });
    }
    try {
        // Check for existing username
        const existing = await User.findByUsername(username);
        if (existing) {
            return res.status(409).json({ error: 'そのユーザー名は既に使用されています。' });
        }
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await User.createLocal({ username, email: email || null, passwordHash });
        req.session.regenerate(err => {
            if (err) return res.status(500).json({ error: 'セッションエラー' });
            req.session.user = {
                id: user.id,
                discourse_id: null,
                username: user.username,
                email: user.email,
                admin: user.role === 'admin',
                total_points: 0,
            };
            logger.info(`[local-auth] Register: ${username}`);
            res.json({ success: true });
        });
    } catch (e) {
        logger.error('[local-auth] Register error:', e.message);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// --- Local Auth: Login ---
app.post('/auth/local/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください。' });
    }
    try {
        const user = await User.findByUsername(username);
        if (!user || user.auth_provider !== 'local' || !user.password_hash) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています。' });
        }
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています。' });
        }
        req.session.regenerate(err => {
            if (err) return res.status(500).json({ error: 'セッションエラー' });
            req.session.user = {
                id: user.id,
                discourse_id: null,
                username: user.username,
                email: user.email,
                admin: user.role === 'admin',
                total_points: 0,
            };
            logger.info(`[local-auth] Login: ${username}`);
            res.json({ success: true });
        });
    } catch (e) {
        logger.error('[local-auth] Login error:', e.message);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});



// loadBestAnswers removed - bestanswer feature deprecated

// --- Plugin Upload / Delete / Restart APIs ---
const AdmZip = require('adm-zip');

// メモリストレージ（ZIPはメモリで受け取って処理する）
const pluginUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (!file.originalname.endsWith('.js') && !file.originalname.endsWith('.zip')) {
            return cb(new Error('.js または .zip ファイルのみアップロードできます'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// プラグインアップロード
app.post('/api/admin/plugins/upload', adminOnly, (req, res) => {
    pluginUpload.single('plugin')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'アップロードに失敗しました' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'ファイルが選択されていません' });
        }

        const pluginsDir = path.join(__dirname, 'lib', 'plugins');
        fs.mkdirSync(pluginsDir, { recursive: true });

        // 安全チェック: 特に危険なパターンを.jsファイル内に検出する
        const DANGEROUS_PATTERNS = [
            /require\s*\(\s*['"](child_process|fs|os|net|dgram|cluster|vm|v8|readline)['"]/,
            /process\.exit/,
            /eval\s*\(/,
            /new\s+Function\s*\(/,
            /\.exec\s*\(/,
            /\.spawn\s*\(/,
        ];

        const checkJsContent = (content) => {
            const contentStr = content.toString('utf8');
            return DANGEROUS_PATTERNS.some(pattern => pattern.test(contentStr));
        };

        try {
            if (req.file.originalname.endsWith('.zip')) {
                // --- ZIPプラグインの処理 ---
                const zip = new AdmZip(req.file.buffer);
                const entries = {};
                zip.getEntries().forEach(e => { entries[e.entryName] = e; });

                if (!entries['plugin.js']) {
                    return res.status(400).json({ error: 'ZIP内にplugin.jsが必要です' });
                }
                if (!entries['plugin.json']) {
                    return res.status(400).json({ error: 'ZIP内にplugin.jsonが必要です' });
                }

                // 安全チェック: plugin.jsの内容を検査
                if (checkJsContent(entries['plugin.js'].getData())) {
                    logger.warn(`[plugin-upload] Dangerous pattern detected in ZIP plugin.js by ${req.session?.user?.username}`);
                    return res.status(400).json({ error: 'プラグインに安全でないコードパターンが検出されました。' });
                }

                // plugin.jsonのパース
                let meta;
                try {
                    meta = JSON.parse(entries['plugin.json'].getData().toString('utf8'));
                } catch (e) {
                    return res.status(400).json({ error: 'plugin.jsonのJSON形式が不正です' });
                }
                if (!meta.id || !/^[a-zA-Z0-9\-_]+$/.test(meta.id)) {
                    return res.status(400).json({ error: 'plugin.jsonはid（英数字・ハイフン・アンダースコア）が必要です' });
                }

                // プラグインディレクトリを作成してファイルを保存
                const pluginDir = path.join(pluginsDir, meta.id);
                fs.mkdirSync(pluginDir, { recursive: true });
                fs.writeFileSync(path.join(pluginDir, 'plugin.js'), entries['plugin.js'].getData());
                fs.writeFileSync(path.join(pluginDir, 'plugin.json'), entries['plugin.json'].getData());
                if (entries['icon.png']) {
                    fs.writeFileSync(path.join(pluginDir, 'icon.png'), entries['icon.png'].getData());
                }
                if (entries['README.md']) {
                    fs.writeFileSync(path.join(pluginDir, 'README.md'), entries['README.md'].getData());
                }
                // ルート plugin.js (後方互換: 単体ロード用シム)を保存
                const shimContent = `// Auto-generated shim for ZIP plugin ${meta.id}\nmodule.exports = require('./${meta.id}/plugin.js');\n`;
                fs.writeFileSync(path.join(pluginsDir, `${meta.id}.js`), shimContent);

                logger.info(`[plugin-upload] ZIP plugin installed: ${meta.id} by ${req.session?.user?.username}`);
                res.json({ success: true, filename: `${meta.id}.js`, id: meta.id, meta });

            } else {
                // --- 単体 .js プラグインの処理 ---
                // 安全チェック: .jsファイルの内容を検査
                if (checkJsContent(req.file.buffer)) {
                    logger.warn(`[plugin-upload] Dangerous pattern detected in JS plugin by ${req.session?.user?.username}`);
                    return res.status(400).json({ error: 'プラグインに安全でないコードパターンが検出されました。' });
                }
                const safe = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9\-_.]/g, '_');
                fs.writeFileSync(path.join(pluginsDir, safe), req.file.buffer);
                logger.info(`[plugin-upload] JS plugin uploaded: ${safe} by ${req.session?.user?.username}`);
                res.json({ success: true, filename: safe });
            }
        } catch (e) {
            logger.error('[plugin-upload] Error:', e.message);
            res.status(500).json({ error: 'アップロード処理中にエラーが発生しました' });
        }
    });
});

// プラグインファイル一覧（lib/plugins/に存在するjsファイル）- 固定ルートは/:idより先に定義すること
app.get('/api/admin/plugins/files', adminOnly, (req, res) => {
    try {
        const dir = path.join(__dirname, 'lib', 'plugins');
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.js'))
            .map(f => {
                const stat = fs.statSync(path.join(dir, f));
                const pluginId = f.slice(0, -3);
                const metaPath = path.join(dir, pluginId, 'plugin.json');
                let meta = null;
                if (fs.existsSync(metaPath)) {
                    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { }
                }
                return { filename: f, size: stat.size, mtime: stat.mtime, isZipPlugin: !!meta, meta };
            });
        res.json({ files });
    } catch (e) {
        res.status(500).json({ error: 'ファイル一覧の取得に失敗しました' });
    }
});

// プラグインアイコン取得
app.get('/api/admin/plugins/:id/icon', adminOnly, (req, res) => {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9\-_]+$/.test(id)) return res.status(400).end();
    const iconPath = path.join(__dirname, 'lib', 'plugins', id, 'icon.png');
    if (!fs.existsSync(iconPath)) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(iconPath);
});

// プラグイン詳細取得
app.get('/api/admin/plugins/:id', adminOnly, (req, res) => {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9\-_]+$/.test(id)) {
        return res.status(400).json({ error: '無効なプラグインIDです' });
    }
    const pluginsDir = path.join(__dirname, 'lib', 'plugins');
    const metaPath = path.join(pluginsDir, id, 'plugin.json');
    const jsPath = path.join(pluginsDir, `${id}.js`);
    const readmePath = path.join(pluginsDir, id, 'README.md');
    const iconExists = fs.existsSync(path.join(pluginsDir, id, 'icon.png'));

    if (!fs.existsSync(jsPath)) {
        return res.status(404).json({ error: 'プラグインが見つかりません' });
    }

    let meta = { id, name: id, description: '', type: '', version: '', requiredSettings: [], settingsSchema: [] };
    if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) }; } catch (e) { }
    } else {
        // .jsのみの場合はrequireしてmetaを取得
        try {
            delete require.cache[require.resolve(jsPath)];
            const mod = require(jsPath);
            if (mod.meta) meta = { ...meta, ...mod.meta };
        } catch (e) { }
    }

    // ランタイム状態（pluginManagerから）※ p.id は meta.id またはファイル名ベース
    const pluginList = pluginManager.getPluginList();
    const runtimeInfo = pluginList.find(p => p.id === id);

    let readme = null;
    if (fs.existsSync(readmePath)) {
        try { readme = fs.readFileSync(readmePath, 'utf8'); } catch (e) { }
    }

    res.json({
        meta,
        enabled: runtimeInfo ? runtimeInfo.enabled : false,
        loaded: !!runtimeInfo,
        hasIcon: iconExists,
        readme
    });
});

// プラグインファイル削除
app.delete('/api/admin/plugins/:filename', adminOnly, (req, res) => {
    const { filename } = req.params;
    const safe = path.basename(filename);
    if (!/^[a-zA-Z0-9\-_.]+$/.test(safe) || safe.includes('..')) {
        return res.status(400).json({ error: '無効なファイル名です' });
    }
    const pluginsDir = path.join(__dirname, 'lib', 'plugins');
    const filePath = path.join(pluginsDir, safe);
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'ファイルが存在しません' });
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(filePath);
        }
        // ZIPプラグインの場合はディレクトリも削除
        const pluginId = safe.endsWith('.js') ? safe.slice(0, -3) : safe;
        const pluginDir = path.join(pluginsDir, pluginId);
        if (fs.existsSync(pluginDir) && fs.statSync(pluginDir).isDirectory()) {
            fs.rmSync(pluginDir, { recursive: true, force: true });
        }
        logger.info(`[plugin-delete] Deleted: ${safe} by ${req.session?.user?.username}`);
        res.json({ success: true });
    } catch (e) {
        logger.error('[plugin-delete] Error:', e.message);
        res.status(500).json({ error: '削除に失敗しました' });
    }
});

// サーバー再起動は SSH 等のサーバー管理ツールで行うこと
// /api/admin/restart エンドポイントはセキュリティリスクのため削除済み


const parseBlogMetadata = (content) => {
    const meta = {
        title: '',
        author: 'KAi',
        author_icon: '/image/logo.webp',
        tags: []
    };

    const lines = content.split('\n');
    let hasMeta = false;
    let yamlLines = [];

    if (lines[0] && lines[0].trim() === '---') {
        hasMeta = true;
        let i = 1;
        for (; i < lines.length; i++) {
            if (lines[i].trim() === '---') break;
            yamlLines.push(lines[i]);
        }

        yamlLines.forEach(line => {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex !== -1) {
                const k = line.substring(0, separatorIndex).trim();
                const v = line.substring(separatorIndex + 1).trim();
                const cleanV = v.replace(/^['"]|['"]$/g, '').trim();
                if (k === 'title') meta.title = cleanV;
                if (k === 'author') meta.author = cleanV;
                if (k === 'author_icon') meta.author_icon = cleanV;
                if (k === 'tags') {
                    meta.tags = cleanV.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(t => t);
                }
            }
        });

        const bodyLines = lines.slice(i + 1);
        meta.content = bodyLines.join('\n').trim();
    } else {
        meta.content = content.trim();
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) meta.title = titleMatch[1].trim();
    }

    return meta;
};

// Initialize Blog Comments Table
const initBlogDb = async () => {
    try {
        // Step 1: Create table without foreign keys to other tables first
        // (parent_id is to itself, so it's usually fine, but user_id is the problematic one)
        await db.query(`
            CREATE TABLE IF NOT EXISTS blog_comments (
                id SERIAL PRIMARY KEY,
                blog_date DATE NOT NULL,
                blog_id VARCHAR(50) NOT NULL,
                user_id TEXT,
                content TEXT NOT NULL,
                parent_id INTEGER REFERENCES blog_comments(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE
            )
        `);

        // Check and add updated_at column if it's an old table
        try {
            await db.query(`
                ALTER TABLE blog_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE
            `);
        } catch (colError) {
            // Ignore if already exists or other non-critical error
        }

        // Step 2: Add foreign key constraint to users table separately
        try {
            const hasConstraint = await db.getRow(`
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'blog_comments_user_id_fkey'
            `);
            if (!hasConstraint) {
                await db.query(`
                    ALTER TABLE blog_comments 
                    ADD CONSTRAINT blog_comments_user_id_fkey 
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                `);
                // logger.info('✅ blog_comments user_id foreign key added');
            }
        } catch (fkError) {
            logger.warn('⚠️ Could not add blog_comments_user_id_fkey. Comments will work but without hard user link.', fkError.message);
        }

        // logger.info('✅ blog_comments table ready');
    } catch (e) {
        logger.error('❌ Failed to init blog_comments table:', e);
    }
};

// Initialize Feedback Table (with correct types for JOINs)
const initFeedbackDb = async () => {
    try {
        // Create table if not exists with correct types
        // session_id: TEXT (UUIDs), message_id: INTEGER (FK to messages.id), user_id: TEXT
        await db.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY,
                session_id TEXT,
                message_id INTEGER,
                user_id TEXT,
                type VARCHAR(10) NOT NULL,
                reason TEXT,
                reason_tags JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Fix existing table if message_id is TEXT (should be INTEGER for JOIN with messages.id)
        try {
            const colCheck = await db.getRow(`
                SELECT data_type FROM information_schema.columns 
                WHERE table_name = 'feedback' AND column_name = 'message_id'
            `);

            if (colCheck && colCheck.data_type === 'text') {
                logger.warn('🔧 Fixing feedback table: message_id TEXT -> INTEGER...');

                // Drop and recreate with correct types
                await db.query(`DROP TABLE IF EXISTS feedback`);
                await db.query(`
                    CREATE TABLE feedback (
                        id SERIAL PRIMARY KEY,
                        session_id TEXT,
                        message_id INTEGER,
                        user_id TEXT,
                        type VARCHAR(10) NOT NULL,
                        reason TEXT,
                        reason_tags JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                // logger.info('✅ feedback table fixed: message_id is now INTEGER');
            }
        } catch (migrationError) {
            logger.warn('⚠️ Could not check/fix feedback columns:', migrationError.message);
        }

        // logger.info('✅ feedback table ready');
    } catch (e) {
        logger.error('❌ Failed to init feedback table:', e);
    }
};

const initSecurityDb = async () => {
    try {
        await db.query(`
            ALTER TABLE sessions
            ADD COLUMN IF NOT EXISTS embedded_site_id TEXT
        `);
        await db.query(`
            ALTER TABLE embedded_sites
            ADD COLUMN IF NOT EXISTS api_key_is_hashed BOOLEAN DEFAULT false
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_embedded_site_id
            ON sessions(embedded_site_id)
        `);

        const legacySites = await db.getAll(`
            SELECT id, api_key
            FROM embedded_sites
            WHERE api_key IS NOT NULL
              AND api_key <> ''
              AND (api_key_is_hashed IS NULL OR api_key_is_hashed = false)
        `);
        for (const site of legacySites) {
            await db.query(`
                UPDATE embedded_sites
                SET api_key = $1,
                    api_key_is_hashed = true,
                    updated_at = NOW()
                WHERE id = $2
            `, [hashApiKey(site.api_key), site.id]);
        }
    } catch (e) {
        logger.error('❌ Failed to init security migration:', e);
    }
};

// saved bestanswer logic was here (deprecated)

// saveBestAnswers removed - bestanswer feature deprecated

// Load announcements from JSON file and sync into PostgreSQL
const syncAnnouncementsFromJson = async () => {
    try {
        const raw = fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            logger.warn('ANNOUNCEMENTS_FILE must be an array. Skipping sync.');
            return;
        }

        const announcements = parsed
            .filter(a => a && typeof a.id === 'string' && typeof a.message === 'string')
            .map(a => ({
                id: a.id,
                version: Number(a.version || 1),
                title: a.title || null,
                message: a.message,
                link_text: a.linkText || null,
                link_url: a.linkUrl || null,
                created_at: a.createdAt || new Date().toISOString()
            }));

        await db.transaction(async (client) => {
            // いったん全削除してから JSON の内容を反映
            await client.query('DELETE FROM announcements');
            const insertQuery = `
                INSERT INTO announcements (id, version, title, message, link_text, link_url, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;
            for (const a of announcements) {
                await client.query(insertQuery, [a.id, a.version, a.title, a.message, a.link_text, a.link_url, a.created_at]);
            }
        });
        // logger.info(`✅ Synced ${announcements.length} announcements from JSON.`);
    } catch (e) {
        logger.error('Failed to sync announcements from JSON:', e);
    }
};

// Initial sync
(async () => {
    try {
        await syncAnnouncementsFromJson();
    } catch (e) {
        logger.error('Error during initial sync:', e);
    }
})();

const normalizeQuestion = (text = '') => {
    if (typeof text !== 'string') return '';
    return text
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .substring(0, MAX_QUESTION_LENGTH); // Prevent excessive length
};

// Toxicity Filter (AI-based)
class ToxicityFilter {
    constructor() {
        this.process = null;
        this.queue = [];
        this.isWaiting = false;
        this.start();
    }

    start() {
        logger.verbose('🚀 Starting Toxicity Filter process...');
        const pythonPath = Settings.get('PYTHON_PATH') || 'python3';
        const scriptPath = path.join(__dirname, 'bin', 'toxicity_filter.py');
        this.process = spawn(pythonPath, [scriptPath]);

        let outputBuffer = '';
        this.process.stdout.on('data', (data) => {
            outputBuffer += data.toString();
            let newlineIndex;
            while ((newlineIndex = outputBuffer.indexOf('\n')) !== -1) {
                const line = outputBuffer.substring(0, newlineIndex);
                outputBuffer = outputBuffer.substring(newlineIndex + 1);
                if (line.trim()) {
                    try {
                        const result = JSON.parse(line);
                        if (this.queue.length > 0) {
                            const { resolve } = this.queue.shift();
                            resolve(result);
                        }
                    } catch (e) {
                        logger.error('❌ Toxicity parse error:', e, 'Line:', line);
                    }
                }
                this.isWaiting = false;
                this.processNext();
            }
        });

        this.process.stderr.on('data', (data) => {
            logger.verbose(`⚠️ Toxicity Filter Stderr: ${data.toString()}`);
        });

        this.process.on('close', (code) => {
            logger.warn(`⚠️ Toxicity Filter process exited with code ${code}. Restarting in 5s...`);
            this.process = null;
            this.isWaiting = false;
            // Reject pending requests if process dies
            while (this.queue.length > 0) {
                const { reject } = this.queue.shift();
                reject(new Error('Toxicity filter process terminated'));
            }
            setTimeout(() => this.start(), 5000);
        });
    }

    processNext() {
        if (this.isWaiting || this.queue.length === 0 || !this.process) return;
        this.isWaiting = true;
        const { text } = this.queue[0];
        // Ensure text is single line
        this.process.stdin.write(text.replace(/[\r\n]/g, ' ') + '\n');
    }

    async check(text) {
        if (!text || !text.trim()) return { toxic_probability: 0 };
        return new Promise((resolve, reject) => {
            this.queue.push({ text, resolve, reject });
            this.processNext();
        });
    }
}

// const toxicityFilter = new ToxicityFilter(); // これを有効化すると重くなる可能性があります（モデルデカいのでメモリ爆発します）
const toxicityFilter = { check: async () => ({ toxic_probability: 0 }) };

// Input sanitization（AIへの入力にはHTMLエスケープを行わない）
const sanitizeInput = (text) => {
    if (typeof text !== 'string') return '';
    // コントロール文字のみ除去し、HTMLエスケープは行わない
    // （HTMLエスケープするとAIに &amp; &lt; 等が送信されてしまう）
    return text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // NULL等の危険な制御文字を除去（\t\n\rは保持）
        .trim()
        .substring(0, MAX_QUESTION_LENGTH);
};

// HTMLエスケープ専用関数（フロントエンド向け出力時のみ使用）
const escapeHtmlOutput = (text) => {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Prohibited words list (server-side only for security)
const PROHIBITED_WORDS = [

];

// Escape special regex characters
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Check for prohibited words (server-side only)
const checkProhibitedWords = (input) => {
    if (typeof input !== 'string' || !input.trim()) {
        return { containsProhibited: false, detectedWords: [] };
    }

    if (!PROHIBITED_WORDS || PROHIBITED_WORDS.length === 0) {
        return { containsProhibited: false, detectedWords: [] };
    }

    // 正規化: 全角を半角に、大文字小文字を統一
    const normalizedInput = input
        .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)) // 全角→半角
        .toLowerCase()
        .trim();

    const detectedWords = [];

    // 各禁止ワードをチェック
    for (const word of PROHIBITED_WORDS) {
        if (!word || typeof word !== 'string' || !word.trim()) {
            continue;
        }

        const normalizedWord = word
            .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
            .toLowerCase()
            .trim();

        if (!normalizedWord) {
            continue;
        }

        // 単語境界を使ったマッチング（誤検知を防ぐため）
        const escapedWord = escapeRegex(normalizedWord);
        // パターン: 文字列の先頭、または単語文字以外の後に続き、その後に単語文字以外または文字列の終わりが来る
        const wordPattern = new RegExp(
            `(^|[^\\w\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF])${escapedWord}([^\\w\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]|$)`,
            'i'
        );

        if (wordPattern.test(normalizedInput)) {
            detectedWords.push(word);
        }
    }

    return {
        containsProhibited: detectedWords.length > 0,
        detectedWords: detectedWords
    };
};

// bestAnswers removed - feature deprecated
const requestContext = new Map(); // requestId -> { normalizedQuestion, answerId, source }

// Session management for follow-up questions
// Session management for follow-up questions
// const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');
// let sessions = new Map(); // Removed
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_TURNS = 10; // Keep last 10 turns

// DB Layer provided by required './lib/db' (imported at top)

// CORS middleware for embedded requests
const embeddedCORS = async (req, res, next) => {
    const origin = req.headers.origin;

    // For preflight, we need to allow the origin if it matches any registered site
    // This is because embeddedOriginAuth hasn't run yet to populate req.embeddedSite
    // Optimization: Check if origin is allowed by ANY active site
    // Since we need to send ACAO header for the browser to allow the request
    if (origin) {
        // Exact check:
        const allSites = await db.getAll('SELECT allowed_origins FROM embedded_sites WHERE is_active = true');
        const site = allSites.find(s => {
            try { return JSON.parse(s.allowed_origins).includes(origin); }
            catch (e) { return false; }
        });

        if (site) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
        }
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
};

/**
 * Builds the final messages array for the LLM, including history, tools, and system prompts.
 * Ensruing consistency across all entry points (Site, API, Embedded).
 */
function buildPromptMessages(history = [], tools = [], customSystemPrompt = '', imageLabel = '') {
    const messages = [];
    let systemContent = '';

    // 1. Process tools (e.g., current time)
    if (Array.isArray(tools) && tools.length > 0) {
        try {
            const TOOLS_FILE = path.join(__dirname, 'tools.json');
            const currentToolsData = JSON.parse(fs.readFileSync(TOOLS_FILE, 'utf8'));
            for (const toolId of tools) {
                const tool = currentToolsData.find(t => t.id === toolId);
                if (tool) {
                    if (tool.id === 'time') {
                        const now = new Date();
                        const timeStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}時${String(now.getMinutes()).padStart(2, '0')}分`;
                        systemContent += `今の時刻: ${timeStr}\n`;
                    } else if (tool.system_prompt) {
                        systemContent += `${tool.system_prompt}\n`;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to process tools in buildPromptMessages:', e);
        }
    }

    // 2. Add custom system prompt
    if (customSystemPrompt && typeof customSystemPrompt === 'string' && customSystemPrompt.trim().length > 0) {
        const custom = customSystemPrompt.substring(0, 500).trim();
        systemContent = systemContent ? `${systemContent.trim()}\n${custom}` : custom;
    }

    // 3. Add image context
    if (imageLabel && typeof imageLabel === 'string' && imageLabel.trim().length > 0) {
        const cleanLabel = imageLabel.substring(0, 50).trim();
        const imageContext = `[画像の内容: ${cleanLabel}]`;
        systemContent = systemContent ? `${systemContent.trim()}\n${imageContext}` : imageContext;
    }

    // 4. Assemble: System Prompt first, then History
    if (systemContent.trim()) {
        messages.push({ role: 'system', content: systemContent.trim() });
    }

    // Add history (OpenAI Format: {role, content})
    // Ensure we only pass necessary fields
    history.forEach(msg => {
        if (msg.role && msg.content) {
            messages.push({ role: msg.role, content: msg.content });
        }
    });

    return messages;
}

async function getSession(sessionId) {
    if (!sessionId) return null;

    // Check memory first (for guests)
    if (guestSessions.has(sessionId)) {
        return guestSessions.get(sessionId);
    }

    // Check if session exists in DB
    const sessionRow = await db.getRow('SELECT * FROM sessions WHERE id = $1', [sessionId]);

    if (!sessionRow) return null;

    // Fetch messages with feedback (using DISTINCT ON to avoid duplicates if multiple feedback rows exist)
    const messages = await db.getAll(`
        SELECT DISTINCT ON (m.id) m.*, f.type as feedback_type 
        FROM messages m 
        LEFT JOIN feedback f ON m.id = f.message_id 
        WHERE m.session_id = $1 
        ORDER BY m.id ASC, f.created_at DESC
    `, [sessionId]);

    return {
        id: sessionRow.id,
        title: sessionRow.title,
        messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            image: (m.image && typeof m.image === 'string') ? JSON.parse(m.image) : m.image,
            timestamp: m.timestamp,
            model: m.model,
            tokensPerSec: m.tokens_per_sec,
            toxicity: m.toxicity,
            feedback: m.feedback_type
        })),
        userId: sessionRow.user_id,
        isPublic: !!sessionRow.is_public,
        shortUrl: sessionRow.short_url,
        expiresAt: sessionRow.expires_at,
        embeddedSiteId: sessionRow.embedded_site_id || null,
        isPinned: !!sessionRow.is_pinned,
        tags: (typeof sessionRow.tags === 'string' ? (JSON.parse(sessionRow.tags || '[]')) : (sessionRow.tags || [])),
        createdAt: new Date(sessionRow.created_at).getTime(),
        lastAccessedAt: new Date(sessionRow.last_accessed_at).getTime()
    };
}

async function createSession(userId = null, persist = true, creatorSid = null, embeddedSiteId = null) {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const sessionData = {
        id: sessionId,
        messages: [],
        userId: userId,
        creatorSid: creatorSid, // 客（ゲスト）のセッションIDを保存して他人が操作できないようにする
        embeddedSiteId: embeddedSiteId || null,
        title: 'New Chat',
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
    };

    if (userId) {
        // Insert into DB for logged in users
        await db.query(
            'INSERT INTO sessions (id, user_id, title, created_at, last_accessed_at, embedded_site_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [sessionId, userId, 'New Chat', now, now, embeddedSiteId || null]
        );
    } else {
        // Guest user: keep in memory only
        guestSessions.set(sessionId, sessionData);
    }

    return sessionData;
}

// Check if user can access a session
async function canAccessSession(sessionId, userId, creatorSid = null) {
    if (!sessionId) return false;
    const session = await getSession(sessionId);
    if (!session) return false;

    // Owner can always access
    const isOwner = session.userId
        ? (session.userId === userId)
        : (session.creatorSid && session.creatorSid === creatorSid);

    if (isOwner) {
        return true;
    }

    // Check if session is public
    if (session.isPublic) {
        // Check expiration
        if (session.expiresAt) {
            const expiry = new Date(session.expiresAt);
            if (expiry < new Date()) {
                logger.verbose(`[canAccessSession] Session ${sessionId} expired at ${session.expiresAt}`);
                return false;
            }
        }
        return true;
    }

    // If session has no user_id (anonymous session), it's only accessible if the creatorSID matches
    if (!session.userId) {
        return session.creatorSid && session.creatorSid === creatorSid;
    }

    return false;
}

// Delete a session
async function deleteSession(sessionId) {
    if (guestSessions.has(sessionId)) {
        guestSessions.delete(sessionId);
    } else {
        await db.query('DELETE FROM messages WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }
    if (requestContext) requestContext.delete(sessionId);
}

async function addMessageToSession(sessionId, role, content, image = null, model = null, tokensPerSec = null, toxicity = null) {
    const session = await getSession(sessionId);
    if (!session) return false;

    const now = new Date().toISOString();

    if (guestSessions.has(sessionId)) {
        // Update memory
        session.messages.push({ role, content, image, timestamp: now, model, tokens_per_sec: tokensPerSec, toxicity });
        session.lastAccessedAt = Date.now();
    } else {
        // Insert message to DB
        await db.query('INSERT INTO messages (session_id, role, content, timestamp, image, model, tokens_per_sec, toxicity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [sessionId, role, content, now, image, model, tokensPerSec, toxicity ? JSON.stringify(toxicity) : null]);

        // Update session last_accessed
        await db.query('UPDATE sessions SET last_accessed_at = $1 WHERE id = $2', [now, sessionId]);
    }

    return true;
}

// Rate Limiter / Cleanup logic modifications
// Removed setInterval(cleanupSessions...) as it was handling file persistence.
// We can keep rate limit cleanup if it exists separately.

// Endpoint adjustments
// Note: app.post('/api/ask'...) uses these functions.

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const streamTextLikeLLM = async (res, text, options = {}) => {
    const { chunkSize = 6, delayMs = 45 } = options;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    for (const chunk of chunks) {
        res.write(JSON.stringify({ content: chunk, cached: true }) + '\n');
        await wait(delayMs);
    }
};

// bestAnswer functions removed - feature deprecated
const registerAnswer = () => null;
const adjustAnswerScore = () => { };
const getBestAnswer = () => null;

// Pro user authentication middleware
const requirePro = (req, res, next) => {
    // Pro機能提供プラグインがない場合は、全員をPro扱いにして通過させる
    if (!pluginManager.hasCapability('points')) {
        return next();
    }

    if (!req.session?.user) {
        return res.status(401).json({ error: 'Login required' });
    }
    if (!req.session.user.is_pro) {
        return res.status(403).json({ error: 'Pro plan required' });
    }
    next();
};


// --- Tools ---
app.get('/api/tools', (req, res) => {
    try {
        if (!fs.existsSync(TOOLS_FILE)) {
            return res.json([]);
        }
        const toolsData = JSON.parse(fs.readFileSync(TOOLS_FILE, 'utf8'));
        // Strip out system_prompt fields for client
        const safeTools = toolsData.map(({ system_prompt, system_prompt_prefix, ...rest }) => rest);
        res.json(safeTools);
    } catch (e) {
        logger.error('Failed to load tools:', e);
        res.status(500).json({ error: 'Failed to load tools' });
    }
});

const getLogFilePath = () => {
    const date = new Date().toISOString().split('T')[0];
    // Validate date format to prevent path traversal
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format');
    }
    return path.join(logDir, `${date}.json`);
};

const writeLog = (data) => {
    const logFile = getLogFilePath();
    // PII保護のため、会話内容(question, answer)をログから削除
    const { question, answer, ...metaData } = data;
    const logEntry = JSON.stringify({
        ...metaData,
        timestamp: data.timestamp || new Date().toISOString()
    }) + '\n';

    fs.appendFile(logFile, logEntry, (err) => {
        if (err) logger.error('❌ Failed to write log:', err);
    });
};

// Rate Limiting (Enhanced)
const requestCounts = new Map(); // IP-based
const sessionRequestCounts = new Map(); // Session-based
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10;
const GLOBAL_MAX_CONCURRENT = 10; // Global concurrent request limit
let currentConcurrentRequests = 0;

const rateLimiter = (req, res, next) => {
    const ip = req.ip || 'unknown';
    const sessionId = req.session?.id;
    const now = Date.now();
    const isPro = req.session?.user?.is_pro || false;
    const limit = isPro ? 10 : 3; // 10 for Pro, 3 for Free

    // Check global concurrent limit
    if (currentConcurrentRequests >= GLOBAL_MAX_CONCURRENT) {
        return res.status(429).json({
            error: 'サーバーが混雑しています。しばらくしてからお試しください。',
            errorType: 'rate_limit'
        });
    }

    // IP-based rate limiting
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }

    const ipTimestamps = requestCounts.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
    ipTimestamps.push(now);
    requestCounts.set(ip, ipTimestamps);

    if (ipTimestamps.length > limit) {
        return res.status(429).json({
            error: isPro
                ? 'リクエストが多すぎます。少し待ってから再試行してください。'
                : '無料プランの上限に達しました。Proプランでは制限が緩和されます。',
            errorType: 'rate_limit'
        });
    }

    // Session-based rate limiting (additional layer)
    if (sessionId) {
        if (!sessionRequestCounts.has(sessionId)) {
            sessionRequestCounts.set(sessionId, []);
        }

        const sessionTimestamps = sessionRequestCounts.get(sessionId).filter(t => now - t < RATE_LIMIT_WINDOW);
        sessionTimestamps.push(now);
        sessionRequestCounts.set(sessionId, sessionTimestamps);

        // Stricter limit per session
        const sessionLimit = isPro ? 15 : 5;
        if (sessionTimestamps.length > sessionLimit) {
            return res.status(429).json({
                error: 'セッションあたりのリクエスト上限に達しました。',
                errorType: 'rate_limit'
            });
        }
    }

    next();
};

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();

    // Cleanup IP-based counts
    for (const [ip, timestamps] of requestCounts.entries()) {
        const filtered = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
        if (filtered.length === 0) {
            requestCounts.delete(ip);
        } else {
            requestCounts.set(ip, filtered);
        }
    }

    // Cleanup session-based counts
    for (const [sessionId, timestamps] of sessionRequestCounts.entries()) {
        const filtered = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
        if (filtered.length === 0) {
            sessionRequestCounts.delete(sessionId);
        } else {
            sessionRequestCounts.set(sessionId, filtered);
        }
    }
}, 5 * 60 * 1000);

// Cleanup old guestSessions entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of guestSessions.entries()) {
        if (now - session.lastAccessedAt > 30 * 60 * 1000) {
            guestSessions.delete(id);
        }
    }
}, 10 * 60 * 1000);

// Cleanup old requestContext entries every 10 minutes (prevent memory leak)
setInterval(() => {
    if (requestContext.size > 10000) {
        // Clear oldest half if too large
        const entries = Array.from(requestContext.entries());
        const toDelete = [];
        const now = Date.now();
        entries.forEach(([requestId, { timestamp }]) => {
            if (now - timestamp > 24 * 60 * 60 * 1000) {
                toDelete.push(requestId);
            }
        });
        toDelete.forEach(id => requestContext.delete(id));
        if (toDelete.length > 0) {
            logger.verbose(`🧹 Cleaned up ${toDelete.length} requestContext entries`);
        }
    }
}, 10 * 60 * 1000);

// Fetch with timeout
const fetchWithTimeout = async (url, options = {}, timeout = REQUEST_TIMEOUT) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('REQUEST_TIMEOUT');
        }
        throw error;
    }
};

// API Endpoint

// (Moved to line 863)


// (Moved to startServer sequence for proper async dependency management)


app.post('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Logout error:', err);
        res.json({ success: true });
    });
});

app.get('/auth/logout', (req, res) => {
    res.status(405).json({ error: 'Use POST /auth/logout' });
});

app.get('/api/user/me', async (req, res) => {
    if (req.session.user) {
        // Reload user to get latest status
        const user = await User.findById(req.session.user.id);
        if (user) {
            // PointsService がない場合は Pro 機能を全開放
            const proEnabled = pluginManager.hasCapability('points');
            let isPro = !proEnabled; // プラグインがなければ常に Pro 扱い

            if (proEnabled) {
                const now = new Date();
                if (user.pro_expiry && new Date(user.pro_expiry) > now) {
                    isPro = true;
                } else if (user.pro_expiry) {
                    // Expired, try auto-renew if enabled
                    if (user.auto_renew !== false) {
                        logger.verbose(`🔄 Attempting auto-renew for ${user.username}...`);
                        const success = await PointsService.deductPoints(user.username, 100, 'Pro Plan Auto-Renewal');
                        if (success) {
                            await User.recordSpending(user.username, 100);
                            const newExpiry = new Date();
                            newExpiry.setMonth(newExpiry.getMonth() + 1);
                            await User.setProExpiry(user.username, newExpiry);
                            isPro = true;
                            logger.info(`✅ Auto-renewed Pro for ${user.username}`);
                            pluginManager.onProGrant(user.username).catch(e => logger.error('onProGrant (auto-renew) error:', e.message));
                        }
                    }
                }
            }

            // Fetch actual points
            let actualPoints = 0;
            let pointsServiceAvailable = true;
            if (proEnabled) {
                try {
                    actualPoints = await PointsService.checkPoints(user.username);
                } catch (err) {
                    pointsServiceAvailable = false;
                    refreshServiceStatus('points', false);
                }
            }

            req.session.user.is_pro = isPro;
            req.session.user.admin = user.role === 'admin';

            res.json({
                loggedIn: true,
                user: {
                    ...user,
                    total_points: actualPoints,
                    is_pro: isPro,
                    points_service_available: pointsServiceAvailable,
                    pro_enabled: proEnabled
                }
            });
        } else {
            req.session.destroy();
            res.json({ loggedIn: false });
        }
    } else {
        res.json({ loggedIn: false });
    }
});

// User Settings Endpoints
app.get('/api/user/settings', async (req, res) => {
    if (!req.session.user) {
        // Return default settings for non-logged-in users
        return res.json({
            save_text_history: true,
            save_image_history: true,
            pro_settings: {
                systemPrompt: '',
                temperature: 0.3,
                top_p: 0.85,
                theme: 'blue',
                colorMode: 'system'
            },
            has_agreed_terms: false
        });
    }

    const proEnabled = pluginManager.hasCapability('points');
    const settings = await User.getSettings(req.session.user.id);
    res.json({
        ...settings,
        pro_enabled: proEnabled
    });
});

app.post('/api/user/settings', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Login required' });
    }

    const { save_text_history, save_image_history, pro_settings, has_agreed_terms } = req.body;

    const settings = {};
    if (save_text_history !== undefined) settings.save_text_history = !!save_text_history;
    if (save_image_history !== undefined) settings.save_image_history = !!save_image_history;
    if (has_agreed_terms !== undefined) settings.has_agreed_terms = !!has_agreed_terms;

    // Validate and sanitize pro_settings
    if (pro_settings !== undefined && typeof pro_settings === 'object') {
        const validThemes = ['blue', 'purple', 'green', 'orange'];
        const validColorModes = ['system', 'light', 'dark'];

        const sanitizedProSettings = {};

        // systemPrompt: string, max 500 chars, sanitize control chars
        if (pro_settings.systemPrompt !== undefined) {
            const prompt = String(pro_settings.systemPrompt || '');
            sanitizedProSettings.systemPrompt = prompt
                .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
                .substring(0, 500);
        }

        // temperature: number, 0-2
        if (pro_settings.temperature !== undefined) {
            const temp = parseFloat(pro_settings.temperature);
            if (!isNaN(temp)) {
                sanitizedProSettings.temperature = Math.max(0, Math.min(2, temp));
            }
        }

        // top_p: number, 0-1
        if (pro_settings.top_p !== undefined) {
            const topP = parseFloat(pro_settings.top_p);
            if (!isNaN(topP)) {
                sanitizedProSettings.top_p = Math.max(0, Math.min(1, topP));
            }
        }

        // theme: must be one of valid themes
        if (pro_settings.theme !== undefined) {
            if (validThemes.includes(pro_settings.theme)) {
                sanitizedProSettings.theme = pro_settings.theme;
            }
        }

        // colorMode: must be one of valid modes
        if (pro_settings.colorMode !== undefined) {
            if (validColorModes.includes(pro_settings.colorMode)) {
                sanitizedProSettings.colorMode = pro_settings.colorMode;
            }
        }

        // selectedTools: array of strings
        if (pro_settings.selectedTools !== undefined && Array.isArray(pro_settings.selectedTools)) {
            sanitizedProSettings.selectedTools = pro_settings.selectedTools
                .filter(t => typeof t === 'string' && t.length < 50)
                .slice(0, 10); // Limit to 10 tools
        }

        // recentlyUsedTools: array of strings
        if (pro_settings.recentlyUsedTools !== undefined && Array.isArray(pro_settings.recentlyUsedTools)) {
            sanitizedProSettings.recentlyUsedTools = pro_settings.recentlyUsedTools
                .filter(t => typeof t === 'string' && t.length < 50)
                .slice(0, 3); // Limit to 3 tools
        }

        // hiddenTools: array of strings
        if (pro_settings.hiddenTools !== undefined && Array.isArray(pro_settings.hiddenTools)) {
            sanitizedProSettings.hiddenTools = pro_settings.hiddenTools
                .filter(t => typeof t === 'string' && t.length < 50)
                .slice(0, 50);
        }

        // skipToolHideConfirm: boolean
        if (pro_settings.skipToolHideConfirm !== undefined) {
            sanitizedProSettings.skipToolHideConfirm = !!pro_settings.skipToolHideConfirm;
        }

        settings.pro_settings = sanitizedProSettings;
    }

    const user = await User.updateSettings(req.session.user.id, settings);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const currentSettings = await User.getSettings(req.session.user.id);
    res.json({ success: true, settings: currentSettings });
});



// Sitemap generator
app.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = (Settings.get('SITE_URL') || 'http://localhost:3008').replace(/\/$/, '');
        const staticPages = [
            '/',
            '/pages',
            '/pages/privacy',
            '/pages/terms',
            '/pages/pro',
            '/pages/faq',
            '/blogs'
        ];

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Base pages
        const now = new Date().toISOString().split('T')[0];
        for (const page of staticPages) {
            xml += '  <url>\n';
            xml += `    <loc>${baseUrl}${page}</loc>\n`;
            xml += `    <lastmod>${now}</lastmod>\n`;
            xml += '    <changefreq>daily</changefreq>\n';
            xml += '    <priority>1.0</priority>\n';
            xml += '  </url>\n';
        }

        // Blog posts
        const blogDir = path.join(__dirname, 'blogs');
        if (fs.existsSync(blogDir)) {
            const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const match = file.match(/^(\d{4}-\d{2}-\d{2})_(\d+)\.md$/);
                if (match) {
                    const date = match[1];
                    const id = match[2];
                    xml += '  <url>\n';
                    xml += `    <loc>${baseUrl}/blogs/${date}/${id}</loc>\n`;
                    xml += `    <lastmod>${date}</lastmod>\n`;
                    xml += '    <changefreq>weekly</changefreq>\n';
                    xml += '    <priority>0.8</priority>\n';
                    xml += '  </url>\n';
                }
            }
        }

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (e) {
        console.error('Sitemap error:', e);
        res.status(500).end();
    }
});

// ============== Blog API ==============

app.get('/api/blogs', async (req, res) => {
    try {
        const blogDir = path.join(__dirname, 'blogs');
        if (!fs.existsSync(blogDir)) {
            return res.json({ blogs: [] });
        }

        const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));
        const blogs = files.map(file => {
            const match = file.match(/^(\d{4}-\d{2}-\d{2})_(\d+)\.md$/);
            if (!match) return null;

            const date = match[1];
            const id = parseInt(match[2], 10);
            const content = fs.readFileSync(path.join(blogDir, file), 'utf8');
            const meta = parseBlogMetadata(content);

            return {
                date,
                id,
                title: meta.title || `Blog ${date} #${id}`,
                author: meta.author,
                author_icon: meta.author_icon,
                tags: meta.tags
            };
        }).filter(Boolean);

        blogs.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return b.id - a.id;
        });

        res.json({ blogs });
    } catch (error) {
        console.error('GET /api/blogs error:', error);
        res.status(500).json({ error: 'Failed to load blogs' });
    }
});

app.get('/api/blogs/:date/:id?', async (req, res) => {
    try {
        const { date, id = '1' } = req.params;

        // Strict validation to prevent Path Traversal
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d+$/.test(id)) {
            logger.warn(`🚫 Invalid blog request blocked: date=${date}, id=${id}`);
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        const filename = `${date}_${id}.md`;
        const filePath = path.join(__dirname, 'blogs', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const meta = parseBlogMetadata(content);

        res.json({
            date,
            id,
            title: meta.title || `Blog ${date} #${id}`,
            author: meta.author,
            author_icon: meta.author_icon,
            tags: meta.tags,
            content: meta.content
        });
    } catch (error) {
        console.error('GET /api/blogs/:date/:id error:', error);
        res.status(500).json({ error: 'Failed to load blog post' });
    }
});

// Blog Comments API
app.get('/api/blogs/:date/:id/comments', async (req, res) => {
    const { date, id } = req.params;
    try {
        const comments = await db.getAll(`
                    SELECT c.*, u.username, u.avatar_url 
                    FROM blog_comments c
                    LEFT JOIN users u ON c.user_id = u.id
                    WHERE c.blog_date = $1 AND c.blog_id = $2
                    ORDER BY c.created_at ASC
                `, [date, id]);
        res.json({ comments });
    } catch (e) {
        logger.error('Failed to get blog comments:', e);
        res.status(500).json({ error: 'Failed to get comments' });
    }
});

// Simple in-memory rate limit for comments
const commentRateLimit = new Map();

app.post('/api/blogs/:date/:id/comments', systemStatusGuard, async (req, res) => {
    const { date, id } = req.params;
    const { content, parent_id } = req.body;
    const userId = req.session.user?.id;

    if (!userId) return res.status(401).json({ error: 'ログインが必要です。' });
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'コメント内容を入力してください。' });
    if (content.length > 500) return res.status(400).json({ error: 'コメントが長すぎます（最大500文字）。' });

    // Anti-spam: Rate limit
    const now = Date.now();
    const lastPost = commentRateLimit.get(userId) || 0;
    if (now - lastPost < 10000) { // 10 seconds
        return res.status(429).json({ error: '少し待ってから再度投稿してください。' });
    }

    // Anti-spam: Prohibited words
    if (checkProhibitedWords(content).containsProhibited) {
        return res.status(400).json({ error: '不適切な言葉が含まれています。' });
    }

    // XSS対策: HTMLタグを除去し、制御文字を削除
    const cleanContent = content.trim()
        .replace(/<[^>]*>/g, '')           // HTMLタグ除去
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 危険な制御文字除去
        .substring(0, 500);

    if (!cleanContent) return res.status(400).json({ error: 'コメント内容を入力してください。' });

    try {
        const newComment = await db.getRow(`
                    INSERT INTO blog_comments (blog_date, blog_id, user_id, content, parent_id)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                `, [date, id, userId, cleanContent, parent_id || null]);

        const user = await db.getRow('SELECT username, avatar_url FROM users WHERE id = $1', [userId]);

        commentRateLimit.set(userId, now);
        res.json({ ...newComment, username: user.username, avatar_url: user.avatar_url });
    } catch (e) {
        logger.error('Failed to post blog comment:', e);
        res.status(500).json({ error: 'コメントの投稿に失敗しました。' });
    }
});

app.put('/api/blogs/:date/:id/comments/:commentId', systemStatusGuard, async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.session.user?.id;

    if (!userId) return res.status(401).json({ error: 'ログインが必要です。' });
    if (!content || content.trim().length === 0) return res.status(400).json({ error: '内容を入力してください。' });

    try {
        const comment = await db.getRow('SELECT user_id FROM blog_comments WHERE id = $1', [commentId]);
        if (!comment) return res.status(404).json({ error: 'コメントが見つかりません。' });
        if (comment.user_id !== userId) return res.status(403).json({ error: '自分のコメントのみ編集できます。' });

        if (checkProhibitedWords(content).containsProhibited) {
            return res.status(400).json({ error: '不適切な言葉が含まれています。' });
        }

        // XSS対策: HTMLタグを除去
        const cleanContent = content.trim()
            .replace(/<[^>]*>/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .substring(0, 500);

        if (!cleanContent) return res.status(400).json({ error: '内容を入力してください。' });

        await db.query('UPDATE blog_comments SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [cleanContent, commentId]);
        res.json({ success: true });
    } catch (e) {
        logger.error('Failed to update blog comment:', e);
        res.status(500).json({ error: '更新に失敗しました。' });
    }
});

app.delete('/api/blogs/:date/:id/comments/:commentId', systemStatusGuard, async (req, res) => {
    const { commentId } = req.params;
    const userId = req.session.user?.id;
    const username = req.session.user?.username;

    if (!userId) return res.status(401).json({ error: 'ログインが必要です。' });

    try {
        const comment = await db.getRow('SELECT user_id FROM blog_comments WHERE id = $1', [commentId]);
        if (!comment) return res.status(404).json({ error: 'コメントが見つかりません。' });

        // Admin or owner can delete
        const adminUsername = Settings.get('ADMIN_USERNAME');
        const isAdmin = username === adminUsername;
        if (comment.user_id !== userId && !isAdmin) {
            return res.status(403).json({ error: '権限がありません。' });
        }

        await db.query('DELETE FROM blog_comments WHERE id = $1', [commentId]);
        res.json({ success: true });
    } catch (e) {
        logger.error('Failed to delete blog comment:', e);
        res.status(500).json({ error: '削除に失敗しました。' });
    }
});

// Admin endpoint removed - announcements are managed via JSON file sync

// Avatar Proxy Endpoint (SSRF Protected)
app.get('/api/proxy/avatar', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    try {
        // Validate URL format
        if (!isValidUrl(url)) {
            logger.warn('⚠️ Invalid avatar URL format:', url);
            return res.status(400).send('Invalid URL format');
        }

        // SSRF Protection: Only allow Discourse domain
        if (!await isAllowedAvatarDomain(url)) {
            logger.warn('⚠️ Blocked avatar URL (not from allowed domain):', url);
            return res.status(403).send('URL not allowed');
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'KAi-Service/1.0'
            },
            // Timeout protection
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            logger.warn('⚠️ Failed to fetch avatar:', response.status);
            // Return default avatar on error
            return res.redirect('/default-avatar.svg');
        }

        const contentType = response.headers.get('content-type');

        // Validate content type is an image
        if (!contentType || !contentType.startsWith('image/')) {
            logger.warn('⚠️ Invalid content type for avatar:', contentType);
            return res.redirect('/default-avatar.svg');
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Stream the response body to the client
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('Avatar proxy error:', err.message);
        // Return default avatar on error
        res.redirect('/default-avatar.svg');
    }
});
// Pro Plan API routes (subscribe / cancel / metadata) はポイントプラグインが registerProRoutes() で登録する

// Points Deduction API (Removed - using external service)
// app.post('/api/services/points/deduct', ...);
// AI Settings Model Selection
app.post('/api/ai-settings/model', (req, res) => {
    const { model } = req.body;
    if (model === 'normal' || model === 'tinyswallow') {
        req.session.selectedModel = model;
        res.json({ success: true, model });
    } else {
        res.status(400).json({ error: 'Invalid model' });
    }
});

app.get('/api/ai-settings', (req, res) => {
    res.json({
        selectedModel: req.session.selectedModel || 'normal'
    });
});

app.post('/api/ask', systemStatusGuard, rateLimiter, async (req, res) => {
    currentConcurrentRequests++;

    try {
        const {
            question,
            agreedToTerms,
            forceRegenerate = false,
            imageLabel, // Image classification result
            image, // Base64 image data
            saveImageHistory = true, // User preference (default: save)
            saveTextHistory = true, // User preference (default: save)
            // Pro features
            systemPrompt: customSystemPrompt,
            temperature,
            top_p,
            tools = []
        } = req.body;

        // Validate image size before processing (1MB limit)
        if (image && typeof image === 'string') {
            // Base64 string size check (1MB = ~1.33MB in base64)
            const base64Size = image.length * 0.75; // Approximate decoded size
            if (base64Size > 1 * 1024 * 1024) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: '画像サイズは1MB以下にしてください。',
                    errorType: 'validation'
                });
            }
        }

        const isPro = req.session?.user?.is_pro || false;

        if (!agreedToTerms) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: '利用規約への同意が必要です。',
                errorType: 'validation'
            });
        }

        // Sanitize and validate input
        const sanitizedQuestion = sanitizeInput(question);

        if (!sanitizedQuestion || sanitizedQuestion.length < MIN_QUESTION_LENGTH || sanitizedQuestion.length > MAX_QUESTION_LENGTH) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: `質問は${MIN_QUESTION_LENGTH}文字以上${MAX_QUESTION_LENGTH}文字以内で入力してください。`,
                errorType: 'validation'
            });
        }

        // Check for prohibited words (Legacy)
        const prohibitedCheck = checkProhibitedWords(sanitizedQuestion);
        if (prohibitedCheck.containsProhibited) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: '規約違反の可能性を検知！意図せぬ内容であれば、お気になさらず！',
                errorType: 'prohibited_content'
            });
        }

        // AI-based Toxicity Check
        let toxicityResult = { toxic_probability: 0 };
        try {
            // toxicityResult = await toxicityFilter.check(sanitizedQuestion);
            logger.verbose(`🔍 Toxicity Check [User]: ${toxicityResult.toxic_probability.toFixed(4)}`);

            // "Really bad" content threshold (95%)
            if (toxicityResult.toxic_probability >= 0.95) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: '申し訳ございませんが、利用規約に抵触する表現が含まれているため、お答えすることができません。',
                    errorType: 'prohibited_content',
                    isBlocked: true
                });
            }
        } catch (e) {
            console.error('Toxicity check failed:', e);
        }

        const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
        const requestId = uuidv4();
        const userId = req.session?.user?.id || null;
        const session = await createSession(userId, saveTextHistory, req.session?.id);
        const sessionId = session.id;
        const startTime = Date.now();
        const normalizedQuestion = normalizeQuestion(sanitizedQuestion);
        requestContext.set(requestId, { normalizedQuestion, answerId: null, source: 'model', sessionId });

        try {
            const isPro = req.session?.user?.is_pro || false;

            // Build messages array using shared helper
            const messages = buildPromptMessages(
                [], // No history for initial ask
                isPro ? tools : [],
                isPro ? customSystemPrompt : '',
                imageLabel
            );
            // Add current question
            messages.push({ role: 'user', content: sanitizedQuestion });

            // Determine model and URL
            const selectedModelId = req.body.model || req.session.selectedModel || 'normal';
            const modelInfo = getModelInfo(selectedModelId);
            const apiUrl = modelInfo.apiUrl;
            const modelName = modelInfo.modelFile;
            const modelDisplayName = modelInfo.name;

            const response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages: messages,
                    temperature: (isPro && typeof temperature === 'number') ? Math.max(0, Math.min(2, temperature)) : 0.3,
                    top_p: (isPro && typeof top_p === 'number') ? Math.max(0, Math.min(1, top_p)) : 0.85,
                    top_k: 40,
                    repeat_penalty: 1.1,
                    max_tokens: 256,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`LLAMA_SERVER_ERROR: ${response.statusText}`);
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.setHeader('X-Request-ID', requestId);
            res.setHeader('X-Session-ID', sessionId);
            res.flushHeaders();

            res.write(': start\n\n');

            const decoder = new TextDecoder();
            let buffer = '';
            let fullAnswer = '';
            let tokenCount = 0;
            const generationStartTime = Date.now();

            for await (const chunk of response.body) {
                const text = decoder.decode(chunk, { stream: true });
                buffer += text;

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (!line || line === 'data: [DONE]') continue;

                    try {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            const json = JSON.parse(jsonStr);

                            if (json.choices && json.choices[0] && json.choices[0].delta) {
                                const content = json.choices[0].delta.content;
                                if (content) {
                                    res.write(JSON.stringify({ content: content }) + '\n');
                                    if (res.flush) res.flush();
                                    fullAnswer += content;
                                    tokenCount++;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing llama.cpp line:', line, e);
                    }
                }
            }

            // Calculate stats
            const generationDuration = (Date.now() - generationStartTime) / 1000;
            const tokensPerSec = generationDuration > 0 ? tokenCount / generationDuration : 0;

            // Perform toxicity check on AI answer
            let answerToxicity = { toxic_probability: 0 };
            try {
                // answerToxicity = await toxicityFilter.check(fullAnswer);
                if (answerToxicity.toxic_probability > 0.7) {
                    logger.warn(`🚫 Toxic AI output detected: ${answerToxicity.toxic_probability.toFixed(4)}`);
                }
                logger.verbose(`🔍 Toxicity Check [AI]: ${answerToxicity.toxic_probability.toFixed(4)}`);
            } catch (e) {
                console.error('Answer toxicity check failed:', e);
            }

            // Send metadata including toxicity info
            res.write(JSON.stringify({
                metadata: {
                    model: modelDisplayName,
                    tokensPerSec: tokensPerSec,
                    timestamp: new Date().toISOString(),
                    toxicity: {
                        userScore: toxicityResult.toxic_probability,
                        aiScore: answerToxicity.toxic_probability
                    }
                }
            }) + '\n');

            res.end();

            // Handle post-response tasks
            try {
                let imageMeta = null;
                if (image && saveImageHistory) {
                    imageMeta = await ImageStore.saveImage(image);
                }

                const toxicityData = { userScore: toxicityResult.toxic_probability, aiScore: answerToxicity.toxic_probability };
                const savedAnswer = (toxicityData.aiScore >= 0.95) ? '[このメッセージは利用規約に違反しているため削除されました]' : fullAnswer;

                await addMessageToSession(sessionId, 'user', sanitizedQuestion, imageMeta, null, null, toxicityData);
                await addMessageToSession(sessionId, 'assistant', savedAnswer, null, modelDisplayName, tokensPerSec, toxicityData);

                if (userId && saveTextHistory) {
                    const title = sanitizedQuestion.substring(0, 50);
                    await ChatHistory.addChat(userId, sessionId, title);
                }

                // Register answer for log/analytics if needed
                if (typeof registerAnswer === 'function') {
                    const answerId = registerAnswer({
                        normalizedQuestion,
                        question: sanitizedQuestion,
                        answer: savedAnswer,
                        answerId: requestId,
                        source: 'model'
                    });
                    requestContext.set(requestId, { normalizedQuestion, answerId, source: 'model', sessionId });
                }

                // Log response
                writeLog({
                    requestId: requestId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString(),
                    ip_hash: ipHash,
                    question: sanitizedQuestion,
                    answer: savedAnswer,
                    response_time: (Date.now() - startTime) / 1000,
                    model_version: modelDisplayName,
                    source: 'llama_server'
                });
            } catch (postErr) {
                console.error('Post-response error in /api/ask:', postErr);
            }

        } catch (error) {
            console.error('API /api/ask error:', error.message);
            let errorMessage = 'サーバーエラーが発生しました。';
            let statusCode = 500;

            if (error.message === 'REQUEST_TIMEOUT') {
                errorMessage = 'リクエストがタイムアウトしました。';
                statusCode = 504;
            } else if (error.message.includes('LLAMA_SERVER_ERROR')) {
                errorMessage = 'AIサーバーに接続できませんでした。';
                statusCode = 503;
            }

            if (!res.headersSent) {
                res.status(statusCode).json({ error: errorMessage });
            }
        } finally {
            currentConcurrentRequests--;
            requestContext.delete(requestId);
        }
    } catch (outerError) {
        currentConcurrentRequests--;
        console.error('Outer /api/ask error:', outerError);
        if (!res.headersSent) {
            res.status(500).json({ error: 'サーバー内で予期しないエラーが発生しました。' });
        }
    }
});

// Get session history endpoint (with authentication)
app.get('/api/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.session?.user?.id || null;

    const session = await getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }

    const creatorSid = req.session?.id || null;

    // Check if user can access this session
    if (!(await canAccessSession(sessionId, userId, creatorSid))) {
        return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
        sessionId: sessionId,
        title: session.title,
        messages: session.messages,
        createdAt: session.createdAt,
        isOwner: session.userId === userId,
        isPublic: session.isPublic,
        shortUrl: session.shortUrl,
        expiresAt: session.expiresAt,
        tags: session.tags,
        isPinned: session.isPinned
    });
});

// Rate limiting for share endpoint
const shareRateLimit = new Map();

// Update share settings endpoint
app.post('/api/session/:sessionId/share', async (req, res) => {
    const { sessionId } = req.params;
    const { isPublic, expiresAt } = req.body;
    const userId = req.session?.user?.id || req.ip; // Use IP for fallback if no user session
    const creatorSid = req.session?.id || null;

    // Validate sessionId (UUID format)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    // Rate limiting (max 10 requests per minute per user/IP)
    const now = Date.now();
    const userRequests = shareRateLimit.get(userId) || [];
    const validRequests = userRequests.filter(time => now - time < 60000);
    if (validRequests.length >= 20) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    validRequests.push(now);
    shareRateLimit.set(userId, validRequests);

    const session = await getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    // Only owner can change share settings
    const currentUserId = req.session?.user?.id || null;
    const isOwner = session.userId
        ? (session.userId === currentUserId)
        : (session.creatorSid && session.creatorSid === creatorSid);

    if (!isOwner) {
        return res.status(403).json({ error: 'Only the owner can share this session' });
    }

    try {
        let shortUrl = session.shortUrl;

        // Generate short URL if public and doesn't exist
        if (isPublic && !shortUrl) {
            const baseUrl = Settings.get('APP_URL') || Settings.get('SITE_URL') || 'https://bac0n.f5.si';
            const longUrl = `${baseUrl}/chat/${sessionId}`;
            shortUrl = await createShortUrl(longUrl);
        } else if (!isPublic && shortUrl) {
            // Delete short URL if making private
            await deleteShortUrl(shortUrl);
            shortUrl = null;
        }

        await db.query('UPDATE sessions SET is_public = $1, expires_at = $2, short_url = $3 WHERE id = $4', [isPublic, expiresAt || null, shortUrl || null, sessionId]);

        res.json({ success: true, isPublic, expiresAt, shortUrl });
    } catch (e) {
        console.error('Failed to update share settings:', e);
        res.status(500).json({ error: 'Failed to update share settings' });
    }
});

// Fork/Copy session endpoint
app.post('/api/session/:sessionId/fork', async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.session?.user?.id || null;
    const creatorSid = req.session?.id || null;

    const sourceSession = await getSession(sessionId);
    if (!sourceSession) {
        return res.status(404).json({ error: 'Source session not found' });
    }

    // Check if user can access the source session
    if (!(await canAccessSession(sessionId, userId, creatorSid))) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        // Create new session
        const newSessionId = uuidv4();
        const now = new Date().toISOString();
        const title = sourceSession.title || 'Copied Chat';

        await db.transaction(async (client) => {
            // Insert new session
            await client.query('INSERT INTO sessions (id, user_id, title, created_at, last_accessed_at) VALUES ($1, $2, $3, $4, $5)', [newSessionId, userId, title, now, now]);

            // Copy messages
            const insertMsgQuery = 'INSERT INTO messages (session_id, role, content, timestamp, image) VALUES ($1, $2, $3, $4, $5)';
            for (const msg of sourceSession.messages) {
                await client.query(insertMsgQuery, [newSessionId, msg.role, msg.content, now, msg.image]);
            }

            // Insert fork marker
            await client.query(insertMsgQuery, [newSessionId, 'fork-marker', 'ここから続きの会話です', now, null]);
        });

        // Add to user history if logged in
        if (userId) {
            await ChatHistory.addChat(userId, newSessionId, title);
        }

        res.json({ success: true, sessionId: newSessionId });
    } catch (e) {
        console.error('Failed to fork session:', e);
        res.status(500).json({ error: 'Failed to copy chat' });
    }
});

// Update session title endpoint
app.post('/api/session/:sessionId/title', async (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;
    const userId = req.session?.user?.id || null;
    const creatorSid = req.session?.id || null;

    // Strict ownership check
    const session = await getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const isOwner = session.userId
        ? (session.userId === userId)
        : (session.creatorSid && session.creatorSid === creatorSid);

    if (!isOwner) {
        return res.status(403).json({ error: 'Only the owner can rename this session' });
    }

    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    try {
        if (guestSessions.has(sessionId)) {
            const guestSession = guestSessions.get(sessionId);
            guestSession.title = title.substring(0, 50);
            return res.json({ success: true });
        }

        const success = await ChatHistory.updateTitle(userId || null, sessionId, title);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Session not found or access denied' });
        }
    } catch (e) {
        console.error('Failed to update title:', e);
        res.status(500).json({ error: 'Failed to update title' });
    }
});

// Truncate session history endpoint (Delete everything from a certain message onwards)
app.post('/api/session/:sessionId/truncate', async (req, res) => {
    const { sessionId } = req.params;
    const { messageId, timestamp } = req.body;
    const userId = req.session?.user?.id || null;
    const creatorSid = req.session?.id || null;

    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const isOwner = session.userId
        ? (session.userId === userId)
        : (session.creatorSid && session.creatorSid === creatorSid);

    if (!isOwner && !session.isPublic) { // Allow public sessions to be truncated by anyone (e.g., for viewing)
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        if (guestSessions.has(sessionId)) {
            const guestSession = guestSessions.get(sessionId);
            let index = -1;
            if (messageId) {
                index = guestSession.messages.findIndex(m => m.id == messageId);
            } else if (timestamp) {
                index = guestSession.messages.findIndex(m => m.timestamp === timestamp);
            }

            if (index !== -1) {
                guestSession.messages = guestSession.messages.slice(0, index);
            }
        } else {
            // Delete from DB
            if (messageId) {
                await db.query('DELETE FROM messages WHERE session_id = $1 AND id >= $2', [sessionId, messageId]);
            } else if (timestamp) {
                await db.query('DELETE FROM messages WHERE session_id = $1 AND timestamp >= $2', [sessionId, timestamp]);
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Failed to truncate session:', e);
        res.status(500).json({ error: 'Failed to delete messages' });
    }
});

// Delete session endpoint (with authentication)
app.delete('/api/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.session?.user?.id || null;
    const creatorSid = req.session?.id || null;

    // Always try to remove from user's chat history first (for orphaned entries)
    if (userId) {
        await ChatHistory.removeChat(userId, sessionId);
    }

    // Check if user can access this session
    if (!(await canAccessSession(sessionId, userId, creatorSid))) {
        // Still return success but don't expose whether session exists
        return res.json({ success: true });
    }

    await deleteSession(sessionId);
    res.json({ success: true });
});

// User history API (logged-in users only)
app.get('/api/user/history', async (req, res) => {
    if (!req.session?.user?.id) {
        return res.status(401).json({ error: 'Login required' });
    }

    const history = await ChatHistory.getHistory(req.session.user.id);
    res.json({ history });
});

// Search chats API
app.get('/api/search', async (req, res) => {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
        return res.json({ results: [] });
    }

    const query = q.trim().toLowerCase();
    const userId = req.session?.user?.id || null;
    const results = [];

    try {
        // For logged-in users, search their chat history
        if (userId) {
            const history = await ChatHistory.getHistory(userId);

            for (const item of history) {
                // First check if title matches
                const titleMatch = item.title.toLowerCase().includes(query);

                // Try to get session messages for content search
                const session = await getSession(item.id);
                let contentMatch = null;
                let preview = item.title;

                if (session && session.messages) {
                    for (const msg of session.messages) {
                        if (msg.content && msg.content.toLowerCase().includes(query)) {
                            contentMatch = true;
                            // Extract a snippet around the match
                            const index = msg.content.toLowerCase().indexOf(query);
                            const start = Math.max(0, index - 30);
                            const end = Math.min(msg.content.length, index + query.length + 50);
                            preview = (start > 0 ? '...' : '') +
                                msg.content.substring(start, end) +
                                (end < msg.content.length ? '...' : '');
                            break;
                        }
                    }
                }

                if (titleMatch || contentMatch) {
                    results.push({
                        sessionId: item.id,
                        title: item.title,
                        preview: preview,
                        timestamp: item.timestamp
                    });
                }

                // Limit results
                if (results.length >= 20) break;
            }
        } else {
            // For non-logged-in users, we can't search server-side
            // They would need to use client-side search on localStorage data
            return res.json({ results: [] });
        }

        res.json({ results });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed', results: [] });
    }
});
// Follow-up question endpoint
app.post('/api/ask-followup', systemStatusGuard, rateLimiter, async (req, res) => {
    currentConcurrentRequests++;

    try {
        const {
            question,
            sessionId,
            agreedToTerms,
            imageLabel,
            image,
            saveImageHistory = true,
            saveTextHistory = true,
            // Pro features
            systemPrompt: customSystemPrompt,
            temperature,
            top_p,
            tools = []
        } = req.body;

        // Validate image size before processing (1MB limit)
        if (image && typeof image === 'string') {
            const base64Size = image.length * 0.75; // Approximate decoded size
            if (base64Size > 1 * 1024 * 1024) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: '画像サイズは1MB以下にしてください。',
                    errorType: 'validation'
                });
            }
        }

        if (!agreedToTerms) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: '利用規約への同意が必要です。',
                errorType: 'validation'
            });
        }

        // Sanitize and validate input
        const sanitizedQuestion = sanitizeInput(question);

        if (!sanitizedQuestion || sanitizedQuestion.length < MIN_QUESTION_LENGTH || sanitizedQuestion.length > MAX_QUESTION_LENGTH) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: `質問は${MIN_QUESTION_LENGTH}文字以上${MAX_QUESTION_LENGTH}文字以内で入力してください。`,
                errorType: 'validation'
            });
        }

        // Check for prohibited words (Legacy)
        const prohibitedCheck = checkProhibitedWords(sanitizedQuestion);
        if (prohibitedCheck.containsProhibited) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: '規約違反の可能性を検知！意図せぬ内容であれば、お気になさらず！',
                errorType: 'prohibited_content'
            });
        }

        // AI-based Toxicity Check
        let toxicityResult = { toxic_probability: 0 };
        try {
            // toxicityResult = await toxicityFilter.check(sanitizedQuestion);
            logger.verbose(`🔍 Toxicity Check [User]: ${toxicityResult.toxic_probability.toFixed(4)}`);

            // "Really bad" content threshold (95%)
            if (toxicityResult.toxic_probability >= 0.95) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: '規約違反の可能性を検知！意図せぬ内容であれば、お気になさらず！',
                    errorType: 'prohibited_content',
                    isBlocked: true
                });
            }
        } catch (e) {
            console.error('Toxicity check failed:', e);
        }

        if (!sessionId) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: 'セッションIDが必要です。',
                errorType: 'validation'
            });
        }

        const session = await getSession(sessionId);
        if (!session) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: 'セッションが見つからないか期限切れです。新しい質問を開始してください。',
                errorType: 'session_expired'
            });
        }

        // Get userId from session (if logged in)
        const userId = req.session?.user?.id || null;
        const creatorSid = req.session?.id || null;

        // Check if user is the owner of the session
        const isOwner = session.userId
            ? (session.userId === userId)
            : (session.creatorSid && session.creatorSid === creatorSid);

        if (!isOwner) {
            currentConcurrentRequests--;
            return res.status(403).json({
                error: 'このセッションへの投稿権限がありません。閲覧のみ可能です。',
                errorType: 'forbidden'
            });
        }

        const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
        const requestId = uuidv4();
        const startTime = Date.now();
        const normalizedQuestion = normalizeQuestion(sanitizedQuestion);
        requestContext.set(requestId, { normalizedQuestion, answerId: null, source: 'model', sessionId });

        try {
            const isPro = req.session?.user?.is_pro || false;

            // Build messages array using shared helper
            const messages = buildPromptMessages(
                session.messages,
                isPro ? tools : [],
                isPro ? customSystemPrompt : '',
                imageLabel
            );
            // Add current question
            messages.push({ role: 'user', content: sanitizedQuestion });

            // Determine model and URL
            const selectedModelId = req.body.model || req.session.selectedModel || 'normal';
            const modelInfo = getModelInfo(selectedModelId);
            const apiUrl = modelInfo.apiUrl;
            const modelName = modelInfo.modelFile;
            const modelDisplayName = modelInfo.name;

            const response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages: messages,
                    temperature: (isPro && typeof temperature === 'number') ? Math.max(0, Math.min(2, temperature)) : 0.3,
                    top_p: (isPro && typeof top_p === 'number') ? Math.max(0, Math.min(1, top_p)) : 0.85,
                    top_k: 40,
                    repeat_penalty: 1.1,
                    max_tokens: 256,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`LLAMA_SERVER_ERROR: ${response.statusText}`);
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.setHeader('X-Request-ID', requestId);
            res.setHeader('X-Session-ID', sessionId);
            res.flushHeaders();

            res.write(': start\n\n');

            const decoder = new TextDecoder();
            let buffer = '';
            let fullAnswer = '';
            let tokenCount = 0;
            const generationStartTime = Date.now();

            for await (const chunk of response.body) {
                const text = decoder.decode(chunk, { stream: true });
                buffer += text;

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (!line || line === 'data: [DONE]') continue;

                    try {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            const json = JSON.parse(jsonStr);

                            if (json.choices && json.choices[0] && json.choices[0].delta) {
                                const content = json.choices[0].delta.content;
                                if (content) {
                                    res.write(JSON.stringify({ content: content }) + '\n');
                                    if (res.flush) res.flush();
                                    fullAnswer += content;
                                    tokenCount++;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing llama.cpp line in follow-up:', line, e);
                    }
                }
            }

            // Calculate stats
            const generationDuration = (Date.now() - generationStartTime) / 1000;
            const tokensPerSec = generationDuration > 0 ? tokenCount / generationDuration : 0;

            // Perform toxicity check on AI answer
            let answerToxicity = { toxic_probability: 0 };
            try {
                // answerToxicity = await toxicityFilter.check(fullAnswer);
                if (answerToxicity.toxic_probability > 0.7) {
                    logger.warn(`🚫 Toxic AI output detected: ${answerToxicity.toxic_probability.toFixed(4)}`);
                }
                logger.verbose(`🔍 Toxicity Check [AI Follow-up]: ${answerToxicity.toxic_probability.toFixed(4)}`);
            } catch (e) {
                console.error('Answer toxicity check failed in follow-up:', e);
            }

            // Send metadata
            res.write(JSON.stringify({
                metadata: {
                    model: modelDisplayName,
                    tokensPerSec: tokensPerSec,
                    timestamp: new Date().toISOString(),
                    toxicity: {
                        userScore: toxicityResult.toxic_probability,
                        aiScore: answerToxicity.toxic_probability
                    }
                }
            }) + '\n');

            res.end();

            // Handle post-response tasks
            try {
                let imageMeta = null;
                if (image && saveImageHistory) {
                    try {
                        imageMeta = await ImageStore.saveImage(image);
                    } catch (err) {
                        console.error('Failed to save image in follow-up:', err);
                    }
                }

                const toxicityData = { userScore: toxicityResult.toxic_probability, aiScore: answerToxicity.toxic_probability };
                const savedAnswer = (toxicityData.aiScore >= 0.95) ? '[このメッセージは利用規約に違反しているため削除されました]' : fullAnswer;
                await addMessageToSession(sessionId, 'user', sanitizedQuestion, imageMeta, null, null, toxicityData);
                await addMessageToSession(sessionId, 'assistant', savedAnswer, null, modelDisplayName, tokensPerSec, toxicityData);

                if (userId && saveTextHistory) {
                    await ChatHistory.touchChat(userId, sessionId);
                }

                if (typeof registerAnswer === 'function') {
                    const answerId = registerAnswer({
                        normalizedQuestion,
                        question: sanitizedQuestion,
                        answer: savedAnswer,
                        answerId: requestId,
                        source: 'model_followup'
                    });
                    requestContext.set(requestId, { normalizedQuestion, answerId, source: 'model_followup', sessionId });
                }

                // Log response
                writeLog({
                    requestId: requestId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString(),
                    ip_hash: ipHash,
                    question: sanitizedQuestion,
                    answer: savedAnswer,
                    response_time: (Date.now() - startTime) / 1000,
                    model_version: modelDisplayName,
                    source: 'llama_server_followup'
                });
            } catch (postErr) {
                console.error('Post-response error in /api/ask-followup:', postErr);
            }

        } catch (error) {
            console.error('API /api/ask-followup error:', error.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
            }
        } finally {
            currentConcurrentRequests--;
            requestContext.delete(requestId);
        }
    } catch (outerError) {
        currentConcurrentRequests--;
        console.error('Outer /api/ask-followup error:', outerError);
        if (!res.headersSent) {
            res.status(500).json({ error: 'サーバー内で予期しないエラーが発生しました。' });
        }
    }
});

// Feedback Endpoint
app.post('/api/feedback', async (req, res) => {
    const { requestId, type, reason, reasonTags, sessionId, messageId } = req.body;

    if (!requestId || !['good', 'bad'].includes(type)) {
        return res.status(400).json({ error: 'Invalid feedback data.' });
    }

    try {
        writeLog({
            requestId: requestId,
            feedback: type,
            reason: reason || '',
            reasonTags: reasonTags || []
        });
        const delta = type === 'good' ? 1 : -2;
        const context = requestContext.get(requestId);
        if (context && context.answerId) {
            adjustAnswerScore(context.normalizedQuestion, context.answerId, delta, type);
        } else {
            adjustAnswerScore(undefined, requestId, delta, type);
        }

        // Save feedback to database
        if (req.session?.user?.id) {
            try {
                // message_id must be INTEGER, parse or null
                const parsedMessageId = parseInt(messageId, 10);
                const dbMessageId = Number.isInteger(parsedMessageId) ? parsedMessageId : null;

                await db.query(`
                    INSERT INTO feedback (session_id, message_id, user_id, type, reason, reason_tags, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    sessionId || null,
                    dbMessageId,
                    req.session.user.id,
                    type,
                    reason || null,
                    reasonTags && reasonTags.length ? JSON.stringify(reasonTags) : null,
                    new Date().toISOString()
                ]);
            } catch (dbError) {
                console.error('Failed to save feedback to database:', dbError);
            }
        }

        requestContext.delete(requestId);
        res.json({ success: true });
    } catch (error) {
        console.error('Feedback Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/feedback', async (req, res) => {
    const { requestId, sessionId, messageId } = req.body;

    if (!requestId) {
        return res.status(400).json({ error: 'Missing requestId' });
    }

    try {
        // Log the removal
        writeLog({
            requestId: requestId,
            feedback: 'removed',
            timestamp: new Date().toISOString()
        });

        // Reset scores if possible
        adjustAnswerScore(undefined, requestId, 0, 'removed');

        // Delete from database
        if (req.session?.user?.id) {
            try {
                const parsedMessageId = parseInt(messageId, 10);
                const dbMessageId = Number.isInteger(parsedMessageId) ? parsedMessageId : null;

                if (dbMessageId) {
                    await db.query('DELETE FROM feedback WHERE message_id = $1 AND user_id = $2', [dbMessageId, req.session.user.id]);
                } else if (sessionId) {
                    await db.query('DELETE FROM feedback WHERE session_id = $1 AND user_id = $2', [sessionId, req.session.user.id]);
                }
            } catch (dbError) {
                console.error('Failed to delete feedback from database:', dbError);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Feedback Delete Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ============== Vision API ==============

// ONNX Model Setup
const VISION_MODEL_PATH = path.join(__dirname, 'models', 'kai-vision2.onnx');
const LABELS_FILE = path.join(__dirname, 'models', 'labels_ja.txt');
let visionSession = null;
let visionLabels = [];

// Load vision model and labels
const initVisionModel = async () => {
    try {
        // Load labels
        if (fs.existsSync(LABELS_FILE)) {
            visionLabels = fs.readFileSync(LABELS_FILE, 'utf8')
                .trim()
                .split('\n')
                .map(l => l.trim());
            // logger.info(`📷 Vision labels loaded: ${visionLabels.length} categories`);
        } else {
            logger.warn('⚠️ Vision labels file not found:', LABELS_FILE);
        }

        // Load ONNX model
        if (fs.existsSync(VISION_MODEL_PATH)) {
            visionSession = await ort.InferenceSession.create(VISION_MODEL_PATH);
            // logger.info('📷 Vision model loaded successfully');
        } else {
            logger.warn('⚠️ Vision model not found:', VISION_MODEL_PATH);
        }
    } catch (error) {
        logger.error('❌ Failed to load vision model:', error.message);
    }
};

// Initialize vision model
initVisionModel();

// Multer setup for image uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('画像ファイルのみアップロード可能です'), false);
        }
    }
});

// Softmax function
const softmax = (logits) => {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumExps);
};

// Serve stored images
app.get('/api/images/:filename', async (req, res) => {
    const { filename } = req.params;
    const { w, h } = req.query; // Width and height for placeholder fallbacks

    // Security check: ensure valid filename (UUID + ext)
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) {
        return res.status(400).send('Invalid filename');
    }

    try {
        const image = await ImageStore.getImage(filename);

        if (image && image.data) {
            // Found in DB, serve the binary data
            res.setHeader('Content-Type', image.mime_type || 'image/jpeg');
            return res.send(image.data);
        }

        // File does not exist (deleted or never existed)
        // Return a placeholder SVG
        const width = parseInt(w) || 800;
        const height = parseInt(h) || 600;

        const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#eee"/>
            <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#aaa" text-anchor="middle" dominant-baseline="middle">
                No Image
            </text>
            <text x="50%" y="60%" font-family="Arial" font-size="14" fill="#ccc" text-anchor="middle" dominant-baseline="middle">
                (Expired or Deleted)
            </text>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (err) {
        console.error(`Error serving image ${filename}:`, err);
        res.status(500).send('Server Error');
    }
});

// Vision Classification Endpoint with error handling
app.post('/api/vision/classify', (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            // Multer error (file type, size, etc.)
            console.error('📷 Upload error:', err.message);
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    if (!visionSession) {
        return res.status(503).json({ error: '画像認識モデルが読み込まれていません' });
    }

    if (!req.file) {
        return res.status(400).json({ error: '画像がアップロードされていません' });
    }

    try {
        // 1. Resize and preprocess image using sharp
        const imageBuffer = await sharp(req.file.buffer)
            .resize(224, 224, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer();

        // 2. Convert to float32 array and normalize (ImageNet normalization)
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];
        const float32Data = new Float32Array(1 * 3 * 224 * 224);

        // HWC to NCHW conversion with normalization
        for (let c = 0; c < 3; c++) {
            for (let h = 0; h < 224; h++) {
                for (let w = 0; w < 224; w++) {
                    const hwcIdx = (h * 224 + w) * 3 + c;
                    const nchwIdx = c * 224 * 224 + h * 224 + w;
                    const pixelValue = imageBuffer[hwcIdx] / 255.0;
                    float32Data[nchwIdx] = (pixelValue - mean[c]) / std[c];
                }
            }
        }

        // 3. Create ONNX tensor
        const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, 224, 224]);

        // 4. Run inference
        const inputName = visionSession.inputNames[0];
        const feeds = { [inputName]: inputTensor };
        const results = await visionSession.run(feeds);

        // 5. Get output logits
        const outputName = visionSession.outputNames[0];
        const logits = Array.from(results[outputName].data);

        // 6. Apply softmax
        const probabilities = softmax(logits);

        // 7. Get top prediction
        let maxIdx = 0;
        let maxProb = probabilities[0];
        for (let i = 1; i < probabilities.length; i++) {
            if (probabilities[i] > maxProb) {
                maxProb = probabilities[i];
                maxIdx = i;
            }
        }

        const confidence = Math.round(maxProb * 100);
        // If confidence is low, set label as Unknown
        const label = confidence >= 60 ? (visionLabels[maxIdx] || `カテゴリ${maxIdx}`) : '不明';

        logger.verbose(`📷 Vision: ${label} (${confidence}%)`);

        res.json({
            success: true,
            label: label,
            confidence: confidence,
            tag: `[${label}の画像]`
        });

    } catch (error) {
        console.error('❌ Vision classification error:', error);
        res.status(500).json({ error: '画像分類中にエラーが発生しました' });
    }
});

// ============== VOICEVOX Voice Synthesis Endpoints ==============
const VOICEVOX_URL = Settings.get('VOICEVOX_URL') || 'http://127.0.0.1:50021';
const DEFAULT_SPEAKER_ID = 1; // ずんだもん (ノーマル)

// Cache for speakers list
let speakersCache = null;
let speakersCacheTime = 0;
const SPEAKERS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// VOICEVOX health check
app.get('/api/voice/status', async (req, res) => {
    try {
        const response = await fetch(`${VOICEVOX_URL}/version`, {
            signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
            const version = await response.text();
            res.json({ available: true, version: version.trim() });
        } else {
            res.json({ available: false, error: 'VOICEVOX server not responding' });
        }
    } catch (error) {
        res.json({ available: false, error: error.message });
    }
});

// Get available speakers
app.get('/api/voice/speakers', async (req, res) => {
    try {
        // Return cached speakers if still valid
        const now = Date.now();
        if (speakersCache && (now - speakersCacheTime) < SPEAKERS_CACHE_TTL) {
            return res.json({ speakers: speakersCache });
        }

        const response = await fetch(`${VOICEVOX_URL}/speakers`, {
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error('Failed to fetch speakers');
        }

        const speakers = await response.json();

        // Cache the result
        speakersCache = speakers;
        speakersCacheTime = now;

        res.json({ speakers });
    } catch (error) {
        console.error('VOICEVOX speakers error:', error);
        res.status(500).json({ error: 'Failed to fetch speakers', message: error.message });
    }
});

// Synthesize voice from text
app.post('/api/voice/synthesize', async (req, res) => {
    try {
        const { text, speaker } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required' });
        }

        // Limit text length for maximum speed (150 chars max)
        const sanitizedText = text.substring(0, 150);
        const speakerId = typeof speaker === 'number' ? speaker : DEFAULT_SPEAKER_ID;

        // Step 1: Generate audio query
        logger.verbose(`[VOICEVOX] Generating audio query for text (${sanitizedText.length} chars)...`);
        const queryResponse = await fetch(
            `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(sanitizedText)}&speaker=${speakerId}&enable_interrogative_upspeak=false`,
            {
                method: 'POST',
                signal: AbortSignal.timeout(30000)
            }
        );

        if (!queryResponse.ok) {
            throw new Error(`Audio query failed: ${queryResponse.statusText}`);
        }

        const audioQuery = await queryResponse.json();

        // Optimize for maximum speed (sacrifice quality)
        audioQuery.speedScale = 1.5;           // 1.5x speed (increased from 1.3x)
        audioQuery.volumeScale = 1.0;          // Normal volume
        audioQuery.intonationScale = 1.0;      // Normal intonation
        audioQuery.prePhonemeLength = 0.05;    // Reduce pre-phoneme (faster start)
        audioQuery.postPhonemeLength = 0.05;   // Reduce post-phoneme (faster end)

        // Step 2: Synthesize speech
        logger.verbose('[VOICEVOX] Synthesizing speech...');
        const synthesisResponse = await fetch(
            `${VOICEVOX_URL}/synthesis?speaker=${speakerId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(audioQuery),
                signal: AbortSignal.timeout(45000)
            }
        );

        if (!synthesisResponse.ok) {
            throw new Error(`Synthesis failed: ${synthesisResponse.statusText}`);
        }

        // Stream the audio back to client
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        // Pipe the audio stream directly to response
        for await (const chunk of synthesisResponse.body) {
            res.write(chunk);
        }

        res.end();

    } catch (error) {
        console.error('VOICEVOX synthesis error:', error);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Voice synthesis failed',
                message: error.message,
                available: false
            });
        }
    }
});

// Serve embedded sites management page (via authenticated route)
app.get('/embedded-sites.html', requirePro, (req, res) => {
    // In a real app, you might want to move this file to private too, but for now we follow the pattern
    res.sendFile(path.join(__dirname, 'public', 'embedded-sites.html'));
});


// Serve SPA for chat deep links (only for session-like IDs to avoid asset collisions)
const serveIndex = (req, res) => {
    const indexEjsPath = path.join(VIEWS_DIR, 'index.ejs');
    ejs.renderFile(indexEjsPath, { nonce: res.locals.nonce }, (err, html) => {
        if (err) return res.status(500).send('Error loading index.ejs');
        res.send(html);
    });
};

app.get('/chat/:sessionId([A-Za-z0-9_-]{8,})', async (req, res) => {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
        return serveIndex(req, res);
    }
    serveIndex(req, res);
});

// ============== Embedded Sites Management API ==============

// Get all embedded sites (公開用・ログイン不要)
// Get all embedded sites (Pro users only)
// Helper to export all embedded sites to JSON file (for Admin)
const updateEmbeddedSitesExport = async () => {
    try {
        const sites = await db.getAll('SELECT * FROM embedded_sites ORDER BY created_at DESC');
        // Ensure data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const exportPath = path.join(DATA_DIR, 'all_embedded_sites.json');

        const data = {
            updated_at: new Date().toISOString(),
            count: sites.length,
            sites: sites.map(site => ({
                id: site.id,
                site_url: site.site_url,
                site_name: site.site_name,
                rate_limit_per_minute: site.rate_limit_per_minute,
                is_active: site.is_active,
                created_at: site.created_at,
                updated_at: site.updated_at,
                created_by: site.created_by,
                pos_desktop: site.pos_desktop,
                pos_mobile: site.pos_mobile,
                offset_x_desktop: site.offset_x_desktop,
                offset_y_desktop: site.offset_y_desktop,
                offset_x_mobile: site.offset_x_mobile,
                offset_y_mobile: site.offset_y_mobile,
                allowed_origins: site.allowed_origins ? (typeof site.allowed_origins === 'string' ? JSON.parse(site.allowed_origins) : site.allowed_origins) : []
            }))
        };

        fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to export embedded sites:', error);
    }
};

// Get all embedded sites (Pro users only)
app.get('/api/embedded-sites', requirePro, async (req, res) => {
    try {
        const userId = req.session?.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found' });
        }

        const sites = await db.getAll(`
                        SELECT id, site_url, site_name, allowed_origins, rate_limit_per_minute, is_active, created_at, updated_at, created_by, pos_desktop, pos_mobile, offset_x_desktop, offset_y_desktop, offset_x_mobile, offset_y_mobile
                        FROM embedded_sites
                        WHERE created_by = $1
                        ORDER BY created_at DESC
                    `, [userId]);

        res.json({
            sites: sites.map(site => {
                let origins = site.allowed_origins;
                if (typeof origins === 'string') {
                    try { origins = JSON.parse(origins); } catch (e) { origins = []; }
                }
                return {
                    ...site,
                    allowed_origins: origins || []
                };
            })
        });
    } catch (error) {
        console.error('GET /api/embedded-sites error:', error);
        res.status(500).json({ error: 'Failed to load embedded sites' });
    }
});

// Create new embedded site (admin only)
// Create new embedded site (Pro users only)
app.post('/api/embedded-sites', requirePro, async (req, res) => {
    try {
        const { site_url, site_name } = req.body || {};

        if (!site_url || typeof site_url !== 'string') {
            return res.status(400).json({ error: 'site_url は必須です。' });
        }

        // Validate URL
        if (!isValidUrl(site_url)) {
            return res.status(400).json({ error: '無効なURLです。' });
        }

        // Auto-detect origin from site_url
        let origin = null;
        try {
            const urlProps = new URL(site_url);
            origin = urlProps.origin;
        } catch (e) {
            return res.status(400).json({ error: '無効なURLです。' });
        }

        const allowed_origins = [origin];
        const rate_limit = 10; // Fixed rate limit

        const id = uuidv4();
        const api_key = `emb-${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = hashApiKey(api_key);
        const now = new Date().toISOString();
        const userId = req.session?.user?.id || null;

        if (!userId) {
            return res.status(401).json({ error: 'ログインが必要です。' });
        }

        // Limit to 5 sites per user
        const result = await db.getRow('SELECT COUNT(*) as count FROM embedded_sites WHERE created_by = $1', [userId]);
        const currentCount = parseInt(result.count);
        if (currentCount >= 5) {
            return res.status(400).json({ error: '作成できる埋め込みサイトは5個までです。' });
        }

        await db.query(`
                        INSERT INTO embedded_sites (id, site_url, site_name, allowed_origins, api_key, api_key_is_hashed, rate_limit_per_minute, is_active, created_at, updated_at, created_by, pos_desktop, pos_mobile, offset_x_desktop, offset_y_desktop, offset_x_mobile, offset_y_mobile)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    `, [
            id,
            site_url,
            site_name || null,
            JSON.stringify(allowed_origins),
            apiKeyHash,
            true,
            rate_limit,
            true, // Active by default
            now,
            now,
            userId,
            req.body.pos_desktop || 'bottom-right',
            req.body.pos_mobile || 'bottom-right',
            req.body.offset_x_desktop || '20px',
            req.body.offset_y_desktop || '20px',
            req.body.offset_x_mobile || '20px',
            req.body.offset_y_mobile || '20px'
        ]);

        // Update JSON file export
        await updateEmbeddedSitesExport();

        const site = await db.getRow('SELECT * FROM embedded_sites WHERE id = $1', [id]);
        let origins = site.allowed_origins;
        if (typeof origins === 'string') {
            try { origins = JSON.parse(origins); } catch (e) { origins = []; }
        }

        res.json({
            success: true,
            site: {
                ...site,
                allowed_origins: origins || [],
                api_key: undefined,
                api_key_is_hashed: undefined
            },
            apiKey: api_key, // Only shown once
            embedScript: `<script src="${Settings.get('SITE_URL') || 'https://bac0n.f5.si'}/embedded/widget.js" data-api-key="${api_key}"></script>`
        });
    } catch (error) {
        console.error('POST /api/embedded-sites error:', error);
        res.status(500).json({ error: 'Failed to create embedded site' });
    }
});

// Delete embedded site (admin only)
// Delete embedded site (Pro users only)
// Delete embedded site (Pro users only)
// Delete embedded site (Pro users only)
app.delete('/api/embedded-sites/:id', requirePro, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session?.user?.id;

        const result = await db.query('DELETE FROM embedded_sites WHERE id = $1 AND created_by = $2', [id, userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Site not found or access denied' });
        }

        // Update JSON file export
        await updateEmbeddedSitesExport();

        res.json({ success: true });
    } catch (error) {
        console.error('DELETE /api/embedded-sites error:', error);
        res.status(500).json({ error: 'Failed to delete embedded site' });
    }
});

// Update embedded site (admin only)
// Update embedded site (Pro users only)
// Update embedded site (Pro users only)
// Update embedded site (Pro users only)
app.put('/api/embedded-sites/:id', requirePro, async (req, res) => {
    try {
        const { id } = req.params;
        const { site_url, site_name, rate_limit_per_minute, is_active, pos_desktop, pos_mobile, offset_x_desktop, offset_y_desktop, offset_x_mobile, offset_y_mobile } = req.body || {};
        const userId = req.session?.user?.id;

        const existing = await db.getRow('SELECT * FROM embedded_sites WHERE id = $1 AND created_by = $2', [id, userId]);
        if (!existing) {
            return res.status(404).json({ error: 'Site not found or access denied' });
        }

        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (site_url !== undefined) {
            if (!isValidUrl(site_url)) {
                return res.status(400).json({ error: '無効なURLです。' });
            }
            updates.push(`site_url = $${paramIdx++}`);
            values.push(site_url);

            // Update allowed_origins automatically
            try {
                const urlProps = new URL(site_url);
                const origin = urlProps.origin;
                updates.push(`allowed_origins = $${paramIdx++}`);
                values.push(JSON.stringify([origin]));
            } catch (e) {
                // Should be caught by isValidUrl, but just in case
            }
        }

        if (site_name !== undefined) {
            updates.push(`site_name = $${paramIdx++}`);
            values.push(site_name || null);
        }

        if (rate_limit_per_minute !== undefined) {
            updates.push(`rate_limit_per_minute = $${paramIdx++}`);
            values.push(parseInt(rate_limit_per_minute) || 10);
        }

        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIdx++}`);
            values.push(is_active ? true : false);
        }

        // pos値の入力検証
        const VALID_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
        if (pos_desktop !== undefined) {
            if (!VALID_POSITIONS.includes(pos_desktop)) {
                return res.status(400).json({ error: '無効な pos_desktop 値です。' });
            }
            updates.push(`pos_desktop = $${paramIdx++}`);
            values.push(pos_desktop);
        }
        if (pos_mobile !== undefined) {
            if (!VALID_POSITIONS.includes(pos_mobile)) {
                return res.status(400).json({ error: '無効な pos_mobile 値です。' });
            }
            updates.push(`pos_mobile = $${paramIdx++}`);
            values.push(pos_mobile);
        }
        // offset値の入力検証（CSS数値のみ許可）
        const VALID_OFFSET = /^\d+(px|em|rem|%)$/;
        if (offset_x_desktop !== undefined) {
            if (!VALID_OFFSET.test(offset_x_desktop)) {
                return res.status(400).json({ error: '無効な offset_x_desktop 値です。' });
            }
            updates.push(`offset_x_desktop = $${paramIdx++}`);
            values.push(offset_x_desktop);
        }
        if (offset_y_desktop !== undefined) {
            if (!VALID_OFFSET.test(offset_y_desktop)) {
                return res.status(400).json({ error: '無効な offset_y_desktop 値です。' });
            }
            updates.push(`offset_y_desktop = $${paramIdx++}`);
            values.push(offset_y_desktop);
        }
        if (offset_x_mobile !== undefined) {
            if (!VALID_OFFSET.test(offset_x_mobile)) {
                return res.status(400).json({ error: '無効な offset_x_mobile 値です。' });
            }
            updates.push(`offset_x_mobile = $${paramIdx++}`);
            values.push(offset_x_mobile);
        }
        if (offset_y_mobile !== undefined) {
            if (!VALID_OFFSET.test(offset_y_mobile)) {
                return res.status(400).json({ error: '無効な offset_y_mobile 値です。' });
            }
            updates.push(`offset_y_mobile = $${paramIdx++}`);
            values.push(offset_y_mobile);
        }

        if (updates.length > 0) {
            updates.push(`updated_at = $${paramIdx++}`);
            values.push(new Date().toISOString());

            values.push(id);
            values.push(userId);
            const query = `UPDATE embedded_sites SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND created_by = $${paramIdx++}`;
            await db.query(query, values);

            // Update JSON file export
            await updateEmbeddedSitesExport();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('PUT /api/embedded-sites error:', error);
        res.status(500).json({ error: 'Failed to update embedded site' });
    }
});

// ============== Embedded Widget API ==============



// CORS middleware for embedded requests

// CORS middleware for embedded requests


// Rate limiting and Auth for embedded requests (per Origin)
const embeddedRequestCounts = new Map(); // origin -> [{timestamp, ip}]

const embeddedOriginAuth = async (req, res, next) => {
    let origin = req.headers.origin || null;
    if (!origin && req.headers.referer) {
        try {
            origin = new URL(req.headers.referer).origin;
        } catch (e) {
            origin = null;
        }
    }

    if (!origin) {
        return res.status(401).json({ error: 'Origin header required' });
    }

    const allSites = await db.getAll('SELECT * FROM embedded_sites WHERE is_active = true');

    const site = allSites.find(s => {
        try {
            const allowed = typeof s.allowed_origins === 'string' ? JSON.parse(s.allowed_origins) : s.allowed_origins;
            return Array.isArray(allowed) && allowed.includes(origin);
        } catch (e) {
            return false;
        }
    });

    if (!site) {
        return res.status(403).json({ error: 'Origin not allowed' });
    }

    const embeddedKey = getEmbeddedKeyFromRequest(req);
    const hasProvidedKey = !!embeddedKey;
    let isEmbeddedKeyValid = false;
    if (embeddedKey && site.api_key) {
        const isHashed = site.api_key_is_hashed === true || site.api_key_is_hashed === 't';
        if (isHashed) {
            isEmbeddedKeyValid = hashApiKey(embeddedKey) === site.api_key;
        } else {
            isEmbeddedKeyValid = embeddedKey === site.api_key;
            if (isEmbeddedKeyValid) {
                // Auto-migrate legacy plain key storage on successful auth.
                await db.query(
                    'UPDATE embedded_sites SET api_key = $1, api_key_is_hashed = true, updated_at = $2 WHERE id = $3',
                    [hashApiKey(embeddedKey), new Date().toISOString(), site.id]
                );
                site.api_key = hashApiKey(embeddedKey);
                site.api_key_is_hashed = true;
            }
        }
    }

    if (hasProvidedKey && !isEmbeddedKeyValid) {
        return res.status(401).json({ error: 'Invalid embedded API key' });
    }

    if (!hasProvidedKey) {
        if (isEmbeddedAuthEnforced()) {
            return res.status(401).json({
                error: 'Embedded API key required',
                code: 'embedded_key_required'
            });
        }
        if (embeddedAuthEnforceAt) {
            res.setHeader('X-Embedded-Auth-Deprecated', '1');
            res.setHeader('X-Embedded-Auth-Deadline', embeddedAuthEnforceAt.toISOString());
        }
    }

    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    if (!embeddedRequestCounts.has(origin)) {
        embeddedRequestCounts.set(origin, []);
    }

    const requests = embeddedRequestCounts.get(origin);
    const recentRequests = requests.filter(r => now - r.timestamp < windowMs);

    if (recentRequests.length >= site.rate_limit_per_minute) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            errorType: 'rate_limit'
        });
    }

    recentRequests.push({ timestamp: now, ip });
    embeddedRequestCounts.set(origin, recentRequests);

    let origins = site.allowed_origins;
    if (typeof origins === 'string') {
        try { origins = JSON.parse(origins); } catch (e) { origins = []; }
    }

    req.embeddedSite = {
        ...site,
        allowed_origins: origins || []
    };
    req.embeddedAuthMode = hasProvidedKey ? 'key' : 'legacy-origin';

    next();
};



// Embedded chat API endpoint
app.post('/api/embedded/ask', embeddedOriginAuth, async (req, res) => {
    currentConcurrentRequests++;

    try {
        const {
            question,
            sessionId: providedSessionId,
            agreedToTerms = true,
            imageLabel,
            image,
            temperature,
            top_p,
            tools = [],
            saveImageHistory = false,
            saveTextHistory = true
        } = req.body;

        // ... (toxicity and validation skipped for brevity in this chunk, I'll keep them)
        // Wait, I should include the validation code if I'm replacing a large block.
        // Actually, I'll only replace the part after validation.

        // Validate image size
        if (image && typeof image === 'string') {
            const base64Size = image.length * 0.75;
            if (base64Size > 1 * 1024 * 1024) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: '画像サイズは1MB以下にしてください。',
                    errorType: 'validation'
                });
            }
        }

        // Sanitize and validate input
        const sanitizedQuestion = sanitizeInput(question);

        if (!sanitizedQuestion || sanitizedQuestion.length < MIN_QUESTION_LENGTH || sanitizedQuestion.length > MAX_QUESTION_LENGTH) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: `質問は${MIN_QUESTION_LENGTH}文字以上${MAX_QUESTION_LENGTH}文字以内で入力してください。`,
                errorType: 'validation'
            });
        }

        // Check for prohibited words (Legacy)
        const prohibitedCheck = checkProhibitedWords(sanitizedQuestion);
        if (prohibitedCheck.containsProhibited) {
            currentConcurrentRequests--;
            return res.status(400).json({
                error: '規約違反の可能性を検知！意図せぬ内容であれば、お気になさらず！',
                errorType: 'prohibited_content'
            });
        }

        // AI-based Toxicity Check
        let toxicityResult = { toxic_probability: 0 };
        try {
            // toxicityResult = await toxicityFilter.check(sanitizedQuestion);
            logger.verbose(`🔍 Toxicity Check [User]: ${toxicityResult.toxic_probability.toFixed(4)}`);

            // "Really bad" content threshold (95%)
            if (toxicityResult.toxic_probability >= 0.95) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: '規約違反の可能性を検知！意図せぬ内容であれば、お気になさらず！',
                    errorType: 'prohibited_content',
                    isBlocked: true
                });
            }
        } catch (e) {
            console.error('Toxicity check failed:', e);
        }

        const siteOwnerId = req.embeddedSite.created_by;
        const siteOwner = siteOwnerId ? await User.findById(siteOwnerId) : null;
        const siteOwnerIsPro = siteOwner ? siteOwner.is_pro : false;

        const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
        const requestId = uuidv4();

        let session;
        if (providedSessionId) {
            if (!UUID_REGEX.test(providedSessionId)) {
                currentConcurrentRequests--;
                return res.status(400).json({
                    error: 'Invalid session ID format',
                    errorType: 'validation'
                });
            }
            session = await getSession(providedSessionId);
            if (session) {
                const isBoundToThisEmbeddedSite = session.embeddedSiteId && session.embeddedSiteId === req.embeddedSite.id;
                if (!isBoundToThisEmbeddedSite) {
                    if (isEmbeddedAuthEnforced()) {
                        currentConcurrentRequests--;
                        return res.status(403).json({
                            error: 'Session does not belong to this embedded site',
                            errorType: 'authorization'
                        });
                    }
                    session = null;
                }
            }
        }
        if (!session) {
            session = await createSession(null, saveTextHistory, req.session?.id, req.embeddedSite.id);
        }
        const sessionId = session.id;

        const startTime = Date.now();
        const normalizedQuestion = normalizeQuestion(sanitizedQuestion);
        requestContext.set(requestId, { normalizedQuestion, answerId: null, source: 'embedded', sessionId });

        try {
            // Build messages array using shared helper
            const messages = buildPromptMessages(
                session.messages,
                siteOwnerIsPro ? tools : [],
                '', // Embedded widgets usually don't send custom system prompts in body
                imageLabel
            );
            // Add current question
            messages.push({ role: 'user', content: sanitizedQuestion });

            // Use dynamic model setting
            const modelInfo = getModelInfo('normal');
            const apiUrl = modelInfo.apiUrl;
            const modelName = modelInfo.modelFile;

            const response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages: messages,
                    temperature: (siteOwnerIsPro && typeof temperature === 'number') ? Math.max(0, Math.min(2, temperature)) : 0.3,
                    top_p: (siteOwnerIsPro && typeof top_p === 'number') ? Math.max(0, Math.min(1, top_p)) : 0.85,
                    top_k: 40,
                    repeat_penalty: 1.1,
                    max_tokens: 256,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`LLAMA_SERVER_ERROR: ${response.statusText}`);
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.setHeader('X-Request-ID', requestId);
            res.setHeader('X-Session-ID', sessionId);
            res.flushHeaders();

            res.write(': start\n\n');

            const decoder = new TextDecoder();
            let buffer = '';
            let fullAnswer = '';

            for await (const chunk of response.body) {
                const text = decoder.decode(chunk, { stream: true });
                buffer += text;

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (!line || line === 'data: [DONE]') continue;

                    try {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            const json = JSON.parse(jsonStr);

                            if (json.choices && json.choices[0] && json.choices[0].delta) {
                                const content = json.choices[0].delta.content;
                                if (content) {
                                    res.write(JSON.stringify({ content: content }) + '\n');
                                    if (res.flush) res.flush();
                                    fullAnswer += content;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing llama.cpp line in embedded:', line, e);
                    }
                }
            }

            // Perform toxicity check on AI answer
            let answerToxicity = { toxic_probability: 0 };
            try {
                // answerToxicity = await toxicityFilter.check(fullAnswer);
                if (answerToxicity.toxic_probability > 0.7) {
                    logger.warn(`🚫 Toxic AI output detected: ${answerToxicity.toxic_probability.toFixed(4)}`);
                }
                logger.verbose(`🔍 Toxicity Check [AI Embedded]: ${answerToxicity.toxic_probability.toFixed(4)}`);
            } catch (e) {
                console.error('Answer toxicity check failed in embedded:', e);
            }

            // Send metadata including toxicity info
            res.write(JSON.stringify({
                metadata: {
                    model: 'kai-c2.1-embedded',
                    timestamp: new Date().toISOString(),
                    toxicity: {
                        userScore: toxicityResult.toxic_probability,
                        aiScore: answerToxicity.toxic_probability
                    }
                }
            }) + '\n');

            res.end();


            try {
                let imageMeta = null;
                if (image && saveImageHistory) {
                    try {
                        imageMeta = await ImageStore.saveImage(image);
                    } catch (err) {
                        console.error('Failed to save image in embedded:', err);
                    }
                }

                if (saveTextHistory) {
                    const toxicityData = {
                        userScore: toxicityResult.toxic_probability,
                        aiScore: answerToxicity.toxic_probability
                    };
                    const savedAnswer = (toxicityData.aiScore >= 0.95) ? '[このメッセージは利用規約に違反しているため削除されました]' : fullAnswer;

                    await addMessageToSession(sessionId, 'user', sanitizedQuestion, imageMeta, null, null, toxicityData);
                    await addMessageToSession(sessionId, 'assistant', savedAnswer, null, null, null, toxicityData);

                    const answerId = registerAnswer({
                        normalizedQuestion,
                        question: sanitizedQuestion,
                        answer: savedAnswer,
                        answerId: requestId,
                        source: 'embedded'
                    });
                    requestContext.set(requestId, { normalizedQuestion, answerId, source: 'embedded', sessionId });

                    writeLog({
                        requestId: requestId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString(),
                        ip_hash: ipHash,
                        question: sanitizedQuestion,
                        answer: savedAnswer,
                        response_time: (Date.now() - startTime) / 1000,
                        model_version: 'kai-c2.1-q4-llamacpp',
                        source: 'embedded',
                        best_answer_id: answerId,
                        embedded_site_id: req.embeddedSite.id
                    });
                }
            } catch (postError) {
                console.error('Post-response error in /api/embedded/ask:', postError);
            }

        } catch (error) {
            console.error('Embedded API Error:', error.message);
            requestContext.delete(requestId);

            let errorMessage = 'サーバーエラーが発生しました。';
            let statusCode = 500;

            if (error.message === 'REQUEST_TIMEOUT') {
                errorMessage = 'リクエストがタイムアウトしました。';
                statusCode = 504;
            } else if (error.message.includes('LLAMA_SERVER_ERROR')) {
                errorMessage = 'AIサーバーに接続できませんでした。';
                statusCode = 503;
            }

            if (!res.headersSent) {
                res.status(statusCode).json({ error: errorMessage });
            }
        } finally {
            currentConcurrentRequests--;
        }
    } catch (e) {
        currentConcurrentRequests--;
        console.error('Outer /api/embedded/ask error:', e);
        if (!res.headersSent) {
            res.status(500).json({ error: 'サーバー内でエラーが発生しました。' });
        }
    }
});

// Cleanup embedded rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    const windowMs = 60 * 1000;

    for (const [apiKey, requests] of embeddedRequestCounts.entries()) {
        const filtered = requests.filter(r => now - r.timestamp < windowMs);
        if (filtered.length === 0) {
            embeddedRequestCounts.delete(apiKey);
        } else {
            embeddedRequestCounts.set(apiKey, filtered);
        }
    }
}, 5 * 60 * 1000);

// ============== User API Key Management (Pro Only) ==============

// Get user's API key
app.get('/api/user/api-key', async (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Login required' });
    }

    const userId = req.session.user.id;
    const apiKey = await db.getRow('SELECT id, name, usage_count, success_count, failure_count, completion_count, models_count, last_used_at, created_at FROM api_keys WHERE user_id = $1', [userId]);

    if (apiKey) {
        res.json({
            exists: true,
            name: apiKey.name,
            usageCount: apiKey.usage_count,
            successCount: apiKey.success_count,
            failureCount: apiKey.failure_count,
            completionCount: apiKey.completion_count,
            modelsCount: apiKey.models_count,
            lastUsedAt: apiKey.last_used_at,
            createdAt: apiKey.created_at
        });
    } else {
        res.json({ exists: false });
    }
});

// Get user's API historical stats
app.get('/api/user/api-key/stats', async (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Login required' });
    }

    const userId = req.session.user.id;
    const apiKey = await db.getRow('SELECT id FROM api_keys WHERE user_id = $1', [userId]);

    if (!apiKey) {
        return res.json({ stats: [] });
    }

    // Get last 7 days of stats
    const stats = await db.getAll(`
                    SELECT date, success_count, failure_count, completion_count, models_count
                    FROM api_usage_stats
                    WHERE api_key_id = $1
                    AND date >= CURRENT_DATE - INTERVAL '7 days'
                    ORDER BY date ASC
                `, [apiKey.id]);

    res.json({ stats });
});

// Create API key (Pro only, one per user)
app.post('/api/user/api-key/create', requirePro, async (req, res) => {
    const userId = req.session.user.id;

    const existing = await db.getRow('SELECT id FROM api_keys WHERE user_id = $1', [userId]);
    if (existing) {
        return res.status(400).json({ error: 'You already have an API key. Delete it first to create a new one.' });
    }

    const apiKeyId = uuidv4();
    const apiKey = 'sk-kai-' + crypto.randomBytes(32).toString('hex');
    // SHA-256ハッシュ化してDBに保存（平文は保存しない）
    const apiKeyHash = hashApiKey(apiKey);
    const now = new Date().toISOString();

    try {
        await db.query('INSERT INTO api_keys (id, user_id, api_key, name, usage_count, created_at) VALUES ($1, $2, $3, $4, 0, $5)', [
            apiKeyId, userId, apiKeyHash, 'My API Key', now
        ]);

        res.json({
            success: true,
            apiKey: apiKey, // Only shown once! DBにはハッシュのみ保存
            createdAt: now
        });
    } catch (e) {
        console.error('Failed to create API key:', e);
        res.status(500).json({ error: 'Failed to create API key' });
    }
});

// Delete API key
app.delete('/api/user/api-key', async (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'Login required' });
    }

    const userId = req.session.user.id;

    try {
        const result = await db.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);
        if (result.rowCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'No API key found' });
        }
    } catch (e) {
        console.error('Failed to delete API key:', e);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
});

// ============== OpenAI Compatible API ==============

// API Key authentication middleware
const authenticateApiKey = async (req, res, next) => {
    // 1. Get API key from multiple possible headers
    let apiKey = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;

    if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7).trim();
    }

    if (!apiKey) {
        return res.status(401).json({
            error: {
                message: 'Invalid Authentication. Expected: Bearer YOUR_API_KEY or X-API-Key header.',
                type: 'invalid_request_error',
                code: 'invalid_api_key'
            }
        });
    }

    // 2. Hybrid Validation: Search by hash OR by raw key (for legacy support)
    const apiKeyHash = hashApiKey(apiKey);
    const keyData = await db.getRow('SELECT * FROM api_keys WHERE api_key = $1 OR api_key = $2', [apiKeyHash, apiKey]);

    if (!keyData) {
        return res.status(401).json({
            error: {
                message: 'Invalid API key',
                type: 'invalid_request_error',
                code: 'invalid_api_key'
            }
        });
    }

    // Strict Rate Limiting (10 requests per minute)
    const now = Date.now();
    const windowMs = 60 * 1000;
    if (!apiKeyRequestCounts.has(apiKey)) {
        apiKeyRequestCounts.set(apiKey, []);
    }
    const timestamps = apiKeyRequestCounts.get(apiKey).filter(t => now - t < windowMs);
    if (timestamps.length >= 10) {
        return res.status(429).json({
            error: {
                message: 'Rate limit exceeded (10 requests per minute). Upgrade to a higher plan for more throughput.',
                type: 'rate_limit_error',
                code: 'rate_limit_exceeded'
            }
        });
    }
    timestamps.push(now);
    apiKeyRequestCounts.set(apiKey, timestamps);

    // Update basic usage stats
    const nowIso = new Date().toISOString();
    await db.query('UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = $1 WHERE id = $2', [nowIso, keyData.id]);

    req.apiKeyData = keyData;
    next();
};

const apiKeyRequestCounts = new Map(); // apiKey -> [timestamps]

// Helper to record detailed API usage
const recordApiUsage = async (apiKeyId, type) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        await db.transaction(async (client) => {
            // Update total counts in api_keys
            let updateKeySql = '';
            if (type === 'success') updateKeySql = 'UPDATE api_keys SET success_count = success_count + 1 WHERE id = $1';
            else if (type === 'failure') updateKeySql = 'UPDATE api_keys SET failure_count = failure_count + 1 WHERE id = $1';
            else if (type === 'completion') updateKeySql = 'UPDATE api_keys SET completion_count = completion_count + 1 WHERE id = $1';
            else if (type === 'models') updateKeySql = 'UPDATE api_keys SET models_count = models_count + 1 WHERE id = $1';

            if (updateKeySql) await client.query(updateKeySql, [apiKeyId]);

            // Update daily stats in api_usage_stats
            await client.query(`
                            INSERT INTO api_usage_stats (api_key_id, date, success_count, failure_count, completion_count, models_count)
                            VALUES ($1, $2, 
                                CASE WHEN $3 = 'success' THEN 1 ELSE 0 END,
                                CASE WHEN $4 = 'failure' THEN 1 ELSE 0 END,
                                CASE WHEN $5 = 'completion' THEN 1 ELSE 0 END,
                                CASE WHEN $6 = 'models' THEN 1 ELSE 0 END
                            )
                            ON CONFLICT(api_key_id, date) DO UPDATE SET
                                success_count = api_usage_stats.success_count + (CASE WHEN $7 = 'success' THEN 1 ELSE 0 END),
                                failure_count = api_usage_stats.failure_count + (CASE WHEN $8 = 'failure' THEN 1 ELSE 0 END),
                                completion_count = api_usage_stats.completion_count + (CASE WHEN $9 = 'completion' THEN 1 ELSE 0 END),
                                models_count = api_usage_stats.models_count + (CASE WHEN $10 = 'models' THEN 1 ELSE 0 END)
                        `, [apiKeyId, today, type, type, type, type, type, type, type, type]);
        });
    } catch (e) {
        console.error('Failed to record API usage:', e);
    }
};

// OpenAI-compatible models list endpoint
app.get('/api/v1/models', authenticateApiKey, (req, res) => {
    recordApiUsage(req.apiKeyData.id, 'models');
    recordApiUsage(req.apiKeyData.id, 'success');

    const responseData = models.filter(m => m.isActive).map(m => ({
        id: m.id,
        object: 'model',
        created: 1734793200, // Placeholder
        owned_by: 'kai'
    }));

    res.json({
        object: 'list',
        data: responseData
    });
});

// OpenAI-compatible model detail endpoint
app.get('/api/v1/models/:model', authenticateApiKey, (req, res) => {
    recordApiUsage(req.apiKeyData.id, 'models');
    const { model } = req.params;
    const models = [
        {
            id: 'kai-c2.2',
            object: 'model',
            created: 1734793200,
            owned_by: 'kai'
        }
    ];

    const found = models.find(m => m.id === model);
    if (found) {
        recordApiUsage(req.apiKeyData.id, 'success');
        res.json(found);
    } else {
        recordApiUsage(req.apiKeyData.id, 'failure');
        res.status(404).json({
            error: {
                message: `The model '${model}' does not exist`,
                type: 'invalid_request_error',
                param: 'model',
                code: 'model_not_found'
            }
        });
    }
});

// OpenAI-compatible chat completions endpoint
app.post('/api/v1/chat/completions', authenticateApiKey, async (req, res) => {
    try {
        const {
            model,
            messages: providedMessages,
            stream = true,
            temperature,
            top_p,
            max_tokens = 256,
            tools = [],
            session_id
        } = req.body;

        if (!providedMessages || !Array.isArray(providedMessages) || providedMessages.length === 0) {
            return res.status(400).json({
                error: {
                    message: 'messages is required and must be a non-empty array',
                    type: 'invalid_request_error'
                }
            });
        }

        if (session_id !== undefined && session_id !== null) {
            return res.status(400).json({
                error: {
                    message: "The 'session_id' parameter is no longer supported for security reasons.",
                    type: 'invalid_request_error',
                    param: 'session_id',
                    code: 'unsupported_parameter'
                }
            });
        }

        const apiKeyOwner = req.apiKeyData.user_id ? await User.findById(req.apiKeyData.user_id) : null;
        const isPro = apiKeyOwner ? apiKeyOwner.is_pro : false;

        // Content verification (same as before)
        const lastUserMsg = providedMessages.filter(m => m.role === 'user').pop();
        if (lastUserMsg && typeof lastUserMsg.content === 'string') {
            const prohibitedCheck = checkProhibitedWords(lastUserMsg.content);
            if (prohibitedCheck.containsProhibited) {
                return res.status(400).json({
                    error: { message: 'Content policy violation detected', type: 'invalid_request_error', code: 'content_policy_violation' }
                });
            }
            if (lastUserMsg.content.length > 1000) {
                return res.status(400).json({
                    error: { message: 'Message too long (max 1000 characters per message)', type: 'invalid_request_error' }
                });
            }
        }

        const history = [];

        // Build final messages including history and tools
        // Pro API users get 'time' tool by default if not specified
        const finalTools = (isPro && (!tools || tools.length === 0)) ? ['time'] : (isPro ? tools : []);

        const messages = buildPromptMessages(
            history,
            finalTools,
            '', // API doesn't have a separate systemPrompt field
            ''
        );
        // Append current messages from request
        providedMessages.forEach(msg => messages.push(msg));

        // Use dynamic model setting
        const modelInfo = getModelInfo(model || 'normal');
        const apiUrl = modelInfo.apiUrl;
        const modelName = modelInfo.modelFile;
        const responseModel = modelInfo.id;

        const requestId = `chatcmpl-${uuidv4()}`;
        const startTime = Date.now();

        const llamaPayload = {
            model: modelName,
            messages: messages,
            temperature: (typeof temperature === 'number') ? Math.max(0, Math.min(2, temperature)) : 0.3,
            top_p: (typeof top_p === 'number') ? Math.max(0, Math.min(1, top_p)) : 0.85,
            top_k: 40,
            repeat_penalty: 1.1,
            max_tokens: 256, // Match website's 256
            stream: stream
        };

        // Proxy to llama.cpp
        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(llamaPayload)
        });

        if (!response.ok) {
            throw new Error(`LLAMA_SERVER_ERROR: ${response.statusText}`);
        }

        if (stream) {
            // SSE streaming response (OpenAI format)
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let tokenCount = 0;

            for await (const chunk of response.body) {
                const text = decoder.decode(chunk, { stream: true });
                buffer += text;

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (!line || line === 'data: [DONE]') {
                        if (line === 'data: [DONE]') {
                            res.write('data: [DONE]\n\n');
                        }
                        continue;
                    }

                    try {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            const json = JSON.parse(jsonStr);

                            if (json.choices && json.choices[0] && json.choices[0].delta) {
                                const content = json.choices[0].delta.content;
                                if (content) {
                                    fullContent += content;
                                    tokenCount++;

                                    // Send in OpenAI format
                                    const openaiChunk = {
                                        id: requestId,
                                        object: 'chat.completion.chunk',
                                        created: Math.floor(startTime / 1000),
                                        model: responseModel,
                                        choices: [{
                                            index: 0,
                                            delta: { content: content },
                                            finish_reason: null
                                        }]
                                    };
                                    res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }

            // Final chunk
            const finalChunk = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(startTime / 1000),
                model: responseModel,
                choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop'
                }]
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();

            await recordApiUsage(req.apiKeyData.id, 'completion');
            await recordApiUsage(req.apiKeyData.id, 'success');
        } else {
            // Non-streaming response
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const duration = (Date.now() - startTime) / 1000;

            res.json({
                id: requestId,
                object: 'chat.completion',
                created: Math.floor(startTime / 1000),
                model: responseModel,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: content
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: messages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0) | 0,
                    completion_tokens: content.length / 4 | 0,
                    total_tokens: (messages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0) + content.length / 4) | 0
                }
            });

            await recordApiUsage(req.apiKeyData.id, 'completion');
            await recordApiUsage(req.apiKeyData.id, 'success');
        }

    } catch (error) {
        console.error('OpenAI API Error:', error.message);
        if (req.apiKeyData) {
            await recordApiUsage(req.apiKeyData.id, 'failure');
        }
        res.status(500).json({
            error: {
                message: 'Internal server error',
                type: 'server_error'
            }
        });
    }
});


// (Moved to startServer sequence for proper priority)


// ============== New API Endpoints for Features ==============

// Pin/Unpin session endpoint
app.post('/api/session/:sessionId/pin', async (req, res) => {
    const { sessionId } = req.params;
    const { isPinned } = req.body;
    const userId = req.session?.user?.id || null;
    const creatorSid = req.session?.id || null;

    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    try {
        const session = await getSession(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const isOwner = session.userId
            ? (session.userId === userId)
            : (session.creatorSid && session.creatorSid === creatorSid);

        if (!isOwner) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // For pinning, we only allow logged-in users to pin their own sessions.
        // Guest sessions cannot be "pinned" in a persistent way.
        if (!userId) {
            return res.status(401).json({ error: 'Login required to pin sessions' });
        }
        if (session.userId !== userId) {
            return res.status(403).json({ error: 'Only the owner can pin this session' });
        }

        await db.query('UPDATE sessions SET is_pinned = $1 WHERE id = $2 AND user_id = $3', [isPinned ? 1 : 0, sessionId, userId]);
        res.json({ success: true, isPinned });
    } catch (e) {
        console.error('Failed to update pin status:', e);
        res.status(500).json({ error: 'Failed to update pin status' });
    }
});

// Update session tags endpoint
app.post('/api/session/:sessionId/tags', async (req, res) => {
    const { sessionId } = req.params;
    const { tags } = req.body;
    const userId = req.session?.user?.id || null;

    if (!userId) {
        return res.status(401).json({ error: 'Login required' });
    }

    if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
    }

    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        await db.query('UPDATE sessions SET tags = $1 WHERE id = $2 AND user_id = $3', [JSON.stringify(tags), sessionId, userId]);
        res.json({ success: true, tags });
    } catch (e) {
        console.error('Failed to update tags:', e);
        res.status(500).json({ error: 'Failed to update tags' });
    }
});

// Get user tags endpoint
app.get('/api/tags', async (req, res) => {
    const userId = req.session?.user?.id || null;

    if (!userId) {
        return res.json({ tags: [] });
    }

    try {
        // Get user custom tags
        const userTags = await db.getAll('SELECT name FROM user_tags WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json({ tags: userTags.map(row => row.name) });

    } catch (e) {
        console.error('Failed to get tags:', e);
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

// Create user tag endpoint
app.post('/api/tags', async (req, res) => {
    const { tagName } = req.body;
    const userId = req.session?.user?.id || null;

    if (!userId) {
        return res.status(401).json({ error: 'Login required' });
    }

    if (!tagName || typeof tagName !== 'string' || tagName.trim().length === 0 || tagName.length > 20) {
        return res.status(400).json({ error: 'Invalid tag name' });
    }

    try {
        await db.query('INSERT INTO user_tags (user_id, name, created_at) VALUES ($1, $2, $3)', [userId, tagName.trim(), new Date().toISOString()]);
        res.json({ success: true, tagName: tagName.trim() });
    } catch (e) {
        if (e.message.includes('unique constraint') || e.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Tag already exists' });
        }
        console.error('Failed to create tag:', e);
        res.status(500).json({ error: 'Failed to create tag' });
    }
});

// System Status endpoint
app.get('/api/system-status', (req, res) => {
    res.json(systemStatus);
});

// Webhook for external monitoring status updates (with Rate Limiting)
app.post('/api/webhooks/status', rateLimiter, (req, res) => {
    const expectedToken = Settings.get('WEBHOOK_TOKEN');
    if (!expectedToken) {
        return res.status(401).json({ error: 'Webhook not configured' });
    }
    const token = req.headers['x-webhook-token'];
    if (token !== expectedToken) {
        logger.warn('Webhook Status: Unauthorized access attempt.');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { heartbeat, monitor } = req.body;
    if (!heartbeat || !monitor) {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const monitorName = monitor.name;
    const status = heartbeat.status; // 1 = Up, 0 = Down
    const isUp = status === 1;

    let serviceKey = null;
    if (monitorName.includes('ポイント')) {
        serviceKey = 'points';
    } else if (monitorName.includes('フォーラム')) {
        serviceKey = 'forum';
    }

    if (serviceKey) {
        logger.info(`📡 Status Webhook: [${monitorName}] is reported as ${isUp ? '✅ UP' : '🔴 DOWN'}`);
        refreshServiceStatus(serviceKey, isUp);
        res.json({ success: true, message: `Status for ${serviceKey} updated to ${isUp ? 'UP' : 'DOWN'}` });
    } else {
        logger.verbose(`📡 Status Webhook: Ignored monitor [${monitorName}]`);
        res.json({ success: true, message: 'Monitor ignored' });
    }
});

// (Moved to startServer sequence)


// (Moved to startServer sequence)
