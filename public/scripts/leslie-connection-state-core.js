/**
 * Normalize SillyTavern's loosely typed online status for Leslie's UI.
 * This stays dependency-free so startup edge cases can be unit tested.
 */

const ERROR_STATUS_PATTERN = /invalid|error|failed|failure|missing|not connected|disconnected|offline|unavailable|unauthorized|forbidden|timed?\s*out|无效|错误|失败|缺少|未连接|离线|不可用|未授权|禁止|超时/i;

/**
 * @param {unknown} onlineStatus Raw SillyTavern connection status.
 * @param {object} options Classification context.
 * @param {boolean} options.configured Whether enough API configuration is saved.
 * @param {boolean} options.settingsReady Whether application settings finished loading.
 * @param {boolean} options.checking Whether an API status request is currently running.
 * @param {string[]} [options.unverifiedStatuses] Known translated statuses that are not proof of a working connection.
 * @returns {{ connected: boolean, configured: boolean, checking: boolean, state: 'checking' | 'connected' | 'configured' | 'unconfigured' }} Normalized state.
 */
export function classifyLeslieConnectionState(onlineStatus, {
    configured,
    settingsReady,
    checking,
    unverifiedStatuses = [],
}) {
    if (!settingsReady || checking) {
        return {
            connected: false,
            configured,
            checking: true,
            state: 'checking',
        };
    }

    const status = typeof onlineStatus === 'string' ? onlineStatus.trim() : '';
    const isUnverified = !status
        || status === 'no_connection'
        || unverifiedStatuses.includes(status)
        || ERROR_STATUS_PATTERN.test(status);
    const connected = !isUnverified;

    return {
        connected,
        configured: connected || configured,
        checking: false,
        state: connected ? 'connected' : configured ? 'configured' : 'unconfigured',
    };
}
