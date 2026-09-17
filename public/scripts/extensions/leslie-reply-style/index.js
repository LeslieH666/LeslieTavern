import {
    extension_prompt_roles,
    extension_prompt_types,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '../../../script.js';
import { extension_settings } from '../../extensions.js';
import {
    buildLeslieReplyStylePrompt,
    LESLIE_REPLY_STYLE_SETTINGS_KEY,
    migrateLeslieReplyStyleSettings,
    setLeslieReplyStyleRuntimeSettings,
} from '../../leslie-reply-style.js';

const PROMPT_KEY = 'leslie_reply_style';

function clearPromptInjection() {
    setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
}

function getLegacyOutputTokenSetting() {
    const sourceId = document.getElementById('main_api')?.value === 'openai'
        ? 'openai_max_tokens'
        : 'amount_gen';
    return document.getElementById(sourceId)?.value;
}

function synchronizeSettings({ save = false } = {}) {
    const previous = extension_settings[LESLIE_REPLY_STYLE_SETTINGS_KEY];
    const normalized = migrateLeslieReplyStyleSettings(previous, {
        legacyOutputTokens: getLegacyOutputTokenSetting(),
    });
    extension_settings[LESLIE_REPLY_STYLE_SETTINGS_KEY] = normalized;
    setLeslieReplyStyleRuntimeSettings(normalized, { active: true });
    if (save && JSON.stringify(previous) !== JSON.stringify(normalized)) {
        saveSettingsDebounced();
    }
    return normalized;
}

/**
 * Inject the selected presentation mode into foreground character replies.
 * @param {unknown[]} _chat Current chat messages.
 * @param {number} _contextSize Available prompt context.
 * @param {(immediately?: boolean) => void} _abort Generation abort callback.
 * @param {string} type Generation type.
 */
export async function preparePrompt(_chat, _contextSize, _abort, type) {
    clearPromptInjection();
    const settings = synchronizeSettings();
    if (['quiet', 'impersonate'].includes(type) || settings.style === 'off') {
        return;
    }

    try {
        const prompt = buildLeslieReplyStylePrompt(settings.style);
        setExtensionPrompt(PROMPT_KEY, prompt, extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
    } catch (error) {
        clearPromptInjection();
        console.warn('[Leslie Reply Style] Prompt preparation failed.', error);
    }
}

globalThis.LeslieReplyStylePreparePrompt = preparePrompt;

export async function init() {
    synchronizeSettings({ save: true });
    clearPromptInjection();
}
