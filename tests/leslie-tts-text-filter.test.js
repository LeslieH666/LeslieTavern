import { describe, expect, test } from '@jest/globals';

import { stripParentheticalText } from '../public/scripts/leslie-tts-text-filter.js';

describe('Leslie TTS parenthetical text filter', () => {
    test('keeps dialogue outside Chinese action parentheses', () => {
        expect(stripParentheticalText('（正往田野边散步呢，看着你光着脚就急忙赶了上来）夸，你怎么来了？'))
            .toBe('夸，你怎么来了？');
    });

    test('supports ASCII parentheses and multiple action blocks', () => {
        expect(stripParentheticalText('(sits down) Where are you going? (looks back) Come home early.'))
            .toBe('Where are you going? Come home early.');
    });

    test('removes nested and mixed-width parentheses as a single block', () => {
        expect(stripParentheticalText('先等等（抱紧玩偶 (小声叹气) 不肯松手）然后告诉我。'))
            .toBe('先等等 然后告诉我。');
    });

    test('treats the remainder after an unclosed opening parenthesis as an action note', () => {
        expect(stripParentheticalText('这句话会读（后面是不完整的动作描写')).toBe('这句话会读');
    });

    test('leaves ordinary dialogue unchanged', () => {
        expect(stripParentheticalText('没有动作括号的普通对话。')).toBe('没有动作括号的普通对话。');
    });
});
