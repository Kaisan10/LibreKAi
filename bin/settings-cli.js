#!/usr/bin/env node
/**
 * KAi Settings CLI - システム設定 & プラグイン管理
 * Bilingual: Japanese (ja) / English (en)
 *
 * Usage:
 *   node bin/settings-cli.js list
 *   node bin/settings-cli.js get <key>
 *   node bin/settings-cli.js set <key> [value] [category]
 *   node bin/settings-cli.js delete <key>
 *   node bin/settings-cli.js import-env [.env path]
 *   node bin/settings-cli.js plugins
 *   node bin/settings-cli.js enable-auth discourse <url> <secret>
 */

process.env.SKIP_LOG_FILE = '1';

require('dotenv').config();

const Settings = require('../lib/settings');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// --- i18n ---
const BOOTSTRAP_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'PORT', 'NODE_ENV'];
const APP_SETTINGS_META = {
    SESSION_SECRET: { category: 'security', description: 'Express session secret' },
    CORS_ORIGIN: { category: 'security', description: 'CORS allowed origins' },
    SITE_URL: { category: 'general', description: 'Main site URL' },
    ADMIN_USERNAME: { category: 'general', description: 'Default admin username' },
    ADMIN_TOKEN: { category: 'security', description: 'Admin API token' },
    WEBHOOK_TOKEN: { category: 'security', description: 'Webhook auth token' },
    DISCOURSE_URL: { category: 'auth', description: 'Discourse forum URL' },
    DISCOURSE_SECRET: { category: 'auth', description: 'Discourse SSO secret' },
    POINTS_API_KEY: { category: 'integration', description: 'Points service API key' },
    SHORT_URL_API_KEY: { category: 'integration', description: 'Short URL service API key' },
    VOICEVOX_URL: { category: 'integration', description: 'Voicevox engine URL' },
    PYTHON_PATH: { category: 'general', description: 'Python interpreter path' },
    APP_URL: { category: 'general', description: 'Application URL' }
};

function getLang() {
    const argv = process.argv;
    for (let i = 0; i < argv.length; i++) {
        if ((argv[i] === '--lang' || argv[i] === '-l') && argv[i + 1]) return argv[i + 1];
    }
    const langEnv = process.env.LANG || process.env.LC_ALL || '';
    return /^ja/i.test(langEnv) ? 'ja' : 'en';
}

function getFilteredArgs() {
    const argv = process.argv.slice(2);
    const out = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--lang' || argv[i] === '-l') {
            i++;
            continue;
        }
        out.push(argv[i]);
    }
    return out;
}

