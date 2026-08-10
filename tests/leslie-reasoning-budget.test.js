/* eslint-disable playwright/no-standalone-expect */
import { describe, expect, test } from '@jest/globals';

import {
    DEEPSEEK_MAX_THINKING_OUTPUT_FLOOR,
    DEEPSEEK_THINKING_OUTPUT_FLOOR,
    getReasoningSafeTokenBudget,
} from '../public/scripts/leslie-reasoning-budget.js';

describe('Leslie reasoning-safe token budget', () => {
    test.each([180, 360, 500, 1500])('protects every reply-style length while DeepSeek thinking is enabled (%i)', (outputTokens) => {
        const budget = getReasoningSafeTokenBudget({
            chatCompletionSource: 'deepseek',
            showThoughts: true,
            reasoningEffort: 'auto',
            contextTokens: 32_768,
            outputTokens,
        });

        expect(budget).toEqual({
            contextTokens: 65_536,
            outputTokens: DEEPSEEK_THINKING_OUTPUT_FLOOR,
            protected: true,
        });
    });

    test('reserves a larger allowance for maximum reasoning effort', () => {
        const budget = getReasoningSafeTokenBudget({
            chatCompletionSource: 'deepseek',
            showThoughts: true,
            reasoningEffort: 'max',
            contextTokens: 65_536,
            outputTokens: 1500,
        });

        expect(budget.contextTokens).toBe(131_072);
        expect(budget.outputTokens).toBe(DEEPSEEK_MAX_THINKING_OUTPUT_FLOOR);
        expect(budget.protected).toBe(true);
    });

    test('does not change saved limits when thinking is disabled', () => {
        expect(getReasoningSafeTokenBudget({
            chatCompletionSource: 'deepseek',
            showThoughts: false,
            reasoningEffort: 'auto',
            contextTokens: 8192,
            outputTokens: 180,
        })).toEqual({ contextTokens: 8192, outputTokens: 180, protected: false });
    });

    test('does not alter other providers', () => {
        expect(getReasoningSafeTokenBudget({
            chatCompletionSource: 'custom',
            showThoughts: true,
            reasoningEffort: 'max',
            contextTokens: 4096,
            outputTokens: 256,
        })).toEqual({ contextTokens: 4096, outputTokens: 256, protected: false });
    });
});
