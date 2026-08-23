import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { looksLikeElectronUserData, migrateLegacyModelCache } from '../src/transformers-cache.js';

const temporaryDirectories = [];

function makeTemporaryDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-transformers-cache-'));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

describe('Transformers legacy cache migration', () => {
    test('recognizes Electron user data only when multiple strong markers exist', () => {
        expect(looksLikeElectronUserData(['Xenova', 'GPUCache'])).toBe(false);
        expect(looksLikeElectronUserData(['GPUCache', 'Local Storage'])).toBe(true);
    });

    test('does not copy or remove a live Electron user-data directory', () => {
        const root = makeTemporaryDirectory();
        const oldCacheDir = path.join(root, 'cache');
        const newCacheDir = path.join(root, 'data', '_cache');
        fs.mkdirSync(path.join(oldCacheDir, 'GPUCache'), { recursive: true });
        fs.mkdirSync(path.join(oldCacheDir, 'Local Storage'), { recursive: true });
        fs.writeFileSync(path.join(oldCacheDir, 'lockfile'), 'in-use');
        const logger = { info: jest.fn(), warn: jest.fn() };

        const result = migrateLegacyModelCache({ oldCacheDir, newCacheDir, logger });

        expect(result).toEqual({ migrated: 0, skippedElectronData: true });
        expect(fs.existsSync(path.join(oldCacheDir, 'lockfile'))).toBe(true);
        expect(fs.existsSync(newCacheDir)).toBe(false);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('moves a genuine legacy model cache into DATA_ROOT', () => {
        const root = makeTemporaryDirectory();
        const oldCacheDir = path.join(root, 'cache');
        const newCacheDir = path.join(root, 'data', '_cache');
        fs.mkdirSync(path.join(oldCacheDir, 'Xenova', 'whisper-small'), { recursive: true });
        fs.writeFileSync(path.join(oldCacheDir, 'Xenova', 'whisper-small', 'model.onnx'), 'model');

        const result = migrateLegacyModelCache({ oldCacheDir, newCacheDir });

        expect(result).toEqual({ migrated: 1, skippedElectronData: false });
        expect(fs.readFileSync(path.join(newCacheDir, 'Xenova', 'whisper-small', 'model.onnx'), 'utf8')).toBe('model');
        expect(fs.existsSync(path.join(oldCacheDir, 'Xenova'))).toBe(false);
    });
});
