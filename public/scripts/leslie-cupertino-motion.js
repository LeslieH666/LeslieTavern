/**
 * Adds one-shot, presentation-only motion to newly inserted chat messages.
 *
 * The chat engine remains authoritative. This observer never changes message
 * data or event ordering, and it deliberately ignores bulk chat restoration.
 */

const MESSAGE_ENTER_CLASS = 'leslie-message-enter';
const MAX_ANIMATED_MESSAGE_BATCH = 2;
const MOTION_CLEANUP_DELAY = 600;

function hasReducedMotionPreference() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function canAnimateMessages(messageCount) {
    return messageCount > 0
        && messageCount <= MAX_ANIMATED_MESSAGE_BATCH
        && document.body?.classList.contains('leslie-modern')
        && document.body.dataset.leslieDesignLanguage === 'cupertino'
        && !document.body.classList.contains('leslie-chat-transitioning')
        && !hasReducedMotionPreference();
}

function markMessageForEntry(message) {
    if (!(message instanceof HTMLElement)) {
        return;
    }

    message.classList.remove(MESSAGE_ENTER_CLASS);
    message.classList.add(MESSAGE_ENTER_CLASS);

    let cleanupTimer = 0;
    const cleanup = () => {
        globalThis.clearTimeout(cleanupTimer);
        message.removeEventListener('animationend', handleAnimationEnd);
        message.classList.remove(MESSAGE_ENTER_CLASS);
    };
    const handleAnimationEnd = (event) => {
        if (event.target === message && event.animationName.startsWith('leslie-cupertino-message-in')) {
            cleanup();
        }
    };

    message.addEventListener('animationend', handleAnimationEnd);
    cleanupTimer = globalThis.setTimeout(cleanup, MOTION_CLEANUP_DELAY);
}

function collectAddedMessages(mutations, chat) {
    const messages = [];
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement && node.matches('.mes') && node.parentElement === chat) {
                messages.push(node);
            }
        }
    }
    return messages;
}

function observeNewMessages() {
    const chat = document.getElementById('chat');
    if (!chat) {
        return;
    }

    new MutationObserver((mutations) => {
        const messages = collectAddedMessages(mutations, chat);
        if (!canAnimateMessages(messages.length)) {
            return;
        }
        messages.forEach(markMessageForEntry);
    }).observe(chat, { childList: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeNewMessages, { once: true });
} else {
    observeNewMessages();
}