const LANG = getLang();
const t = {
    ja: {
        listTitle: '--- システム設定一覧 ---',
        listEmpty: '設定はありません。',
        setUsage: '使い方: set <キー> [値] [カテゴリ]',
        setSuccess: (k, v) => `✅ 設定しました: ${k} = ${v}`,
        setPrompt: (k) => `値 (${k}): `,
        setPromptSecret: (k) => `値 (${k}) [秘密のため非表示]: `,
        deleteUsage: '使い方: delete <キー>',
        deleteSuccess: (k) => `✅ 削除しました: ${k}`,
        getUsage: '使い方: get <キー>',
        getNotFound: (k) => `${k}: (未設定)`,
        getFound: (k, v) => `${k} = ${v}`,
        importEnvUsage: '使い方: import-env [.env のパス]',
        importEnvNoFile: 'ファイルが見つかりません: ',
        importEnvTitle: '以下をDBにインポートします:',
        importEnvSkip: '(スキップ: ブートストラップ用)',
        importEnvConfirm: '続行しますか? [y/N]: ',
        importEnvCancelled: 'キャンセルしました。',
        importEnvSuccess: (n) => `✅ ${n} 件をインポートしました。`,
        importEnvNone: 'インポートする設定がありません。',
        pluginsDirNotFound: 'プラグインディレクトリが見つかりません。',
        pluginsTitle: '--- インストール済みプラグイン ---',
        pluginsName: '名前',
        pluginsType: 'タイプ',
        pluginsRequired: '必要設定',
        pluginsNone: 'なし',
        pluginsLoadFail: (f, m) => `ファイル: ${f} (ロード失敗: ${m})`,
        authSuccess: 'discourse認証設定を更新しました。',
        authRestart: '変更を反映するには、サーバーを再起動してください。',
        authUsage: '使い方: enable-auth discourse <URL> <Secret>',
        helpTitle: 'KAi CLI 管理ツール',
        helpCommands: '利用可能なコマンド:',
        helpList: 'list                     - 設定一覧を表示',
        helpGet: 'get <キー>               - 単一キーの値を表示',
        helpSet: 'set <キー> [値] [カテゴリ] - 設定値を変更（値省略でプロンプト）',
        helpDelete: 'delete <キー>            - 設定を削除',
        helpImport: 'import-env [パス]        - .env から DB へインポート',
        helpPlugins: 'plugins                  - プラグイン情報を表示',
        helpAuth: 'enable-auth discourse <url> <secret> - discourse認証設定',
        helpLang: '--lang en|ja             - 言語指定',
        error: (m) => `エラー: ${m}`
    },
    en: {
        listTitle: '--- System Settings ---',
        listEmpty: 'No settings.',
        setUsage: 'Usage: set <key> [value] [category]',
        setSuccess: (k, v) => `✅ Set: ${k} = ${v}`,
        setPrompt: (k) => `Value (${k}): `,
        setPromptSecret: (k) => `Value (${k}) [hidden]: `,
        deleteUsage: 'Usage: delete <key>',
        deleteSuccess: (k) => `✅ Deleted: ${k}`,
        getUsage: 'Usage: get <key>',
        getNotFound: (k) => `${k}: (not set)`,
        getFound: (k, v) => `${k} = ${v}`,
        importEnvUsage: 'Usage: import-env [path to .env]',
        importEnvNoFile: 'File not found: ',
        importEnvTitle: 'Import the following to DB:',
        importEnvSkip: '(skipped: bootstrap only)',
        importEnvConfirm: 'Continue? [y/N]: ',
        importEnvCancelled: 'Cancelled.',
        importEnvSuccess: (n) => `✅ Imported ${n} settings.`,
        importEnvNone: 'No settings to import.',
        pluginsDirNotFound: 'Plugins directory not found.',
        pluginsTitle: '--- Installed Plugins ---',
        pluginsName: 'Name',
        pluginsType: 'Type',
        pluginsRequired: 'Required settings',
        pluginsNone: 'None',
        pluginsLoadFail: (f, m) => `File: ${f} (load failed: ${m})`,
        authSuccess: 'Discourse auth settings updated.',
        authRestart: 'Restart the server to apply changes.',
        authUsage: 'Usage: enable-auth discourse <URL> <Secret>',
        helpTitle: 'KAi Settings CLI',
        helpCommands: 'Available commands:',
        helpList: 'list                     - List all settings',
        helpGet: 'get <key>                - Show single key value',
        helpSet: 'set <key> [value] [cat]   - Set value (prompt if value omitted)',
        helpDelete: 'delete <key>             - Delete setting',
        helpImport: 'import-env [path]        - Import .env to DB',
        helpPlugins: 'plugins                  - List plugins',
        helpAuth: 'enable-auth discourse <url> <secret> - Discourse auth',
        helpLang: '--lang en|ja             - Language',
        error: (m) => `Error: ${m}`
    }
};

const msg = t[LANG] || t.en;

function isSecretKey(key) {
    const k = (key || '').toLowerCase();
    return k.includes('secret') || k.includes('token') || k.includes('key') || k.includes('pass');
}

function question(promptStr) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(promptStr, (ans) => {
            rl.close();
            resolve(ans);
        });
    });
}

