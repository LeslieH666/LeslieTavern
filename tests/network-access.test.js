/* eslint-disable playwright/no-standalone-expect */
import { describe, expect, test } from '@jest/globals';
import { isDirectPrivateNetworkRequest } from '../src/network-access.js';

function networkAddress(address, family, cidr, internal = false) {
    return {
        address,
        family,
        cidr,
        internal,
        mac: '00:00:00:00:00:00',
        netmask: family === 'IPv4' ? '255.255.255.0' : 'ffff:ffff:ffff:ffff::',
    };
}

describe('direct private network access', () => {
    const interfaces = {
        WiFi: [
            networkAddress('192.168.31.254', 'IPv4', '192.168.31.254/24'),
            networkAddress('fd12:3456:789a::10', 'IPv6', 'fd12:3456:789a::10/64'),
            networkAddress('fe80::f827', 'IPv6', 'fe80::f827/64'),
        ],
        VPN: [networkAddress('10.8.0.2', 'IPv4', '10.8.0.2/24')],
        Loopback: [networkAddress('127.0.0.1', 'IPv4', '127.0.0.1/8', true)],
    };

    test.each([
        ['192.168.31.20', '192.168.31.254'],
        ['fd12:3456:789a::20', 'fd12:3456:789a::10'],
        ['fe80::20%13', 'fe80::f827%13'],
    ])('allows a peer on the private subnet used for the connection: %s', (client, local) => {
        expect(isDirectPrivateNetworkRequest(client, local, interfaces)).toBe(true);
    });

    test('follows a Wi-Fi change without retaining the previous subnet', () => {
        const changedInterfaces = {
            WiFi: [networkAddress('172.20.10.4', 'IPv4', '172.20.10.4/28')],
        };

        expect(isDirectPrivateNetworkRequest('172.20.10.8', '172.20.10.4', changedInterfaces)).toBe(true);
        expect(isDirectPrivateNetworkRequest('192.168.31.20', '172.20.10.4', changedInterfaces)).toBe(false);
    });

    test.each([
        ['192.168.30.20', '192.168.31.254'],
        ['10.8.0.20', '192.168.31.254'],
        ['8.8.8.8', '192.168.31.254'],
        ['2001:4860:4860::8888', 'fd12:3456:789a::10'],
    ])('rejects routed, unrelated private, and public sources: %s', (client, local) => {
        expect(isDirectPrivateNetworkRequest(client, local, interfaces)).toBe(false);
    });

    test('does not trust globally routed IPv6 even when the prefix matches', () => {
        const globalInterfaces = {
            WiFi: [networkAddress('2409:8a50:493:5200::10', 'IPv6', '2409:8a50:493:5200::10/64')],
        };

        expect(isDirectPrivateNetworkRequest(
            '2409:8a50:493:5200::20',
            '2409:8a50:493:5200::10',
            globalInterfaces,
        )).toBe(false);
    });
});
