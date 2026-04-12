/**
 * KAi Plugin Manager
 *
 * セキュリティ方針：「許可リスト型API」
 * - プラグインはDBやファイルに直接アクセスできない
 * - KAiが用意した限定的なAPI（pluginContext）のみ使用可能
 * - プラグインのロードは起動時のみ（実行中の差し替え不可）
 *
 * 完全分離方針 (docs/plugin-policy.md 参照):
 * - プラグインがない場合、その機能はサーバーに一切存在しない
 * - ポイントプラグインなし → 内蔵noop実装が自動で使われる（null-points.jsは不要）
 * - 認証プラグインなし → /auth/* ルートは登録されない
 */

const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const PLUGINS_DIR = path.join(__dirname, 'plugins');

// プラグインが使用できるAPIの許可リスト（pluginContextとして渡す）
function createPluginContext(pluginName, pluginManagerRef) {
    const prefixedLogger = {
        info: (...args) => logger.info(`[plugin:${pluginName}]`, ...args),
        warn: (...args) => logger.warn(`[plugin:${pluginName}]`, ...args),
        error: (...args) => logger.error(`[plugin:${pluginName}]`, ...args),
        verbose: (...args) => logger.verbose(`[plugin:${pluginName}]`, ...args),
    };
    return {
        logger: prefixedLogger,
        // 設定の読み取りのみ許可（書き込みは管理者パネル経由のみ）
        getSetting: (key) => {
            const Settings = require('./settings');
            return Settings.get(key);
        },
        // プラグインが健全性チェックを登録（forum, points 等）
        registerHealthCheck: (name, checkFn) => {
            if (pluginManagerRef && typeof checkFn === 'function') {
                pluginManagerRef._healthChecks[name] = checkFn;
                logger.verbose(`[plugin:${pluginName}] Registered health check: ${name}`);
            }
        },
        // ナビゲーション拡張（サイドバーにリンクを追加）。サジェストは登録しない（コアの基本設定のみ）
        registerNavExtension: (item) => {
            if (!pluginManagerRef || !item || typeof item !== 'object') return;
            const path = sanitizeNavItem(item.path, 200);
            const label = sanitizeNavItem(item.label, 100);
            const icon = sanitizeNavItem(item.icon, 80);
            if (path && label) {
                pluginManagerRef._navExtensions.push({ path, label, icon: icon || 'fa-solid fa-link' });
            }
        },
        // Pro フックの登録（バッジ付与・削除など）
        registerProHooks: ({ onGrant, onRevoke } = {}) => {
            if (!pluginManagerRef) return;
            if (typeof onGrant === 'function') pluginManagerRef._proOnGrant = onGrant;
            if (typeof onRevoke === 'function') pluginManagerRef._proOnRevoke = onRevoke;
            logger.verbose(`[plugin:${pluginName}] Registered Pro hooks`);
        },
        // 管理者「機能」ページへ機能を登録する
        // feature: { id, label, description, defaultLevel: 'loggedout'|'loggedin'|'pro' }
        registerAdminFeature: (feature) => {
            if (!pluginManagerRef || !feature || !feature.id || !feature.label) return;
            pluginManagerRef._adminFeatures.push({
                id: String(feature.id),
                label: String(feature.label),
                description: feature.description ? String(feature.description) : '',
                defaultLevel: ['loggedout', 'loggedin', 'pro'].includes(feature.defaultLevel) ? feature.defaultLevel : 'pro',
                fromPlugin: pluginName,
            });
            logger.verbose(`[plugin:${pluginName}] Registered admin feature: ${feature.id}`);
        },

        // --- Pro プラン管理用DB API ---
        // プラグインがsubscribe/cancelルートを実装するために提供する許可リスト型API
        findUserById: (id) => {
            const User = require('./user');
            return User.findById(id);
        },
        setProExpiry: (username, date) => {
            const User = require('./user');
            return User.setProExpiry(username, date);
        },
        setAutoRenew: (username, enabled) => {
            const User = require('./user');
            return User.setAutoRenew(username, enabled);
        },
        recordSpending: (username, amount) => {
            const User = require('./user');
            return User.recordSpending(username, amount);
        },
        // Pro付与/剥奪フックを手動で発火（subscribe/cancelルート内から呼ぶ）
        triggerProGrant: (username) => pluginManagerRef.onProGrant(username),
        triggerProRevoke: (username) => pluginManagerRef.onProRevoke(username),
        // pluginManager.hasCapability のラッパー（プラグインがpluginManagerに直接触れないように）
        hasCapability: (type) => pluginManagerRef ? pluginManagerRef.hasCapability(type) : false,
        // クライアントアセット (CSS / JS) を登録する（汎用インフラ）
        registerClientAssets: ({ js, css } = {}) => {
            if (!pluginManagerRef) return;
            if (!pluginManagerRef._clientAssets[pluginName]) {
                pluginManagerRef._clientAssets[pluginName] = {};
            }
            if (css) pluginManagerRef._clientAssets[pluginName].css = css;
            if (js)  pluginManagerRef._clientAssets[pluginName].js  = js;
        },
    };
}

