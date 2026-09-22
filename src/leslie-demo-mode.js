import path from 'node:path';

/**
 * Reserved logical handle prefix for Leslie demo storage. The leading
 * underscores cannot be produced by the normal account slugifier, keeping
 * demo namespaces separate from real account handles.
 */
export const LESLIE_DEMO_STORAGE_PREFIX = '__leslie-demo--';
export const LESLIE_DEMO_SESSION_KEY = 'leslieDemoMode';
export const LESLIE_DEMO_DIRECTORY = '_demo';

/**
 * Validate an account handle before using it as a demo directory segment.
 * @param {string} handle Account handle.
 * @returns {string} Validated account handle.
 */
function validateAccountHandle(handle) {
    const normalized = String(handle ?? '').trim();
    if (!normalized || normalized === '.' || normalized === '..' || /[\\/]/.test(normalized)) {
        throw new TypeError('Invalid account handle for demo storage');
    }
    return normalized;
}

/**
 * Get the logical storage handle for an account's demo space.
 * @param {string} accountHandle Real account handle.
 * @returns {string} Demo storage handle.
 */
export function getLeslieDemoStorageHandle(accountHandle) {
    const handle = validateAccountHandle(accountHandle);
    if (handle.startsWith(LESLIE_DEMO_STORAGE_PREFIX)) {
        throw new TypeError('Nested demo storage handles are not allowed');
    }
    return `${LESLIE_DEMO_STORAGE_PREFIX}${handle}`;
}

/**
 * Check whether a logical handle identifies Leslie demo storage.
 * @param {string} handle Logical storage handle.
 * @returns {boolean} Whether the handle belongs to demo storage.
 */
export function isLeslieDemoStorageHandle(handle) {
    return typeof handle === 'string' && handle.startsWith(LESLIE_DEMO_STORAGE_PREFIX);
}

/**
 * Resolve a logical storage handle to a data-root path.
 * @param {string} dataRoot Application data root.
 * @param {string} storageHandle Logical storage handle.
 * @returns {string} Absolute storage root.
 */
export function resolveLeslieStorageRoot(dataRoot, storageHandle) {
    if (!isLeslieDemoStorageHandle(storageHandle)) {
        return path.join(dataRoot, validateAccountHandle(storageHandle));
    }

    const accountHandle = validateAccountHandle(storageHandle.slice(LESLIE_DEMO_STORAGE_PREFIX.length));
    return path.join(dataRoot, LESLIE_DEMO_DIRECTORY, accountHandle);
}

/**
 * Resolve the storage identity for the current session without changing the
 * authenticated account profile.
 * @param {object | undefined | null} session Cookie session state.
 * @param {string} accountHandle Authenticated account handle.
 * @returns {{demoMode: boolean, storageHandle: string}} Storage selection.
 */
export function resolveLeslieSessionStorage(session, accountHandle) {
    const handle = validateAccountHandle(accountHandle);
    const demoMode = session?.[LESLIE_DEMO_SESSION_KEY] === true;
    return {
        demoMode,
        storageHandle: demoMode ? getLeslieDemoStorageHandle(handle) : handle,
    };
}
