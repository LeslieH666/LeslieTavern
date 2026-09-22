import { describe, expect, test } from '@jest/globals';

import { isTrackedProcessRunning } from '../src/electron/local-services.js';

describe('Leslie desktop local service process tracking', () => {
    test('accepts a live tracked process without terminating it', () => {
        const calls = [];
        const running = isTrackedProcessRunning(4321, (pid, signal) => calls.push([pid, signal]));

        expect(running).toBe(true);
        expect(calls).toEqual([[4321, 0]]);
    });

    test('treats missing or invalid process ids as stopped', () => {
        const missing = Object.assign(new Error('missing'), { code: 'ESRCH' });
        expect(isTrackedProcessRunning(4321, () => { throw missing; })).toBe(false);
        expect(isTrackedProcessRunning('not-a-pid', () => {})).toBe(false);
    });

    test('treats access-denied process probes as running', () => {
        const denied = Object.assign(new Error('denied'), { code: 'EPERM' });
        expect(isTrackedProcessRunning(4321, () => { throw denied; })).toBe(true);
    });
});