function sanitizeNavItem(val, maxLen) {
    if (val == null || typeof val !== 'string') return '';
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F<>"']/g, '').trim().slice(0, maxLen);
}

class PluginManager {
    constructor() {
        this.authPlugin = null;
        this.pointsPlugin = null;
        this._plugins = {};
        this._healthChecks = {};
        this._navExtensions = [];
        this._adminFeatures = [];
        this._proOnGrant = null;
        this._proOnRevoke = null;
        /** プラグインが登録したクライアントアセット { [pluginName]: { css?, js? } } */
        this._clientAssets = {};
    }

    getRegisteredAdminFeatures() {
        return this._adminFeatures.slice();
    }

    /**
     * 登録済みクライアントアセット (CSS/JS URL) を取得する
     * @returns {{ css?: string, js?: string }[]} 全プラグインのアセットを配列で返す
     */
    getClientAssets() {
        return Object.values(this._clientAssets);
    }

    /**
     * プラグインをロードする（汎用）
     * プラグインは meta.type (auth, points, pro, またはその配列) を持つ必要がある
     */
    loadPlugin(name) {
        try {
            const pluginPath = path.join(PLUGINS_DIR, `${name}.js`);
            const pluginModule = require(pluginPath);
            const context = createPluginContext(name, this);

            if (typeof pluginModule.init !== 'function') {
                throw new Error(`Plugin "${name}" must export an init() function`);
            }

            pluginModule.init(context);
            const types = Array.isArray(pluginModule.meta.type) ? pluginModule.meta.type : [pluginModule.meta.type];

            if (types.includes('auth')) {
                if (typeof pluginModule.getLoginUrl !== 'function' || typeof pluginModule.handleCallback !== 'function') {
                    throw new Error(`Auth plugin "${name}" must export getLoginUrl() and handleCallback()`);
                }
                this.authPlugin = pluginModule;
            }

            if (types.includes('points')) {
                if (typeof pluginModule.checkPoints !== 'function' || typeof pluginModule.deductPoints !== 'function') {
                    throw new Error(`Points plugin "${name}" must export checkPoints() and deductPoints()`);
                }
                this.pointsPlugin = pluginModule;
            }

            this._plugins[name] = {
                type: pluginModule.meta.type,
                enabled: true,
                name: pluginModule.meta.name || name,
                meta: pluginModule.meta || {}
            };
            logger.info(`✅ Plugin loaded: ${name} (${types.join(', ')})`);
        } catch (e) {
            logger.error(`❌ Failed to load plugin "${name}":`, e.message);
        }
    }

    getNavExtensions() {
        return this._navExtensions.slice();
    }

    // 以前のメソッドとの互換性のためのエイリアス
    loadAuthPlugin(name) { return this.loadPlugin(name); }
    loadPointsPlugin(name) { return this.loadPlugin(name); }

