import { describe, expect, test } from '@jest/globals';

import { classifyLeslieConnectionState } from '../public/scripts/leslie-connection-state-core.js';

const ready = {
    configured: true,
    settingsReady: true,
    checking: false,
    unverifiedStatuses: [
        'Status check bypassed',
        'Key saved; press "Test Message" to verify.',
    ],
};

describe('Leslie connection state', () => {
    test('does not report a connection before settings finish loading', () => {
        expect(classifyLeslieConnectionState('Valid', { ...ready, settingsReady: false })).toEqual({
            connected: false,
            configured: true,
            checking: true,
            state: 'checking',
        });
    });

    test('keeps the UI pending while a new status request is running', () => {
        expect(classifyLeslieConnectionState('Valid', { ...ready, checking: true }).state).toBe('checking');
    });

    test('accepts a verified provider status or model name', () => {
        expect(classifyLeslieConnectionState('Valid', ready).state).toBe('connected');
        expect(classifyLeslieConnectionState('deepseek-v4-flash', ready).connected).toBe(true);
    });

    test('does not mistake invalid or bypassed checks for a verified connection', () => {
        expect(classifyLeslieConnectionState('Invalid endpoint URL. Requests may fail.', ready).state).toBe('configured');
        expect(classifyLeslieConnectionState('Status check bypassed', ready).state).toBe('configured');
        expect(classifyLeslieConnectionState('连接失败', ready).connected).toBe(false);
    });

    test('distinguishes saved configuration from a completely unconfigured API', () => {
        expect(classifyLeslieConnectionState('no_connection', ready).state).toBe('configured');
        expect(classifyLeslieConnectionState('no_connection', { ...ready, configured: false }).state).toBe('unconfigured');
    });
});
