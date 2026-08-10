/* eslint-disable playwright/no-standalone-expect */
import { describe, expect, test } from '@jest/globals';

import { getLengthContinuationDecision, LESLIE_LENGTH_CONTINUATION_LIMIT } from '../public/scripts/leslie-length-continuation.js';

const ready = {
    finishReason: 'length',
    messageChunk: '这是一段尚未完成的角色回复。',
    isImpersonate: false,
    isSending: false,
    isAborted: false,
    hasPendingInput: false,
    isGroup: false,
    attempts: 0,
};

describe('Leslie length-limited continuation', () => {
    test('continues a usable reply that explicitly stopped because of length', () => {
        expect(getLengthContinuationDecision(ready)).toBe('continue');
    });

    test('does not interfere with a naturally completed response', () => {
        expect(getLengthContinuationDecision({ ...ready, finishReason: 'stop' })).toBe('not-length-limited');
    });

    test.each([
        ['empty output', { messageChunk: '' }],
        ['impersonation', { isImpersonate: true }],
        ['another send', { isSending: true }],
        ['an aborted request', { isAborted: true }],
        ['pending user input', { hasPendingInput: true }],
        ['group chat', { isGroup: true }],
    ])('blocks automatic continuation for %s', (_label, state) => {
        expect(getLengthContinuationDecision({ ...ready, ...state })).toBe('blocked');
    });

    test('stops after the bounded retry limit instead of looping forever', () => {
        expect(getLengthContinuationDecision({
            ...ready,
            attempts: LESLIE_LENGTH_CONTINUATION_LIMIT,
        })).toBe('limit-reached');
    });
});