    /**
     * lib/plugins 内の全 .js ファイルを自動検出してロードする
     * フォルダに置くだけで動く。server.js の修正は不要。
     */
    loadAllPlugins() {
        if (!fs.existsSync(PLUGINS_DIR)) {
            logger.verbose('Plugins directory does not exist, skipping.');
            return;
        }
        const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const name = path.basename(file, '.js');
            this.loadPlugin(name);
        }
    }

    /**
     * Expressアプリに認証プラグインのルートを登録する
     */
    registerAuthRoutes(app) {
        if (this.authPlugin && typeof this.authPlugin.registerRoutes === 'function') {
            this.authPlugin.registerRoutes(app);
            logger.info(`✅ Auth plugin routes registered`);
        }
    }

    /**
     * Expressアプリにポイント/Proプラグインのルートを登録する
     * プラグインが registerProRoutes(app) を export していれば呼び出す。
     * これにより /api/pro/* の実装は完全にプラグイン側に委譲される。
     */
    registerProRoutes(app) {
        if (this.pointsPlugin && typeof this.pointsPlugin.registerProRoutes === 'function') {
            this.pointsPlugin.registerProRoutes(app);
        }
    }

    /**
     * 有効な認証プロバイダー一覧を取得（フロントエンド向け）
     */
    getAuthProviders() {
        const providers = [];
        providers.push({ id: 'local', name: 'メール・パスワード', type: 'local' });

        if (this.authPlugin && this.authPlugin.meta) {
            providers.push({
                id: this.authPlugin.meta.id,
                name: this.authPlugin.meta.name,
                type: 'plugin',
                loginUrl: this.authPlugin.meta.loginUrl || `/auth/${this.authPlugin.meta.id}`,
            });
        }
        return providers;
    }

    /**
     * インストール済みプラグイン一覧（管理パネル向け）
     */
    getPluginList() {
        return Object.values(this._plugins).map(p => ({
            id: p.meta.id || p.name,
            name: p.name,
            type: p.type,
            enabled: p.enabled,
            description: p.meta.description || '',
            requiredSettings: p.meta.requiredSettings || [],
        }));
    }

    /**
     * PointsService取得
     * プラグインがない場合は null を返す（呼び出し側で Pro 開放判定をするため）
     */
    getPointsService() {
        if (!this.pointsPlugin) return null;
        return {
            checkPoints: (username) => this.pointsPlugin.checkPoints(username),
            deductPoints: (username, amount, reason) => this.pointsPlugin.deductPoints(username, amount, reason),
        };
    }

    /**
     * 特定の機能が有効かどうかをチェック
     */
    hasCapability(type) {
        if (type === 'points') return !!this.pointsPlugin;
        if (type === 'auth') return !!this.authPlugin;
        return false;
    }

    /**
     * auth プラグインが許可するアバターURLのドメイン一覧を取得
     * プラグインが getAllowedAvatarDomains を export していればそれを使用
     */
    getAllowedAvatarDomains() {
        if (this.authPlugin && typeof this.authPlugin.getAllowedAvatarDomains === 'function') {
            const domains = this.authPlugin.getAllowedAvatarDomains();
            return Array.isArray(domains) ? domains : [];
        }
        return [];
    }

    /**
     * プラグイン登録済みの健全性チェックを取得
     */
    getHealthChecks() {
        return { ...this._healthChecks };
    }

    /**
     * Pro プランが付与されたときに呼び出す（プラグインのフックを実行）
     * @param {string} username
     */
    async onProGrant(username) {
        if (typeof this._proOnGrant === 'function') {
            try {
                await this._proOnGrant(username);
            } catch (e) {
                logger.error('[PluginManager] onProGrant hook error:', e.message);
            }
        }
    }

    /**
     * Pro プランが失効／解約されたときに呼び出す（プラグインのフックを実行）
     * @param {string} username
     */
    async onProRevoke(username) {
        if (typeof this._proOnRevoke === 'function') {
            try {
                await this._proOnRevoke(username);
            } catch (e) {
                logger.error('[PluginManager] onProRevoke hook error:', e.message);
            }
        }
    }

    /**
     * Pro プランメタデータを取得（points プラグインが getProMetadata を export している場合）
     */
    getProMetadata() {
        if (this.pointsPlugin && typeof this.pointsPlugin.getProMetadata === 'function') {
            return this.pointsPlugin.getProMetadata();
        }
        return null;
    }
}

module.exports = new PluginManager();
