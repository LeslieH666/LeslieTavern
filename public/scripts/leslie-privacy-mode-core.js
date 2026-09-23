export const LESLIE_PRIVACY_MODE_STORAGE_KEY = 'leslie.privacy-mode.v1';

export const LESLIE_PRIVACY_BLOCKS = Object.freeze([
    Object.freeze({ id: 'conversations' }),
    Object.freeze({ id: 'header' }),
    Object.freeze({ id: 'messages' }),
    Object.freeze({ id: 'composer' }),
    Object.freeze({ id: 'connection' }),
]);

const DEFAULT_BLOCKS = Object.freeze({
    conversations: true,
    header: true,
    messages: true,
    composer: true,
    connection: false,
});

export const DEFAULT_LESLIE_PRIVACY_MODE_STATE = Object.freeze({
    enabled: false,
    blocks: DEFAULT_BLOCKS,
});

function getBrowserStorage() {
    try {
        return globalThis.localStorage;
    } catch {
        return undefined;
    }
}

/**
 * Return a complete, forward-compatible privacy preference.
 * @param {unknown} value Stored or user-provided preference.
 * @returns {{enabled: boolean, blocks: Record<string, boolean>}} Normalized preference.
 */
export function normalizeLesliePrivacyModeState(value) {
    const candidate = value && typeof value === 'object' ? value : {};
    const candidateBlocks = candidate.blocks && typeof candidate.blocks === 'object' ? candidate.blocks : {};
    const blocks = {};

    for (const { id } of LESLIE_PRIVACY_BLOCKS) {
        blocks[id] = typeof candidateBlocks[id] === 'boolean'
            ? candidateBlocks[id]
            : DEFAULT_BLOCKS[id];
    }

    return {
        enabled: candidate.enabled === true,
        blocks,
    };
}

/**
 * Read the visual-only privacy preference. Invalid storage fails open with
 * privacy mode disabled so the ordinary chat UI remains usable.
 * @param {Storage | undefined} storage Browser storage implementation.
 * @returns {{enabled: boolean, blocks: Record<string, boolean>}} Stored preference.
 */
export function readLesliePrivacyModeState(storage) {
    try {
        const value = (storage ?? getBrowserStorage())?.getItem(LESLIE_PRIVACY_MODE_STORAGE_KEY);
        return normalizeLesliePrivacyModeState(value ? JSON.parse(value) : undefined);
    } catch {
        return normalizeLesliePrivacyModeState(undefined);
    }
}

/**
 * Save a normalized privacy preference without allowing unavailable storage
 * to interrupt the chat UI.
 * @param {Storage | undefined} storage Browser storage implementation.
 * @param {unknown} value Privacy preference.
 * @returns {{enabled: boolean, blocks: Record<string, boolean>}} Saved preference.
 */
export function writeLesliePrivacyModeState(storage, value) {
    const normalized = normalizeLesliePrivacyModeState(value);
    try {
        (storage ?? getBrowserStorage())?.setItem(LESLIE_PRIVACY_MODE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // Privacy mode is a local visual preference and must fail open.
    }
    return normalized;
}
