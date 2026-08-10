/**
 * Shared connection-state adapter for Leslie's presentation layer.
 *
 * SillyTavern remains the source of truth. This module only translates its
 * live connection state and saved configuration into four user-facing states.
 */

import { main_api, online_status, settings } from '../script.js';
import { t } from './i18n.js';
import { resolveSecretKey, secret_state } from './secrets.js';
import { getTextGenServer } from './textgen-settings.js';
import { classifyLeslieConnectionState } from './leslie-connection-state-core.js';

/**
 * Check whether SillyTavern reports a saved value for a secret slot.
 * @param {string | null} key Secret key resolved by SillyTavern.
 * @returns {boolean} Whether at least one value is saved.
 */
function hasStoredSecret(key) {
    if (!key) {
        return false;
    }
    const value = secret_state[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/**
 * Read a trimmed value from an existing SillyTavern input.
 * @param {string} id Element id.
 * @returns {string} Current value.
 */
function getInputValue(id) {
    const element = document.getElementById(id);
    return element instanceof HTMLInputElement || element instanceof HTMLSelectElement
        ? element.value.trim()
        : '';
}

/**
 * Determine whether the currently selected API has enough saved information
 * to be recognizable as configured, even when it is not connected yet.
 * @returns {boolean} Whether a configuration is present.
 */
function hasCurrentConfiguration() {
    try {
        const secretKey = resolveSecretKey();
        if (hasStoredSecret(secretKey) || (secretKey && getInputValue(secretKey))) {
            return true;
        }
    } catch {
        // The original settings context can still be loading during startup.
    }

    if (main_api === 'textgenerationwebui') {
        return Boolean(getTextGenServer()?.trim());
    }
    if (main_api === 'kobold') {
        return Boolean(getInputValue('api_url_text'));
    }
    if (main_api === 'openai' && getInputValue('chat_completion_source') === 'custom') {
        return Boolean(getInputValue('custom_api_url_text'));
    }
    if (main_api === 'koboldhorde') {
        return true;
    }
    return false;
}

/**
 * Check whether one of SillyTavern's connection probes is visibly running.
 * @returns {boolean} Whether the current connection state is still pending.
 */
function isConnectionCheckPending() {
    return Array.from(document.querySelectorAll('.api_loading')).some((element) => {
        return element instanceof HTMLElement && getComputedStyle(element).display !== 'none';
    });
}

/**
 * Status strings that SillyTavern displays as successful but that do not prove
 * the configured endpoint accepted a real status request.
 * @returns {string[]} Translated status strings.
 */
function getUnverifiedStatuses() {
    return [
        t`Key saved; press "Test Message" to verify.`,
        t`Status check bypassed`,
        t`Invalid endpoint URL. Requests may fail.`,
        t`Invalid Azure endpoint URL. Requests may fail.`,
    ];
}

/**
 * Return Leslie's normalized connection state.
 * @returns {{ connected: boolean, configured: boolean, checking: boolean, state: 'checking' | 'connected' | 'configured' | 'unconfigured' }} Normalized state.
 */
export function getLeslieConnectionState() {
    return classifyLeslieConnectionState(online_status, {
        configured: hasCurrentConfiguration(),
        settingsReady: settings !== undefined,
        checking: isConnectionCheckPending(),
        unverifiedStatuses: getUnverifiedStatuses(),
    });
}
