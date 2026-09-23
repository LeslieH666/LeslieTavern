import {
    LESLIE_PRIVACY_BLOCKS,
    LESLIE_PRIVACY_MODE_STORAGE_KEY,
    readLesliePrivacyModeState,
    writeLesliePrivacyModeState,
} from './leslie-privacy-mode-core.js';

const QUICK_COPY = {
    zh: {
        enable: '开启隐私模式',
        disable: '关闭隐私模式',
    },
    en: {
        enable: 'Turn on privacy mode',
        disable: 'Turn off privacy mode',
    },
};

let privacyState = readLesliePrivacyModeState();
let quickButtonObserver;

function getLocale() {
    let savedLanguage = '';
    try {
        savedLanguage = localStorage.getItem('language') || '';
    } catch {
        // Browser storage can be unavailable in hardened or sandboxed views.
    }
    const language = savedLanguage || document.documentElement.lang || navigator.language || 'en';
    return String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function clonePrivacyState() {
    return {
        enabled: privacyState.enabled,
        blocks: { ...privacyState.blocks },
    };
}

/** Synchronize the body attributes and every rendered privacy control. */
export function applyLesliePrivacyModeState() {
    const body = document.body;
    if (!body) {
        return;
    }

    body.classList.toggle('leslie-privacy-mode', privacyState.enabled);
    body.dataset.lesliePrivacyMode = privacyState.enabled ? 'active' : 'inactive';
    for (const { id } of LESLIE_PRIVACY_BLOCKS) {
        const masked = privacyState.enabled && privacyState.blocks[id];
        body.dataset[`lesliePrivacy${id[0].toUpperCase()}${id.slice(1)}`] = masked ? 'masked' : 'visible';
    }

    syncLesliePrivacyModeControls();
    document.dispatchEvent(new CustomEvent('leslie:privacy-mode-changed', { detail: clonePrivacyState() }));
}

/**
 * Keep settings fields, preview blocks, and quick buttons in sync.
 * @param {ParentNode} [root] Optional rendered subtree.
 */
export function syncLesliePrivacyModeControls(root = document) {
    const copy = QUICK_COPY[getLocale()];
    root.querySelectorAll('[data-leslie-privacy-master]').forEach((control) => {
        if (control instanceof HTMLInputElement) {
            control.checked = privacyState.enabled;
        }
    });
    root.querySelectorAll('[data-leslie-privacy-block]').forEach((control) => {
        if (control instanceof HTMLInputElement) {
            control.checked = privacyState.blocks[control.dataset.lesliePrivacyBlock] === true;
        }
    });
    root.querySelectorAll('[data-leslie-privacy-preview]').forEach((preview) => {
        preview.classList.toggle('is-masked', privacyState.blocks[preview.dataset.lesliePrivacyPreview] === true);
    });
    document.querySelectorAll('[data-leslie-privacy-quick-toggle]').forEach((button) => {
        const title = privacyState.enabled ? copy.disable : copy.enable;
        button.classList.toggle('is-active', privacyState.enabled);
        button.setAttribute('aria-pressed', String(privacyState.enabled));
        button.setAttribute('aria-label', title);
        button.setAttribute('title', title);
        const icon = button.querySelector('i');
        icon?.classList.toggle('fa-eye', privacyState.enabled);
        icon?.classList.toggle('fa-eye-slash', !privacyState.enabled);
    });
}

/** @returns {{enabled: boolean, blocks: Record<string, boolean>}} Current preference. */
export function getLesliePrivacyModeState() {
    return clonePrivacyState();
}

/** @param {boolean} enabled Whether the privacy mask is active. */
export function setLesliePrivacyModeEnabled(enabled) {
    privacyState = writeLesliePrivacyModeState(undefined, {
        ...privacyState,
        enabled: Boolean(enabled),
    });
    applyLesliePrivacyModeState();
}

/**
 * @param {string} blockId Stable UI block id.
 * @param {boolean} masked Whether the block should be blurred while active.
 */
export function setLesliePrivacyBlockMasked(blockId, masked) {
    if (!LESLIE_PRIVACY_BLOCKS.some(({ id }) => id === blockId)) {
        return;
    }
    privacyState = writeLesliePrivacyModeState(undefined, {
        ...privacyState,
        blocks: {
            ...privacyState.blocks,
            [blockId]: Boolean(masked),
        },
    });
    applyLesliePrivacyModeState();
}

export function toggleLesliePrivacyMode() {
    setLesliePrivacyModeEnabled(!privacyState.enabled);
}

function createQuickButton(location) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'leslie-icon-button leslie-privacy-quick-toggle';
    button.dataset.lesliePrivacyQuickToggle = location;
    button.innerHTML = '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>';
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleLesliePrivacyMode();
    });
    return button;
}

function ensureQuickButtons() {
    const locations = [
        ['.leslie-sidebar-actions', 'sidebar'],
        ['#leslie-chat-actions', 'header'],
    ];
    for (const [selector, location] of locations) {
        const host = document.querySelector(selector);
        if (host && !host.querySelector(`[data-leslie-privacy-quick-toggle="${location}"]`)) {
            host.prepend(createQuickButton(location));
        }
    }
    syncLesliePrivacyModeControls();

    if (locations.every(([selector, location]) => document.querySelector(`${selector} [data-leslie-privacy-quick-toggle="${location}"]`))) {
        quickButtonObserver?.disconnect();
        quickButtonObserver = undefined;
    }
}

function initializeLesliePrivacyMode() {
    applyLesliePrivacyModeState();
    ensureQuickButtons();
    if (!document.querySelector('[data-leslie-privacy-quick-toggle="sidebar"]')
        || !document.querySelector('[data-leslie-privacy-quick-toggle="header"]')) {
        quickButtonObserver = new MutationObserver(ensureQuickButtons);
        quickButtonObserver.observe(document.body, { childList: true, subtree: true });
    }
}

window.addEventListener('storage', (event) => {
    if (event.key !== LESLIE_PRIVACY_MODE_STORAGE_KEY) {
        return;
    }
    privacyState = readLesliePrivacyModeState();
    applyLesliePrivacyModeState();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLesliePrivacyMode, { once: true });
} else {
    initializeLesliePrivacyMode();
}
