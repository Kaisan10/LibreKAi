const { Pool } = require('pg');
// dotenv は server.js 側で既にロード済みのため、ここでは不要
const logger = require('./logger');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Helper for single queries
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // console.log('executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (err) {
        logger.error('Error executing query', { text, err });
        throw err;
    }
}

// Helper for "prepare().get()" equivalent
async function getRow(text, params) {
    const res = await query(text, params);
    return res.rows[0] || null;
}

// Helper for "prepare().all()" equivalent
async function getAll(text, params) {
    const res = await query(text, params);
    return res.rows;
}

// Transaction helper
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    query,
    getRow,
    getAll,
    transaction,
    // Provide a way to run old-style "db.prepare().run()" if needed
    prepare: (text) => {
        let counter = 1;
        // Use a more robust regex that ignores '?' inside single-quoted strings
        // This is still a simple shim, but better than before.
        const pgText = text.replace(/'[^']*'|\?/g, (match) => {
            if (match === '?') {
                return `$${counter++}`;
            }
            return match;
        });
        return {
            run: (...params) => query(pgText, params),
            get: (...params) => getRow(pgText, params),
            all: (...params) => getAll(pgText, params),
        };
    },
    exec: (text) => query(text),
};
