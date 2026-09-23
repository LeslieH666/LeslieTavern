import path from 'node:path';

import { describe, expect, test } from '@jest/globals';

import {
    LESLIE_DEMO_DIRECTORY,
    LESLIE_DEMO_SESSION_KEY,
    LESLIE_DEMO_STORAGE_PREFIX,
    getLeslieDemoStorageHandle,
    isLeslieDemoStorageHandle,
    resolveLeslieSessionStorage,
    resolveLeslieStorageRoot,
} from '../src/leslie-demo-mode.js';

describe('Leslie demo storage isolation', () => {
    test('uses a reserved logical handle and a nested demo directory', () => {
        const storageHandle = getLeslieDemoStorageHandle('default-user');

        expect(storageHandle).toBe(`${LESLIE_DEMO_STORAGE_PREFIX}default-user`);
        expect(isLeslieDemoStorageHandle(storageHandle)).toBe(true);
        expect(resolveLeslieStorageRoot('D:\\synthetic-data', storageHandle))
            .toBe(path.join('D:\\synthetic-data', LESLIE_DEMO_DIRECTORY, 'default-user'));
    });

    test('keeps regular storage in its existing account directory', () => {
        expect(resolveLeslieStorageRoot('/synthetic-data', 'alice'))
            .toBe(path.join('/synthetic-data', 'alice'));
    });

    test('enables demo storage only for an explicit boolean session flag', () => {
        expect(resolveLeslieSessionStorage({}, 'alice')).toEqual({
            demoMode: false,
            storageHandle: 'alice',
        });
        expect(resolveLeslieSessionStorage({ [LESLIE_DEMO_SESSION_KEY]: 'true' }, 'alice').demoMode).toBe(false);
        expect(resolveLeslieSessionStorage({ [LESLIE_DEMO_SESSION_KEY]: true }, 'alice')).toEqual({
            demoMode: true,
            storageHandle: `${LESLIE_DEMO_STORAGE_PREFIX}alice`,
        });
    });

    test('rejects traversal and nested demo handles', () => {
        expect(() => getLeslieDemoStorageHandle('../alice')).toThrow(TypeError);
        expect(() => getLeslieDemoStorageHandle('folder/alice')).toThrow(TypeError);
        expect(() => getLeslieDemoStorageHandle(`${LESLIE_DEMO_STORAGE_PREFIX}alice`)).toThrow(TypeError);
    });
});
