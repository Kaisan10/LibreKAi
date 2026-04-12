const db = require('./db');
const logger = require('./logger');

class Settings {
    constructor() {
        this.cache = new Map();
        this.isLoaded = false;
    }

    async load() {
        try {
            const rows = await db.getAll('SELECT key, value FROM settings');
            this.cache.clear();
            rows.forEach(row => {
                this.cache.set(row.key, row.value);
            });
            this.isLoaded = true;
            logger.info(`⚙️ Loaded ${this.cache.size} settings from database.`);
        } catch (e) {
            logger.error('❌ Failed to load settings from database:', e);
            // Don't throw, use process.env as fallback
        }
    }

    // Keys that must be set in .env; we read them from process.env first.
    static get ENV_ONLY_KEYS() {
        return new Set(['SITE_URL', 'ADMIN_USERNAME']);
    }

    get(key, defaultValue = null) {
        if (Settings.ENV_ONLY_KEYS.has(key)) {
            const envVal = process.env[key];
            if (envVal != null && envVal !== '') return envVal;
        }
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        // Fallback to environment variables if not found in cache
        if (process.env[key] != null && process.env[key] !== '') {
            return process.env[key];
        }
        return defaultValue;
    }

    async set(key, value, category = 'general', description = '') {
        try {
            await db.query(
                `INSERT INTO settings (key, value, category, description) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (key) DO UPDATE SET value = $2, category = $3, description = $4, updated_at = CURRENT_TIMESTAMP`,
                [key, value, category, description]
            );
            this.cache.set(key, value);
            return true;
        } catch (e) {
            logger.error(`❌ Failed to save setting ${key}:`, e);
            return false;
        }
    }

    async delete(key) {
        try {
            await db.query('DELETE FROM settings WHERE key = $1', [key]);
            this.cache.delete(key);
            return true;
        } catch (e) {
            logger.error(`❌ Failed to delete setting ${key}:`, e);
            return false;
        }
    }

    getAll() {
        return Object.fromEntries(this.cache);
    }
}

module.exports = new Settings();