async function run() {
    const filteredArgs = getFilteredArgs();
    const command = filteredArgs[0];
    const args = filteredArgs.slice(1);

    if (!command || command === '--help' || command === '-h') {
        console.log('\n' + msg.helpTitle);
        console.log(msg.helpCommands);
        console.log('  ' + msg.helpList);
        console.log('  ' + msg.helpGet);
        console.log('  ' + msg.helpSet);
        console.log('  ' + msg.helpDelete);
        console.log('  ' + msg.helpImport);
        console.log('  ' + msg.helpPlugins);
        console.log('  ' + msg.helpAuth);
        console.log('  ' + msg.helpLang);
        process.exit(0);
    }

    try {
        await Settings.load();

        switch (command) {
            case 'list': {
                console.log('\n' + msg.listTitle);
                const all = Settings.getAll();
                if (Object.keys(all).length === 0) {
                    console.log(msg.listEmpty);
                } else {
                    console.table(all);
                }
                break;
            }

            case 'get': {
                const key = args[0];
                if (!key) {
                    console.log(msg.getUsage);
                    break;
                }
                const val = Settings.get(key);
                if (val == null || val === '') {
                    console.log(msg.getNotFound(key));
                } else {
                    console.log(msg.getFound(key, isSecretKey(key) ? '••••••••' : val));
                }
                break;
            }

            case 'set': {
                const [key, value, category] = args;
                if (!key) {
                    console.log(msg.setUsage);
                    break;
                }
                let finalValue = value;
                if (finalValue === undefined) {
                    const promptStr = isSecretKey(key) ? msg.setPromptSecret(key) : msg.setPrompt(key);
                    finalValue = await question(promptStr);
                }
                if (finalValue === undefined || (typeof finalValue === 'string' && finalValue.trim() === '')) {
                    console.log(msg.error(LANG === 'ja' ? '値が入力されていません。' : 'No value provided.'));
                    break;
                }
                const meta = APP_SETTINGS_META[key] || {};
                const cat = category || meta.category || 'general';
                await Settings.set(key, String(finalValue).trim(), cat);
                console.log(msg.setSuccess(key, isSecretKey(key) ? '••••••••' : finalValue));
                break;
            }

            case 'delete': {
                const deleteKey = args[0];
                if (!deleteKey) {
                    console.log(msg.deleteUsage);
                    break;
                }
                await Settings.delete(deleteKey);
                console.log(msg.deleteSuccess(deleteKey));
                break;
            }

            case 'import-env': {
                const envPath = args[0] || path.join(process.cwd(), '.env');
                const resolved = path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
                if (!fs.existsSync(resolved)) {
                    console.error(msg.importEnvNoFile + resolved);
                    process.exit(1);
                }
                const dotenv = require('dotenv');
                const parsed = dotenv.parse(fs.readFileSync(resolved));
                const toImport = [];
                for (const [k, v] of Object.entries(parsed)) {
                    if (!v || v.trim() === '') continue;
                    if (BOOTSTRAP_KEYS.includes(k)) continue;
                    toImport.push({ key: k, value: v });
                }
                if (toImport.length === 0) {
                    console.log(msg.importEnvNone);
                    break;
                }
                console.log(msg.importEnvTitle);
                for (const item of toImport) {
                    console.log(`  - ${item.key}`);
                }
                for (const k of Object.keys(parsed).filter(k => BOOTSTRAP_KEYS.includes(k))) {
                    console.log(`  - ${k} ${msg.importEnvSkip}`);
                }
                const ans = await question(msg.importEnvConfirm);
                if (!/^y/i.test(ans)) {
                    console.log(msg.importEnvCancelled);
                    break;
                }
                let count = 0;
                for (const item of toImport) {
                    const meta = APP_SETTINGS_META[item.key] || {};
                    const ok = await Settings.set(item.key, item.value, meta.category || 'general', meta.description || '');
                    if (ok) count++;
                }
                console.log(msg.importEnvSuccess(count));
                break;
            }

            case 'plugins': {
                const pluginsDir = path.join(__dirname, '../lib/plugins');
                if (!fs.existsSync(pluginsDir)) {
                    console.log(msg.pluginsDirNotFound);
                    break;
                }
                const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
                console.log('\n' + msg.pluginsTitle);
                for (const file of files) {
                    try {
                        const plugin = require(path.join(pluginsDir, file));
                        const meta = plugin.meta || {};
                        console.log(`- ID: ${meta.id || file}`);
                        console.log(`  ${msg.pluginsName}: ${meta.name || '-'}`);
                        console.log(`  ${msg.pluginsType}: ${Array.isArray(meta.type) ? meta.type.join(', ') : meta.type || '-'}`);
                        console.log(`  ${msg.pluginsRequired}: ${(meta.requiredSettings || []).join(', ') || msg.pluginsNone}`);
                        console.log('-------------------------');
                    } catch (e) {
                        console.log('- ' + msg.pluginsLoadFail(file, e.message));
                    }
                }
                break;
            }

            case 'enable-auth': {
                const [provider, url, secret] = args;
                if (provider === 'discourse' && url && secret) {
                    await Settings.set('DISCOURSE_URL', url, 'auth');
                    await Settings.set('DISCOURSE_SECRET', secret, 'auth');
                    console.log('✅ ' + msg.authSuccess);
                    console.log(msg.authRestart);
                } else {
                    console.log(msg.authUsage);
                }
                break;
            }

            default:
                console.log(msg.helpTitle + '\n' + msg.helpCommands);
                console.log('  ' + msg.helpList);
                console.log('  ' + msg.helpSet);
        }
    } catch (err) {
        console.error(msg.error(err.message));
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

run();
