/**
 * Keeps Leslie's semantic light/dark palette aligned with the currently
 * selected SillyTavern theme without changing or saving theme data.
 */

const DARK_LUMINANCE_THRESHOLD = 0.42;

/**
 * Convert an sRGB channel to a linear-light channel.
 * @param {number} channel Channel value between 0 and 255.
 * @returns {number} Linear-light channel value.
 */
function linearize(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Read the RGB channels from a CSS rgb/rgba color.
 * @param {string} color CSS color value.
 * @returns {number[] | null} RGB channels, or null when parsing fails.
 */
function parseRgb(color) {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    return channels?.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

/**
 * Infer whether the active SillyTavern UI tint is dark.
 * @returns {'light' | 'dark'} Leslie color scheme.
 */
function getLeslieColorScheme() {
    const rootStyle = getComputedStyle(document.documentElement);
    const tint = rootStyle.getPropertyValue('--SmartThemeBlurTintColor').trim();
    const channels = parseRgb(tint);

    if (!channels) {
        return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    const [red, green, blue] = channels.map(linearize);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luminance < DARK_LUMINANCE_THRESHOLD ? 'dark' : 'light';
}

function applyLeslieColorScheme() {
    if (!document.body?.classList.contains('leslie-modern')) {
        return;
    }

    document.body.dataset.leslieColorScheme = getLeslieColorScheme();
}

let updateFrame = 0;

function scheduleLeslieColorSchemeUpdate() {
    cancelAnimationFrame(updateFrame);
    updateFrame = requestAnimationFrame(applyLeslieColorScheme);
}

// SillyTavern applies a theme by updating CSS variables on the root element.
// Watching that style attribute also covers imported and custom themes.
new MutationObserver(scheduleLeslieColorSchemeUpdate).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
});

document.addEventListener('change', (event) => {
    if (event.target instanceof Element && event.target.matches('#themes, toolcool-color-picker')) {
        scheduleLeslieColorSchemeUpdate();
    }
}, true);

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleLeslieColorSchemeUpdate);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleLeslieColorSchemeUpdate, { once: true });
} else {
    scheduleLeslieColorSchemeUpdate();
}

window.addEventListener('load', scheduleLeslieColorSchemeUpdate, { once: true });
