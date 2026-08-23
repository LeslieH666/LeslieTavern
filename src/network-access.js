import os from 'node:os';
import ipaddr from 'ipaddr.js';

const DIRECT_NETWORK_RANGES = new Set(['private', 'linkLocal', 'uniqueLocal']);

/**
 * Normalizes a socket address for comparison with network interface addresses.
 * @param {string} address IP address.
 * @returns {ipaddr.IPv4 | ipaddr.IPv6 | null} Parsed address, or null when invalid.
 */
function parseAddress(address) {
    if (typeof address !== 'string') {
        return null;
    }

    try {
        const parsed = ipaddr.parse(address.replace(/%[^%]+$/, ''));
        if (parsed.kind() === 'ipv6' && parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
            return parsed.toIPv4Address();
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Tests whether the client is on the same directly connected private subnet as the address it used to reach the server.
 * @param {string} clientAddress Remote socket address.
 * @param {string} localAddress Local socket address.
 * @param {NodeJS.Dict<os.NetworkInterfaceInfo[]>} [interfaces] Network interface information.
 * @returns {boolean} Whether the request is from the directly connected private subnet.
 */
export function isDirectPrivateNetworkRequest(clientAddress, localAddress, interfaces = os.networkInterfaces()) {
    const client = parseAddress(clientAddress);
    const local = parseAddress(localAddress);
    if (!client || !local || client.kind() !== local.kind()) {
        return false;
    }
    if (!DIRECT_NETWORK_RANGES.has(client.range()) || !DIRECT_NETWORK_RANGES.has(local.range())) {
        return false;
    }

    for (const addresses of Object.values(interfaces)) {
        if (!Array.isArray(addresses)) {
            continue;
        }

        for (const interfaceAddress of addresses) {
            if (!interfaceAddress || interfaceAddress.internal || !interfaceAddress.cidr) {
                continue;
            }

            const candidate = parseAddress(interfaceAddress.address);
            if (!candidate || candidate.kind() !== local.kind() || candidate.toString() !== local.toString()) {
                continue;
            }

            try {
                return client.match(ipaddr.parseCIDR(interfaceAddress.cidr));
            } catch {
                return false;
            }
        }
    }

    return false;
}
