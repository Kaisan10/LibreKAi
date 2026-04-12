const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

const getLogFilePath = () => {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `server-${date}.log`);
};

const formatMessage = (level, message) => {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
};

const writeToFile = (level, message) => {
    // CLI実行時など、権限がない場合に備えて書き込みをスキップできるようにする
    if (process.env.SKIP_LOG_FILE) return;

    try {
        const logFile = getLogFilePath();
        const formatted = formatMessage(level, message);
        fs.appendFileSync(logFile, formatted);
    } catch (e) {
        // Silent fail to avoid crashing CLI tools
        // console.error('Failed to write to server log file:', e);
    }
};

const logger = {
    info: (...args) => {
        const message = args.join(' ');
        console.log(message);
        writeToFile('info', message);
    },
    warn: (...args) => {
        const message = args.join(' ');
        console.warn(message);
        writeToFile('warn', message);
    },
    error: (message, error) => {
        const fullMessage = error ? `${message} ${error.stack || error}` : message;
        console.error(fullMessage);
        writeToFile('error', fullMessage);
    },
    verbose: (...args) => {
        const message = args.join(' ');
        if (process.env.NODE_ENV !== 'production') {
            console.log('[VERBOSE]', message);
        }
        writeToFile('verbose', message);
    }
};

module.exports = logger;
