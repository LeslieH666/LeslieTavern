/* eslint-disable playwright/no-standalone-expect */
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';

const mockNetworkInterfaces = {
    WiFi: [{
        address: '192.168.31.254',
        family: 'IPv4',
        cidr: '192.168.31.254/24',
        internal: false,
        mac: '00:00:00:00:00:00',
        netmask: '255.255.255.0',
    }],
};

jest.unstable_mockModule('node:os', () => ({
    default: { networkInterfaces: () => mockNetworkInterfaces },
}));

jest.unstable_mockModule('is-docker', () => ({
    default: () => false,
}));

jest.unstable_mockModule('../src/util.js', () => ({
    color: {
        red: value => value,
        yellow: value => value,
        green: value => value,
    },
    getConfigValue: (key, fallback) => ({
        enableForwardedWhitelist: false,
        whitelistDockerHosts: false,
        whitelistDirectPrivateNetworks: true,
        whitelist: ['::1', '127.0.0.1'],
    })[key] ?? fallback,
    safeReadFileSync: () => '',
}));

let middleware;
let consoleWarning;

beforeAll(async () => {
    global.DATA_ROOT = '.';
    const { default: getWhitelistMiddleware } = await import('../src/middleware/whitelist.js');
    middleware = await getWhitelistMiddleware();
    consoleWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
    consoleWarning.mockRestore();
});

function requestFrom(remoteAddress, localAddress = '192.168.31.254') {
    const next = jest.fn();
    const response = {
        send: jest.fn(),
        status: jest.fn(() => response),
    };
    middleware({
        headers: {},
        path: '/',
        socket: { localAddress, remoteAddress },
    }, response, next);
    return { next, response };
}

describe('whitelist middleware LAN behavior', () => {
    test('allows a same-subnet device without an explicit device entry', () => {
        const { next, response } = requestFrom('192.168.31.80');

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    test.each(['192.168.10.80', '10.8.0.20', '8.8.8.8'])('blocks sources outside the connected subnet: %s', (remoteAddress) => {
        const { next, response } = requestFrom(remoteAddress);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    test('keeps explicitly allowlisted loopback access working', () => {
        const { next, response } = requestFrom('127.0.0.1', '127.0.0.1');

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });
});
