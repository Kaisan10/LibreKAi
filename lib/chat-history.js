const db = require('./db');

const ChatHistory = {
    /**
     * Get user's chat history list
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of { id, title, timestamp }
     */
    getHistory: async (userId) => {
        const rows = await db.getAll(`
            SELECT id, title, created_at as timestamp, tags, is_pinned
            FROM sessions 
            WHERE user_id = $1 
            ORDER BY last_accessed_at DESC, created_at DESC 
            LIMIT 100
        `, [userId]);

        return rows.map(row => {
            let tags = [];
            if (typeof row.tags === 'string') {
                try { tags = JSON.parse(row.tags); } catch (e) { tags = []; }
            } else if (Array.isArray(row.tags)) {
                tags = row.tags;
            }

            return {
                id: row.id,
                title: row.title,
                timestamp: new Date(row.timestamp).getTime(),
                tags: tags,
                isPinned: !!row.is_pinned
            };
        });
    },

    /**
     * Add a new chat to user's history
     * @param {string} userId - User ID
     * @param {string} sessionId - Session/Chat ID
     * @param {string} title - Chat title
     * @returns {Promise<Object>} The added history item
     */
    addChat: async (userId, sessionId, title) => {
        const existing = await db.getRow('SELECT id FROM sessions WHERE id = $1', [sessionId]);
        const cleanTitle = title.substring(0, 50);
        const now = new Date().toISOString();

        if (existing) {
            await db.query('UPDATE sessions SET title = $1, last_accessed_at = $2 WHERE id = $3', [cleanTitle, now, sessionId]);
        } else {
            await db.query(`
                INSERT INTO sessions (id, user_id, title, created_at, last_accessed_at)
                VALUES ($1, $2, $3, $4, $5)
            `, [sessionId, userId, cleanTitle, now, now]);
        }

        return {
            id: sessionId,
            title: cleanTitle,
            timestamp: Date.now()
        };
    },

    /**
     * Remove a chat from user's history
     * @param {string} userId - User ID
     * @param {string} sessionId - Session/Chat ID
     * @returns {Promise<boolean>} True if deleted
     */
    removeChat: async (userId, sessionId) => {
        const res = await db.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
        return res.rowCount > 0;
    },

    /**
     * Check if a chat belongs to a user
     * @param {string} userId - User ID
     * @param {string} sessionId - Session/Chat ID
     * @returns {Promise<boolean>} True if the chat belongs to the user
     */
    hasChat: async (userId, sessionId) => {
        const row = await db.getRow('SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
        return !!row;
    },

    /**
     * Update chat title
     * @param {string} userId - User ID
     * @param {string} sessionId - Session/Chat ID
     * @param {string} title - New title
     */
    updateTitle: async (userId, sessionId, title) => {
        const cleanTitle = title.substring(0, 50);
        const res = await db.query('UPDATE sessions SET title = $1 WHERE id = $2 AND user_id = $3', [cleanTitle, sessionId, userId]);
        return res.rowCount > 0;
    },

    /**
     * Update only last_accessed_at for a chat
     * @param {string} userId - User ID
     * @param {string} sessionId - Session/Chat ID
     */
    touchChat: async (userId, sessionId) => {
        const now = new Date().toISOString();
        await db.query('UPDATE sessions SET last_accessed_at = $1 WHERE id = $2 AND user_id = $3', [now, sessionId, userId]);
    }
};

module.exports = ChatHistory;
