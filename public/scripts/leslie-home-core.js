export const LESLIE_HOME_CHARACTER_LIMIT = 8;

function toTimestamp(value) {
    if (!value) {
        return 0;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Keep stored character pins ordered, unique, and limited to characters that
 * still exist. The stored avatar file is the stable SillyTavern identifier.
 * @param {unknown} value Stored pin value.
 * @param {Array<{avatar?: string}>} availableCharacters Current characters.
 * @returns {string[]} Normalized avatar identifiers.
 */
export function normalizePinnedCharacterAvatars(value, availableCharacters) {
    const available = new Set((Array.isArray(availableCharacters) ? availableCharacters : [])
        .map(character => String(character?.avatar || '').trim())
        .filter(Boolean));
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map(item => String(item || '').trim()).filter(item => available.has(item)))]
        .slice(0, LESLIE_HOME_CHARACTER_LIMIT);
}

/**
 * Migrate a pin while SillyTavern is between renaming the avatar file and
 * refreshing the in-memory character list. Availability is validated on the
 * next normal read, after the refreshed character list is present.
 * @param {unknown} value Stored pin value.
 * @param {string} oldAvatar Previous avatar identifier.
 * @param {string} newAvatar Renamed avatar identifier.
 * @returns {string[]} Migrated pin identifiers.
 */
export function migratePinnedCharacterAvatar(value, oldAvatar, newAvatar) {
    const previous = String(oldAvatar || '').trim();
    const next = String(newAvatar || '').trim();
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source
        .map(item => String(item || '').trim())
        .map(item => item === previous ? next : item)
        .filter(Boolean))]
        .slice(0, LESLIE_HOME_CHARACTER_LIMIT);
}

/**
 * Select the newest real chat regardless of legacy welcome-page pin order.
 * @param {Array<object>} recentChats Recent chat rows.
 * @returns {object|null} Newest chat.
 */
export function selectHomeContinueChat(recentChats) {
    if (!Array.isArray(recentChats)) {
        return null;
    }
    return recentChats
        .filter(chat => chat && (chat.avatar || chat.group))
        .sort((left, right) => toTimestamp(right.last_mes) - toTimestamp(left.last_mes))[0] ?? null;
}

/**
 * Rank home characters. Manual pins always lead; automatic entries use the
 * number and message volume of recent sessions, followed by SillyTavern's
 * aggregate chat size and last-chat timestamp.
 * @param {Array<object>} availableCharacters Current character list.
 * @param {Array<object>} recentChats Recent chat rows.
 * @param {string[]} pinnedAvatars Ordered manual pins.
 * @param {number} limit Maximum number of results.
 * @returns {Array<object>} Ranked characters with home metadata.
 */
export function rankHomeCharacters(availableCharacters, recentChats, pinnedAvatars, limit = LESLIE_HOME_CHARACTER_LIMIT) {
    const activity = new Map();
    for (const chat of Array.isArray(recentChats) ? recentChats : []) {
        const avatar = String(chat?.avatar || '').trim();
        if (!avatar || chat?.is_group) {
            continue;
        }
        const current = activity.get(avatar) ?? { sessions: 0, messages: 0, latest: 0 };
        current.sessions += 1;
        current.messages += Math.max(0, Number(chat.chat_items) || 0);
        current.latest = Math.max(current.latest, toTimestamp(chat.last_mes));
        activity.set(avatar, current);
    }

    const normalizedPins = normalizePinnedCharacterAvatars(pinnedAvatars, availableCharacters);
    const pinOrder = new Map(normalizedPins.map((avatar, index) => [avatar, index]));
    return (Array.isArray(availableCharacters) ? availableCharacters : [])
        .filter(character => String(character?.avatar || '').trim())
        .map((character) => {
            const avatar = String(character.avatar).trim();
            const recent = activity.get(avatar) ?? { sessions: 0, messages: 0, latest: 0 };
            return {
                ...character,
                homePinned: pinOrder.has(avatar),
                homePinOrder: pinOrder.get(avatar) ?? Number.MAX_SAFE_INTEGER,
                homeSessions: recent.sessions,
                homeMessages: recent.messages,
                homeLatest: Math.max(recent.latest, toTimestamp(character.date_last_chat)),
                homeChatSize: Math.max(0, Number(character.chat_size) || 0),
            };
        })
        .sort((left, right) => {
            if (left.homePinned !== right.homePinned) {
                return left.homePinned ? -1 : 1;
            }
            if (left.homePinned && right.homePinned) {
                return left.homePinOrder - right.homePinOrder;
            }
            return right.homeSessions - left.homeSessions
                || right.homeMessages - left.homeMessages
                || right.homeChatSize - left.homeChatSize
                || right.homeLatest - left.homeLatest
                || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN');
        })
        .slice(0, Math.max(0, Number(limit) || 0));
}

/**
 * Turn posts and character replies into a small, content-free activity list.
 * Chat or post bodies are deliberately excluded from the home screen.
 * @param {Array<object>} posts Decorated Leslie Moments posts.
 * @param {number} limit Maximum activity rows.
 * @returns {Array<{kind: string, label: string, avatar: string, createdAt: string}>} Activities.
 */
export function buildHomeMomentActivities(posts, limit = 3) {
    const activities = [];
    for (const post of Array.isArray(posts) ? posts : []) {
        if (!post || post.status === 'archived') {
            continue;
        }
        const authorLabel = String(post.author?.label || '有人').trim();
        activities.push({
            kind: 'post',
            label: post.author?.type === 'character' ? `${authorLabel} 发布了一条动态` : `${authorLabel} 分享了一条动态`,
            avatar: String(post.author?.avatar || ''),
            createdAt: String(post.createdAt || post.updatedAt || ''),
        });
        for (const comment of Array.isArray(post.reactions?.comments) ? post.reactions.comments : []) {
            if (comment?.actor?.type !== 'character') {
                continue;
            }
            const actorLabel = String(comment.actor?.label || '某个角色').trim();
            const targetLabel = post.author?.type === 'persona'
                ? '你的动态'
                : `${authorLabel} 的动态`;
            activities.push({
                kind: 'comment',
                label: `${actorLabel} 回复了${targetLabel}`,
                avatar: String(comment.actor?.avatar || ''),
                createdAt: String(comment.createdAt || ''),
            });
        }
    }
    return activities
        .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
        .slice(0, Math.max(0, Number(limit) || 0));
}

export function getLeslieHomeGreeting(hour = new Date().getHours()) {
    const normalized = Number(hour);
    if (normalized >= 5 && normalized < 12) {
        return '早上好';
    }
    if (normalized >= 12 && normalized < 18) {
        return '下午好';
    }
    return '晚上好';
}
