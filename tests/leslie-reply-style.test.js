/* eslint-disable playwright/no-standalone-expect */
import { afterEach, describe, expect, test } from '@jest/globals';

import {
    buildLeslieReplyStylePrompt,
    DEFAULT_LESLIE_REPLY_STYLE_SETTINGS,
    isLeslieProviderControlledOutput,
    migrateLeslieReplyStyleSettings,
    normalizeLeslieReplyStyleSettings,
    setLeslieReplyStyleRuntimeSettings,
    shouldDeferLeslieContinuationToUser,
} from '../public/scripts/leslie-reply-style.js';
import {
    DEEPSEEK_PROVIDER_MAX_THINKING_OUTPUT_DEFAULT,
    DEEPSEEK_PROVIDER_OUTPUT_DEFAULT,
    DEEPSEEK_PROVIDER_THINKING_OUTPUT_DEFAULT,
    getGenerationTokenBudget,
} from '../public/scripts/leslie-reasoning-budget.js';

afterEach(() => {
    setLeslieReplyStyleRuntimeSettings(DEFAULT_LESLIE_REPLY_STYLE_SETTINGS, { active: false });
});

describe('Leslie semantic reply styles', () => {
    test.each(['balanced', 'novel', 'dialogue', 'concise'])('builds a qualitative %s prompt without a fixed length', (style) => {
        const prompt = buildLeslieReplyStylePrompt(style);

        expect(prompt).toContain('presentation only');
        expect(prompt).toContain('Do not target a fixed word count or token count.');
        expect(prompt).not.toMatch(/\b(180|360|500|1500)\b/);
    });

    test('supports a fail-open mode with no prompt injection', () => {
        expect(buildLeslieReplyStylePrompt('off')).toBe('');
    });

    test('normalizes malformed persisted settings', () => {
        expect(normalizeLeslieReplyStyleSettings({ style: 'unknown', outputPolicy: 'unknown' })).toEqual({
            schemaVersion: 1,
            style: 'balanced',
            outputPolicy: 'provider',
        });
    });

    test.each([
        [180, 'concise'],
        [360, 'dialogue'],
        [500, 'balanced'],
        [1500, 'novel'],
    ])('migrates legacy output preset %i to %s', (legacyOutputTokens, style) => {
        expect(migrateLeslieReplyStyleSettings(undefined, { legacyOutputTokens })).toEqual({
            schemaVersion: 1,
            style,
            outputPolicy: 'provider',
        });
    });
});

describe('Leslie provider-controlled output', () => {
    test('only activates for foreground DeepSeek generations while the extension is active', () => {
        setLeslieReplyStyleRuntimeSettings(DEFAULT_LESLIE_REPLY_STYLE_SETTINGS, { active: true });

        expect(isLeslieProviderControlledOutput({ chatCompletionSource: 'deepseek', type: 'normal' })).toBe(true);
        expect(isLeslieProviderControlledOutput({ chatCompletionSource: 'deepseek', type: 'quiet' })).toBe(false);
        expect(isLeslieProviderControlledOutput({ chatCompletionSource: 'claude', type: 'normal' })).toBe(false);
    });

    test('restores the explicit request limit when the extension is inactive', () => {
        setLeslieReplyStyleRuntimeSettings(DEFAULT_LESLIE_REPLY_STYLE_SETTINGS, { active: false });

        const budget = getGenerationTokenBudget({
            chatCompletionSource: 'deepseek',
            showThoughts: false,
            reasoningEffort: 'auto',
            contextTokens: 8192,
            outputTokens: 300,
            type: 'normal',
        });

        expect(budget.providerControlled).toBe(false);
        expect(budget.requestOutputTokens).toBe(300);
    });

    test.each([
        [false, 'auto', DEEPSEEK_PROVIDER_OUTPUT_DEFAULT],
        [true, 'auto', DEEPSEEK_PROVIDER_THINKING_OUTPUT_DEFAULT],
        [true, 'max', DEEPSEEK_PROVIDER_MAX_THINKING_OUTPUT_DEFAULT],
    ])('omits the request cap while reserving DeepSeek provider output (thinking=%s, effort=%s)', (showThoughts, reasoningEffort, expectedReservation) => {
        setLeslieReplyStyleRuntimeSettings(DEFAULT_LESLIE_REPLY_STYLE_SETTINGS, { active: true });

        const budget = getGenerationTokenBudget({
            chatCompletionSource: 'deepseek',
            showThoughts,
            reasoningEffort,
            contextTokens: 4096,
            outputTokens: 300,
            type: 'normal',
        });

        expect(budget.providerControlled).toBe(true);
        expect(budget.requestOutputTokens).toBeUndefined();
        expect(budget.outputTokens).toBe(expectedReservation);
        expect(budget.contextTokens).toBeGreaterThan(budget.outputTokens);
    });

    test('keeps explicit limits for quiet jobs and unsupported providers', () => {
        setLeslieReplyStyleRuntimeSettings(DEFAULT_LESLIE_REPLY_STYLE_SETTINGS, { active: true });

        const quiet = getGenerationTokenBudget({
            chatCompletionSource: 'deepseek',
            showThoughts: false,
            reasoningEffort: 'auto',
            contextTokens: 8192,
            outputTokens: 300,
            type: 'quiet',
        });
        const claude = getGenerationTokenBudget({
            chatCompletionSource: 'claude',
            showThoughts: false,
            reasoningEffort: 'auto',
            contextTokens: 8192,
            outputTokens: 300,
            type: 'normal',
        });

        expect(quiet.requestOutputTokens).toBe(300);
        expect(quiet.providerControlled).toBe(false);
        expect(claude.requestOutputTokens).toBe(300);
        expect(claude.providerControlled).toBe(false);
    });

    test('leaves provider-truncated foreground replies for explicit user continuation', () => {
        setLeslieReplyStyleRuntimeSettings(DEFAULT_LESLIE_REPLY_STYLE_SETTINGS, { active: true });

        expect(shouldDeferLeslieContinuationToUser({
            finishReason: 'length',
            chatCompletionSource: 'deepseek',
            type: 'normal',
        })).toBe(true);
        expect(shouldDeferLeslieContinuationToUser({
            finishReason: 'stop',
            chatCompletionSource: 'deepseek',
            type: 'normal',
        })).toBe(false);
    });
});
