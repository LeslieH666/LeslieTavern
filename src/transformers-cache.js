import fs from 'node:fs';
import path from 'node:path';

const ELECTRON_USER_DATA_MARKERS = new Set([
    'DIPS',
    'GPUCache',
    'IndexedDB',
    'Local Storage',
    'Network',
    'Session Storage',
    'SharedStorage',
    'WebStorage',
    'lockfile',
]);

/**
 * Chromium/Electron user data must never be treated as a legacy model cache.
 * Requiring two markers avoids rejecting a real model cache because of one
 * coincidental directory name.
 * @param {string[]} entries Directory entry names.
 * @returns {boolean} Whether the entries identify Electron user data.
 */
export function looksLikeElectronUserData(entries) {
    let matches = 0;
    for (const entry of entries) {
        if (ELECTRON_USER_DATA_MARKERS.has(entry) && ++matches >= 2) {
            return true;
        }
    }
    return false;
}

/**
 * Move the pre-DATA_ROOT Transformers cache once, while leaving an Electron
 * user-data directory alone when the desktop launcher uses `cache/` for it.
 * @param {{oldCacheDir: string, newCacheDir: string, logger?: Console}} options Cache paths.
 * @returns {{migrated: number, skippedElectronData: boolean}} Migration summary.
 */
export function migrateLegacyModelCache({ oldCacheDir, newCacheDir, logger = console }) {
    if (!fs.existsSync(oldCacheDir)) {
        return { migrated: 0, skippedElectronData: false };
    }

    let entries;
    try {
        if (!fs.statSync(oldCacheDir).isDirectory()) {
            return { migrated: 0, skippedElectronData: false };
        }
        entries = fs.readdirSync(oldCacheDir);
    } catch (error) {
        logger.warn('Unable to inspect the legacy model cache. Skipping migration.', error);
        return { migrated: 0, skippedElectronData: false };
    }

    if (looksLikeElectronUserData(entries)) {
        logger.info('Skipping legacy model cache migration because cache/ is Electron user data.');
        return { migrated: 0, skippedElectronData: true };
    }
    if (entries.length === 0) {
        return { migrated: 0, skippedElectronData: false };
    }

    fs.mkdirSync(newCacheDir, { recursive: true });
    logger.info('Migrating model cache files to data directory. Please wait...');
    let migrated = 0;

    for (const entry of entries) {
        try {
            const oldPath = path.join(oldCacheDir, entry);
            const newPath = path.join(newCacheDir, entry);
            fs.cpSync(oldPath, newPath, { recursive: true, force: true });
            fs.rmSync(oldPath, { recursive: true, force: true });
            migrated++;
        } catch (error) {
            logger.warn('Failed to migrate a model cache entry. The model may be re-downloaded.', error);
        }
    }

    return { migrated, skippedElectronData: false };
}
