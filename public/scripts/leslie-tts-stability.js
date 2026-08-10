export const DEFAULT_TTS_SETTLE_DELAY_MS = 120;

/**
 * Keep only the latest automatic narration request and run it after the reply
 * has briefly stopped changing. The callback is intentionally supplied by the
 * TTS extension so this helper stays browser-independent and unit-testable.
 */
export class SettledTtsScheduler {
    #timer = null;
    #revision = 0;
    #delay;
    #onSettled;
    #setTimer;
    #clearTimer;

    /**
     * @param {(request: unknown) => void | Promise<void>} onSettled Callback for the latest request.
     * @param {{delay?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout}} [options] Timing options.
     */
    constructor(onSettled, options = {}) {
        this.#delay = options.delay ?? DEFAULT_TTS_SETTLE_DELAY_MS;
        this.#onSettled = onSettled;
        const setTimer = options.setTimer ?? globalThis.setTimeout;
        const clearTimer = options.clearTimer ?? globalThis.clearTimeout;

        // Chromium's native timer functions require the Window/global receiver.
        // Storing setTimeout directly on this class and calling it as a private
        // method changes `this` to the scheduler and throws "Illegal invocation".
        this.#setTimer = (...args) => Reflect.apply(setTimer, globalThis, args);
        this.#clearTimer = (...args) => Reflect.apply(clearTimer, globalThis, args);
    }

    /**
     * Replace any pending request with the latest rendered message.
     * @param {unknown} request Opaque message identity supplied by the TTS extension.
     */
    schedule(request) {
        this.cancel();
        const revision = this.#revision;
        this.#timer = this.#setTimer(async () => {
            this.#timer = null;
            if (revision !== this.#revision) return;
            await this.#onSettled(request);
        }, this.#delay);
    }

    /** Cancel a pending automatic narration request. */
    cancel() {
        this.#revision += 1;
        if (this.#timer !== null) {
            this.#clearTimer(this.#timer);
            this.#timer = null;
        }
    }

    /** @returns {boolean} Whether a narration request is waiting to settle. */
    get pending() {
        return this.#timer !== null;
    }
}
