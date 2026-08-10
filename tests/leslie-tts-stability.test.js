/* global globalThis */
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { DEFAULT_TTS_SETTLE_DELAY_MS, SettledTtsScheduler } from '../public/scripts/leslie-tts-stability.js';

describe('Leslie settled TTS scheduler', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    test('uses a short default settle window for responsive automatic narration', async () => {
        jest.useFakeTimers();
        const settled = jest.fn();
        const scheduler = new SettledTtsScheduler(settled);

        scheduler.schedule({ messageId: 2 });
        jest.advanceTimersByTime(DEFAULT_TTS_SETTLE_DELAY_MS - 1);
        expect(settled).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        expect(DEFAULT_TTS_SETTLE_DELAY_MS).toBe(120);
        expect(settled).toHaveBeenCalledTimes(1);
    });

    test('speaks only the latest reply render after the settle window', async () => {
        jest.useFakeTimers();
        const settled = jest.fn();
        const scheduler = new SettledTtsScheduler(settled, { delay: 450 });

        scheduler.schedule({ messageId: 3, text: 'partial' });
        jest.advanceTimersByTime(300);
        scheduler.schedule({ messageId: 3, text: 'complete reply' });
        jest.advanceTimersByTime(449);
        expect(settled).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledTimes(1);
        expect(settled).toHaveBeenCalledWith({ messageId: 3, text: 'complete reply' });
        expect(scheduler.pending).toBe(false);
    });

    test('cancels stale narration on swipe, deletion, or chat changes', async () => {
        jest.useFakeTimers();
        const settled = jest.fn();
        const scheduler = new SettledTtsScheduler(settled, { delay: 450 });

        scheduler.schedule({ messageId: 5 });
        expect(scheduler.pending).toBe(true);
        scheduler.cancel();
        await jest.advanceTimersByTimeAsync(500);

        expect(settled).not.toHaveBeenCalled();
        expect(scheduler.pending).toBe(false);
    });

    test('invokes browser timer functions with the global receiver', async () => {
        const settled = jest.fn();
        const timerId = { id: 1 };
        let scheduledCallback;
        const setTimer = jest.fn(function (callback) {
            if (this !== globalThis) throw new TypeError('Illegal invocation');
            scheduledCallback = callback;
            return timerId;
        });
        const clearTimer = jest.fn(function () {
            if (this !== globalThis) throw new TypeError('Illegal invocation');
        });
        const scheduler = new SettledTtsScheduler(settled, { setTimer, clearTimer });

        scheduler.schedule({ messageId: 8 });
        await scheduledCallback();
        await Promise.resolve();

        expect(setTimer).toHaveBeenCalledTimes(1);
        expect(settled).toHaveBeenCalledWith({ messageId: 8 });
        expect(scheduler.pending).toBe(false);
    });
});
