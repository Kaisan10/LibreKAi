#!/usr/bin/env node

/**
 * LibreKAi Setup Script
 * Interactive CLI for setting up the application.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');

// --- Translations ---
const MESSAGES = {
    ja: {
        welcome: 'LibreKAi セットアップへようこそ！',
        select_lang: '言語を選択してください (ja/en): ',
        env_found: '.env ファイルが見つかりました。既存の設定を使用しますか？ (y/n): ',
        db_host: 'データベースホスト (default: localhost): ',
        db_port: 'データベースポート (default: 5432): ',
        db_user: 'データベースユーザー: ',
        db_pass: 'データベースパスワード: ',
        db_name: 'データベース名: ',
        db_connecting: 'データベースに接続しています...',
        db_connected: '✅ データベースに接続しました。',
        db_error: '❌ データベース接続エラー: ',
        init_tables: 'テーブルを初期化しています...',
        tables_done: '✅ テーブルの初期化が完了しました。',
        admin_setup: '--- 管理者アカウントの設定 ---',
        admin_username: '管理者ユーザー名 (default: admin): ',
        admin_email: '管理者メールアドレス: ',
        admin_pass: '管理者パスワード: ',
        admin_creating: '管理者アカウントを作成しています...',
        admin_done: '✅ 管理者アカウントを作成しました。',
        admin_exists: 'ℹ️ 管理者アカウントは既に存在します。スキップします。',
        settings_seeding: '基本設定を投入しています...',
        settings_done: '✅ 基本設定の投入が完了しました。',
        setup_complete: '\n🎉 セットアップが完了しました！\n"npm start" でサーバーを起動してください。',
        invalid_input: '無効な入力です。',
        site_url: 'サイトURL (例: https://ai.example.com): ',
        session_secret: 'セッション秘密鍵 (自動生成しますか？ y/n): ',
    },
    en: {
        welcome: 'Welcome to LibreKAi Setup!',
        select_lang: 'Select language (ja/en): ',
        env_found: '.env file found. Use existing settings? (y/n): ',
        db_host: 'Database Host (default: localhost): ',
        db_port: 'Database Port (default: 5432): ',
        db_user: 'Database User: ',
        db_pass: 'Database Password: ',
        db_name: 'Database Name: ',
        db_connecting: 'Connecting to database...',
        db_connected: '✅ Connected to database.',
        db_error: '❌ Database connection error: ',
        init_tables: 'Initializing tables...',
        tables_done: '✅ Tables initialized.',
        admin_setup: '--- Admin Account Setup ---',
        admin_username: 'Admin Username (default: admin): ',
        admin_email: 'Admin Email: ',
        admin_pass: 'Admin Password: ',
        admin_creating: 'Creating admin account...',
        admin_done: '✅ Admin account created.',
        admin_exists: 'ℹ️ Admin account already exists. Skipping.',
        settings_seeding: 'Seeding basic settings...',
        settings_done: '✅ Basic settings seeded.',
        setup_complete: '\n🎉 Setup complete!\nRun "npm start" to start the server.',
        invalid_input: 'Invalid input.',
        site_url: 'Site URL (e.g., https://ai.example.com): ',
        session_secret: 'Session Secret (Generate automatically? y/n): ',
    }
};

let L = MESSAGES.en;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.log('====================================');
    console.log('       LibreKAi Setup CLI           ');
    console.log('====================================\n');

    // Language selection
    const langInput = await rl.question('Select language / 言語を選択してください (ja/en) [ja]: ');
    const lang = (langInput.trim().toLowerCase() === 'en') ? 'en' : 'ja';
    L = MESSAGES[lang];

    console.log(`\n${L.welcome}\n`);

    let config = {};
    if (fs.existsSync(ENV_FILE)) {
        const useExisting = await rl.question(L.env_found);
        if (useExisting.toLowerCase() === 'y') {
            config = loadEnv();
        }
    }

    // DB Setup
    config.DB_HOST = config.DB_HOST || await rl.question(L.db_host) || 'localhost';
    config.DB_PORT = config.DB_PORT || await rl.question(L.db_port) || '5432';
    config.DB_USER = config.DB_USER || await rl.question(L.db_user);
    config.DB_PASS = config.DB_PASS || await rl.question(L.db_pass);
    config.DB_NAME = config.DB_NAME || await rl.question(L.db_name) || 'kai_db';

    // Site Setup
    config.SITE_URL = config.SITE_URL || await rl.question(L.site_url);
    
    if (!config.SESSION_SECRET) {
        const genSecret = await rl.question(L.session_secret);
        if (genSecret.toLowerCase() === 'y' || genSecret === '') {
            config.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        } else {
            config.SESSION_SECRET = await rl.question('Enter Session Secret: ');
        }
    }

    // Save .env early to allow Pool to use it if needed, or just pass config
    saveEnv(config);

    // DB Connection & Initialization
    console.log(`\n${L.db_connecting}`);
    const pool = new Pool({
        host: config.DB_HOST,
        port: config.DB_PORT,
        user: config.DB_USER,
        password: config.DB_PASS,
        database: config.DB_NAME,
    });

    try {
        await pool.query('SELECT NOW()');
        console.log(L.db_connected);

        console.log(L.init_tables);
        await initTables(pool);
        console.log(L.tables_done);

        // Admin Setup
        console.log(`\n${L.admin_setup}`);
        const adminCheck = await pool.query('SELECT * FROM users WHERE role = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            const adminUser = await rl.question(L.admin_username) || 'admin';
            const adminEmail = await rl.question(L.admin_email);
            const adminPass = await rl.question(L.admin_pass);
            
            console.log(L.admin_creating);
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(adminPass, salt);
            const userId = crypto.randomUUID();
            
            await pool.query(`
                INSERT INTO users (
                    id, username, email, name, role, auth_provider, password_hash, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            `, [userId, adminUser, adminEmail, adminUser, 'admin', 'local', hash]);
            
            config.ADMIN_USERNAME = adminUser;
            saveEnv(config);
            console.log(L.admin_done);
        } else {
            console.log(L.admin_exists);
        }

        // Seed Basic Settings
        console.log(L.settings_seeding);
        await seedSettings(pool, config);
        console.log(L.settings_done);

        console.log(L.setup_complete);

    } catch (err) {
        console.error(`${L.db_error}${err.message}`);
        console.log('\n❌ Setup failed. Please check your database settings and try again.');
    } finally {
        await pool.end();
        rl.close();
    }
}

function loadEnv() {
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) {
            config[key.trim()] = value.join('=').trim();
        }
    });
    return config;
}

function saveEnv(config) {
    let content = '';
    for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
            content += `${key}=${value}\n`;
        }
    }
    fs.writeFileSync(ENV_FILE, content);
}

async function initTables(pool) {
    const schema = `
        CREATE TABLE IF NOT EXISTS users (
            id text PRIMARY KEY,
            discourse_id text,
            username text UNIQUE,
            email text,
            name text,
            avatar_url text,
            is_pro boolean DEFAULT false,
            pro_expiry timestamp with time zone,
            auto_renew boolean DEFAULT true,
            total_points integer DEFAULT 0,
            total_spent integer DEFAULT 0,
            save_text_history boolean DEFAULT true,
            save_image_history boolean DEFAULT true,
            pro_settings jsonb,
            has_agreed_terms boolean DEFAULT false,
            created_at timestamp with time zone,
            updated_at timestamp with time zone,
            role character varying(20) DEFAULT 'member',
            password_hash text,
            auth_provider character varying(20) DEFAULT 'discourse'
        );

        CREATE TABLE IF NOT EXISTS settings (
            key character varying(255) PRIMARY KEY,
            value text,
            category character varying(50),
            description text,
            updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id text PRIMARY KEY,
            user_id text REFERENCES users(id) ON DELETE CASCADE,
            title text,
            created_at timestamp with time zone,
            last_accessed_at timestamp with time zone,
            is_public boolean DEFAULT false,
            expires_at timestamp with time zone,
            short_url text,
            tags text,
            is_pinned boolean DEFAULT false,
            embedded_site_id text
        );

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            session_id text REFERENCES sessions(id) ON DELETE CASCADE,
            role text,
            content text,
            timestamp timestamp with time zone,
            image text,
            model text,
            tokens_per_sec real,
            toxicity jsonb
        );

        CREATE TABLE IF NOT EXISTS images (
            id SERIAL PRIMARY KEY,
            filename character varying(255) UNIQUE,
            data bytea NOT NULL,
            mime_type character varying(50) NOT NULL,
            width integer,
            height integer,
            size integer,
            created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS blog_comments (
            id SERIAL PRIMARY KEY,
            blog_date date NOT NULL,
            blog_id character varying(50) NOT NULL,
            user_id text REFERENCES users(id) ON DELETE SET NULL,
            content text NOT NULL,
            parent_id integer REFERENCES blog_comments(id) ON DELETE CASCADE,
            created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp with time zone
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id SERIAL PRIMARY KEY,
            session_id text,
            message_id integer,
            user_id text,
            type character varying(10) NOT NULL,
            reason text,
            reason_tags jsonb,
            created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS embedded_sites (
            id text PRIMARY KEY,
            site_url text NOT NULL,
            site_name text,
            allowed_origins jsonb,
            api_key text UNIQUE,
            rate_limit_per_minute integer DEFAULT 10,
            is_active boolean DEFAULT true,
            created_at timestamp with time zone,
            updated_at timestamp with time zone,
            created_by text,
            pos_desktop text DEFAULT 'bottom-right',
            pos_mobile text DEFAULT 'bottom-right',
            offset_x_desktop text DEFAULT '20px',
            offset_y_desktop text DEFAULT '20px',
            offset_x_mobile text DEFAULT '20px',
            offset_y_mobile text DEFAULT '20px',
            api_key_is_hashed boolean DEFAULT false
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
            sid character varying PRIMARY KEY,
            sess json NOT NULL,
            expire timestamp(6) without time zone NOT NULL
        );

        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON user_sessions (expire);

        CREATE TABLE IF NOT EXISTS user_tags (
            id SERIAL PRIMARY KEY,
            user_id text REFERENCES users(id) ON DELETE CASCADE,
            name text,
            color text,
            created_at timestamp with time zone,
            UNIQUE(user_id, name)
        );

        CREATE TABLE IF NOT EXISTS announcements (
            id text PRIMARY KEY,
            version integer DEFAULT 1,
            title text,
            message text,
            link_text text,
            link_url text,
            created_at timestamp with time zone
        );

        CREATE TABLE IF NOT EXISTS user_announcements (
            user_id text REFERENCES users(id) ON DELETE CASCADE,
            announcement_id text REFERENCES announcements(id) ON DELETE CASCADE,
            seen_at timestamp with time zone,
            dismissed boolean DEFAULT false,
            PRIMARY KEY (user_id, announcement_id)
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            id text PRIMARY KEY,
            user_id text UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            api_key text UNIQUE,
            name text DEFAULT 'My API Key',
            usage_count integer DEFAULT 0,
            success_count integer DEFAULT 0,
            failure_count integer DEFAULT 0,
            completion_count integer DEFAULT 0,
            models_count integer DEFAULT 0,
            last_used_at timestamp with time zone,
            created_at timestamp with time zone
        );

        CREATE TABLE IF NOT EXISTS api_usage_stats (
            id SERIAL PRIMARY KEY,
            api_key_id text REFERENCES api_keys(id) ON DELETE CASCADE,
            date date,
            success_count integer DEFAULT 0,
            failure_count integer DEFAULT 0,
            completion_count integer DEFAULT 0,
            models_count integer DEFAULT 0,
            UNIQUE(api_key_id, date)
        );
    `;
    await pool.query(schema);
}

async function seedSettings(pool, config) {
    const initialSettings = [
        { key: 'SITE_TITLE', value: 'LibreKAi', category: 'general', description: 'Application title' },
        { key: 'SITE_URL', value: config.SITE_URL || '', category: 'general', description: 'Application base URL' },
        { key: 'META_DESCRIPTION', value: 'Open Source AI Search Interface', category: 'general', description: 'SEO description' },
        { key: 'SESSION_SECRET', value: config.SESSION_SECRET, category: 'security', description: 'Express session secret' },
    ];

    for (const s of initialSettings) {
        await pool.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (key) DO NOTHING
        `, [s.key, s.value, s.category, s.description]);
    }
}

main().catch(console.error);
