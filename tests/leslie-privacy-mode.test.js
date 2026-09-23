import { describe, expect, jest, test } from '@jest/globals';

import {
    DEFAULT_LESLIE_PRIVACY_MODE_STATE,
    LESLIE_PRIVACY_MODE_STORAGE_KEY,
    normalizeLesliePrivacyModeState,
    readLesliePrivacyModeState,
    writeLesliePrivacyModeState,
} from '../public/scripts/leslie-privacy-mode-core.js';

describe('Leslie privacy mode preference', () => {
    test('starts disabled with the private chat regions selected', () => {
        expect(normalizeLesliePrivacyModeState()).toEqual(DEFAULT_LESLIE_PRIVACY_MODE_STATE);
        expect(DEFAULT_LESLIE_PRIVACY_MODE_STATE.blocks).toEqual({
            conversations: true,
            header: true,
            messages: true,
            composer: true,
            connection: false,
        });
    });

    test('migrates partial stored preferences and ignores unknown values', () => {
        expect(normalizeLesliePrivacyModeState({
            enabled: true,
            blocks: {
                messages: false,
                composer: 'yes',
                future: true,
            },
        })).toEqual({
            enabled: true,
            blocks: {
                conversations: true,
                header: true,
                messages: false,
                composer: true,
                connection: false,
            },
        });
    });

    test('fails open when storage is unavailable or malformed', () => {
        const deniedStorage = { getItem: () => { throw new Error('denied'); } };
        const malformedStorage = { getItem: () => '{not-json' };
        expect(readLesliePrivacyModeState(deniedStorage).enabled).toBe(false);
        expect(readLesliePrivacyModeState(malformedStorage).enabled).toBe(false);
    });

    test('persists only the normalized versioned preference', () => {
        const setItem = jest.fn();
        const stored = writeLesliePrivacyModeState({ setItem }, {
            enabled: true,
            blocks: { messages: false },
        });
        expect(stored.enabled).toBe(true);
        expect(setItem).toHaveBeenCalledWith(LESLIE_PRIVACY_MODE_STORAGE_KEY, JSON.stringify(stored));
    });
});
