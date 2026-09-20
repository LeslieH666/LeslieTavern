import { describe, expect, jest, test } from '@jest/globals';

import {
    DEFAULT_DESIGN_LANGUAGE,
    DESIGN_LANGUAGE_PREFERENCE_KEY,
    normalizeDesignLanguage,
    readDesignLanguagePreference,
    writeDesignLanguagePreference,
} from '../public/scripts/leslie-design-language-core.js';

describe('Leslie design language preference', () => {
    test('uses Cupertino for new and unknown preferences', () => {
        expect(normalizeDesignLanguage(null)).toBe(DEFAULT_DESIGN_LANGUAGE);
        expect(normalizeDesignLanguage('future-theme')).toBe(DEFAULT_DESIGN_LANGUAGE);
    });

    test('preserves the explicit classic rollback preference', () => {
        expect(normalizeDesignLanguage('classic')).toBe('classic');
        expect(readDesignLanguagePreference({ getItem: () => 'classic' })).toBe('classic');
    });

    test('fails open when browser storage is unavailable', () => {
        const storage = { getItem: () => { throw new Error('denied'); } };
        expect(readDesignLanguagePreference(storage)).toBe(DEFAULT_DESIGN_LANGUAGE);
    });

    test('persists only normalized values', () => {
        const setItem = jest.fn();
        expect(writeDesignLanguagePreference({ setItem }, 'classic')).toBe('classic');
        expect(setItem).toHaveBeenCalledWith(DESIGN_LANGUAGE_PREFERENCE_KEY, 'classic');

        expect(writeDesignLanguagePreference({ setItem }, 'unsupported')).toBe(DEFAULT_DESIGN_LANGUAGE);
        expect(setItem).toHaveBeenLastCalledWith(DESIGN_LANGUAGE_PREFERENCE_KEY, DEFAULT_DESIGN_LANGUAGE);
    });
});
