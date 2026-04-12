const { randomUUID: uuidv4 } = require('crypto');
const db = require('./db');

const User = {
    /**
     * 認証プロバイダー経由でユーザーを検索または作成（汎用API）
     * @param {string} providerId - 'discourse' 等
     * @param {string} externalId - プロバイダー側のユーザーID
     * @param {object} userData - { username, email, name?, avatar_url? }
     */
    findOrCreateByAuth: async (providerId, externalId, userData) => {
        // discourse は discourse_id カラムを使用（後方互換）
        if (providerId !== 'discourse') {
            throw new Error(`Unsupported auth provider: ${providerId}`);
        }

        let user = await db.getRow('SELECT * FROM users WHERE discourse_id = $1', [externalId]);

        if (user) {
            let changed = false;
            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (user.username !== userData.username) {
                user.username = userData.username;
                updates.push(`username = $${paramIndex++}`);
                params.push(user.username);
                changed = true;
            }
            if (user.email !== userData.email) {
                user.email = userData.email;
                updates.push(`email = $${paramIndex++}`);
                params.push(user.email);
                changed = true;
            }
            if (userData.avatar_url !== undefined && user.avatar_url !== userData.avatar_url) {
                user.avatar_url = userData.avatar_url;
                updates.push(`avatar_url = $${paramIndex++}`);
                params.push(user.avatar_url);
                changed = true;
            }
            if (userData.name !== undefined && user.name !== userData.name) {
                user.name = userData.name;
                updates.push(`name = $${paramIndex++}`);
                params.push(user.name);
                changed = true;
            }

            if (changed) {
                user.updated_at = new Date().toISOString();
                updates.push(`updated_at = $${paramIndex++}`);
                params.push(user.updated_at);
                params.push(user.id);
                await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
            }
        } else {
            const id = uuidv4();
            user = {
                id,
                discourse_id: externalId,
                username: userData.username,
                email: userData.email,
                name: userData.name || userData.username,
                avatar_url: userData.avatar_url || null,
                is_pro: false,
                pro_expiry: null,
                auto_renew: true,
                total_points: 0,
                total_spent: 0,
                save_text_history: true,
                save_image_history: true,
                pro_settings: {
                    systemPrompt: '',
                    temperature: 0.3,
                    top_p: 0.85,
                    theme: 'blue',
                    colorMode: 'system',
                    selectedTools: [],
                    recentlyUsedTools: [],
                    hiddenTools: [],
                    skipToolHideConfirm: false
                },
                has_agreed_terms: false,
                role: 'member',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await db.query(`
                INSERT INTO users (
                    id, discourse_id, username, email, name, avatar_url,
                    is_pro, pro_expiry, auto_renew, total_points, total_spent,
                    save_text_history, save_image_history, pro_settings, has_agreed_terms,
                    role, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
                )
            `, [
                user.id, user.discourse_id, user.username, user.email, user.name, user.avatar_url,
                user.is_pro, user.pro_expiry, user.auto_renew, user.total_points, user.total_spent,
                user.save_text_history, user.save_image_history, JSON.stringify(user.pro_settings),
                user.has_agreed_terms, user.role, user.created_at, user.updated_at
            ]);
        }

        if (typeof user.pro_settings === 'string') {
            try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { user.pro_settings = {}; }
        }
        return user;
    },

    createLocal: async ({ username, email, passwordHash }) => {
        const id = uuidv4();
        const now = new Date().toISOString();
        const defaultProSettings = {
            systemPrompt: '', temperature: 0.3, top_p: 0.85,
            theme: 'blue', colorMode: 'system',
            selectedTools: [], recentlyUsedTools: [], hiddenTools: [], skipToolHideConfirm: false
        };

        await db.query(`
            INSERT INTO users (
                id, discourse_id, username, email, name, avatar_url,
                is_pro, pro_expiry, auto_renew, total_points, total_spent,
                save_text_history, save_image_history, pro_settings, has_agreed_terms,
                role, auth_provider, password_hash, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            )
        `, [
            id, null, username, email, username, null,
            false, null, false, 0, 0,
            true, true, JSON.stringify(defaultProSettings), false,
            'member', 'local', passwordHash, now, now
        ]);

        return { id, username, email, name: username, role: 'member', auth_provider: 'local', pro_settings: defaultProSettings };
    },

    findByUsername: async (username) => {

        const user = await db.getRow('SELECT * FROM users WHERE username = $1', [username]);
        if (user && typeof user.pro_settings === 'string') {
            try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { user.pro_settings = {}; }
        }
        return user;
    },

    findById: async (id) => {
        const user = await db.getRow('SELECT * FROM users WHERE id = $1', [id]);
        if (user && typeof user.pro_settings === 'string') {
            try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { user.pro_settings = {}; }
        }
        return user;
    },

    deductPoints: async (username, amount, reason) => {
        const user = await db.getRow('SELECT * FROM users WHERE username = $1', [username]);
        if (!user) throw new Error('User not found');
        if (user.total_points < amount) throw new Error('Insufficient points');

        const newPoints = user.total_points - amount;
        const updatedAt = new Date().toISOString();

        await db.query('UPDATE users SET total_points = $1, updated_at = $2 WHERE id = $3', [newPoints, updatedAt, user.id]);

        user.total_points = newPoints;
        user.updated_at = updatedAt;
        if (typeof user.pro_settings === 'string') {
            try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { }
        }
        return user;
    },

    recordSpending: async (username, amount) => {
        const user = await db.getRow('SELECT * FROM users WHERE username = $1', [username]);
        if (user) {
            const newSpent = (user.total_spent || 0) + amount;
            const updatedAt = new Date().toISOString();
            await db.query('UPDATE users SET total_spent = $1, updated_at = $2 WHERE id = $3', [newSpent, updatedAt, user.id]);
            user.total_spent = newSpent;
            if (typeof user.pro_settings === 'string') {
                try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { }
            }
            return user;
        }
        return null;
    },

    setProExpiry: async (username, expiryDate) => {
        const user = await db.getRow('SELECT * FROM users WHERE username = $1', [username]);
        if (user) {
            const proExpiry = expiryDate.toISOString();
            const updatedAt = new Date().toISOString();
            await db.query('UPDATE users SET pro_expiry = $1, updated_at = $2 WHERE id = $3', [proExpiry, updatedAt, user.id]);
            user.pro_expiry = proExpiry;
            if (typeof user.pro_settings === 'string') {
                try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { }
            }
            return user;
        }
        return null;
    },

    setAutoRenew: async (username, autoRenew) => {
        const user = await db.getRow('SELECT * FROM users WHERE username = $1', [username]);
        if (user) {
            const updatedAt = new Date().toISOString();
            await db.query('UPDATE users SET auto_renew = $1, updated_at = $2 WHERE id = $3', [autoRenew, updatedAt, user.id]);
            user.auto_renew = autoRenew;
            if (typeof user.pro_settings === 'string') {
                try { user.pro_settings = JSON.parse(user.pro_settings); } catch (e) { }
            }
            return user;
        }
        return null;
    },

    getSettings: async (userId) => {
        const user = await db.getRow('SELECT save_text_history, save_image_history, pro_settings, has_agreed_terms FROM users WHERE id = $1', [userId]);

        const defaultProSettings = {
            systemPrompt: '',
            temperature: 0.3,
            top_p: 0.85,
            theme: 'blue',
            colorMode: 'system',
            selectedTools: [],
            recentlyUsedTools: [],
            hiddenTools: [],
            skipToolHideConfirm: false
        };

        if (user) {
            let proSettings = user.pro_settings;
            if (typeof proSettings === 'string') {
                try { proSettings = JSON.parse(proSettings); } catch (e) { proSettings = defaultProSettings; }
            } else if (!proSettings) {
                proSettings = defaultProSettings;
            }

            return {
                save_text_history: !!user.save_text_history,
                save_image_history: !!user.save_image_history,
                pro_settings: proSettings,
                has_agreed_terms: !!user.has_agreed_terms
            };
        }
        return {
            save_text_history: true,
            save_image_history: true,
            pro_settings: defaultProSettings,
            has_agreed_terms: false
        };
    },

    updateSettings: async (userId, settings) => {
        const user = await db.getRow('SELECT * FROM users WHERE id = $1', [userId]);
        if (user) {
            let updates = [];
            let params = [];
            let paramIndex = 1;

            if (settings.save_text_history !== undefined) {
                updates.push(`save_text_history = $${paramIndex++}`);
                params.push(!!settings.save_text_history);
            }
            if (settings.save_image_history !== undefined) {
                updates.push(`save_image_history = $${paramIndex++}`);
                params.push(!!settings.save_image_history);
            }
            if (settings.has_agreed_terms !== undefined) {
                updates.push(`has_agreed_terms = $${paramIndex++}`);
                params.push(!!settings.has_agreed_terms);
            }
            if (settings.pro_settings !== undefined) {
                let currentProSettings = {};
                try {
                    currentProSettings = typeof user.pro_settings === 'string' ? JSON.parse(user.pro_settings || '{}') : (user.pro_settings || {});
                } catch (e) { }

                const newProSettings = { ...currentProSettings, ...settings.pro_settings };
                updates.push(`pro_settings = $${paramIndex++}`);
                params.push(JSON.stringify(newProSettings));
            }

            if (updates.length > 0) {
                updates.push(`updated_at = $${paramIndex++}`);
                params.push(new Date().toISOString());
                params.push(userId);

                const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
                await db.query(sql, params);
                return User.findById(userId);
            }
            return User.findById(userId);
        }
        return null;
    }
};

module.exports = User;
