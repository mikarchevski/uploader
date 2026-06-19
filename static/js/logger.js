// static/js/logger.js
import { getCsrfToken } from './csrf.js';

const LOG_ENDPOINT = '/api/log';
let logQueue = [];
let isSending = false;

async function sendLogToServer(level, message, details = '') {
    try {
        const csrfToken = getCsrfToken();
        const headers = { 
            'Content-Type': 'application/json'
        };
        
        if (csrfToken) {
            headers['X-CSRFToken'] = csrfToken;
        }
        
        await fetch(LOG_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ level, message, details })
        });
    } catch (error) {
        // Тихо игнорируем ошибки логгера, чтобы не зациклить
    }
}

function queueLog(level, message, details = '') {
    logQueue.push({ level, message, details });
    if (!isSending) flushLogs();
}

async function flushLogs() {
    if (isSending || logQueue.length === 0) return;
    isSending = true;
    const batch = [...logQueue];
    logQueue = [];
    
    // Отправляем пакетом для эффективности
    const combinedMessage = batch.map(l => l.message).join(' | ');
    const combinedDetails = batch.map(l => l.details).filter(d => d).join(' | ');
    
    await sendLogToServer(batch[0].level, combinedMessage, combinedDetails);
    isSending = false;
    
    if (logQueue.length > 0) setTimeout(flushLogs, 100);
}

export const clientLogger = {
    info: (msg, det = '') => queueLog('INFO', msg, det),
    warn: (msg, det = '') => { queueLog('WARN', msg, det); console.warn(msg); },
    error: (msg, det = '') => { queueLog('ERROR', msg, det); console.error(msg); },
    debug: (msg, det = '') => queueLog('DEBUG', msg, det)
};

// Перехват глобальных ошибок
window.addEventListener('error', (e) => clientLogger.error(`Uncaught: ${e.message}`, `${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => clientLogger.error(`Promise Rejection: ${e.reason}`));