/**
 * Normalizes a SillyTavern chat file name for use by the client chat loader.
 * @param {unknown} value Chat file name returned by a history endpoint.
 * @returns {string}
 */
export function normalizeCharacterChatName(value) {
    return typeof value === 'string' ? value.replace(/\.jsonl$/i, '').trim() : '';
}

function getChatTimestamp(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function getMessageCount(chat) {
    const count = Number(chat?.chat_items ?? chat?.message_count ?? 0);
    return Number.isFinite(count) ? count : 0;
}

/**
 * Chooses the most recently active character chat without treating a newly
 * generated greeting-only file as more important than an established chat.
 * @param {unknown} value Chat history response.
 * @returns {{ fileName: string, timestamp: number, messageCount: number } | null}
 */
export function selectLatestCharacterChat(value) {
    if (!Array.isArray(value)) {
        return null;
    }

    const candidates = value
        .map(chat => ({
            fileName: normalizeCharacterChatName(chat?.file_name),
            timestamp: getChatTimestamp(chat?.last_mes),
            messageCount: getMessageCount(chat),
        }))
        .filter(chat => chat.fileName);

    if (!candidates.length) {
        return null;
    }

    const establishedChats = candidates.filter(chat => chat.messageCount > 1);
    const pool = establishedChats.length ? establishedChats : candidates;
    pool.sort((left, right) => right.timestamp - left.timestamp || right.fileName.localeCompare(left.fileName));
    return pool[0];
}
