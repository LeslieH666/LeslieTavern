/**
 * Keep official DeepSeek thinking requests from spending the whole response
 * allowance on reasoning before a visible reply can be produced.
 *
 * DeepSeek shares one output allowance between reasoning and final content.
 * Manual mode protects that allowance with a non-persistent floor. Leslie's
 * provider-controlled foreground mode omits the request cap while retaining a
 * separate prompt-assembly reservation based on DeepSeek's provider defaults.
 */

import { isLeslieProviderControlledOutput } from './leslie-reply-style.js';

export const DEEPSEEK_THINKING_OUTPUT_FLOOR = 32_768;
export const DEEPSEEK_MAX_THINKING_OUTPUT_FLOOR = 65_536;
export const DEEPSEEK_THINKING_PROMPT_FLOOR = 32_768;
export const DEEPSEEK_MAX_THINKING_PROMPT_FLOOR = 65_536;
export const DEEPSEEK_PROVIDER_OUTPUT_DEFAULT = 8_192;
export const DEEPSEEK_PROVIDER_THINKING_OUTPUT_DEFAULT = 65_536;
export const DEEPSEEK_PROVIDER_MAX_THINKING_OUTPUT_DEFAULT = 131_072;

/**
 * Calculate the effective context and output allowance for one chat request.
 * The saved settings are never mutated.
 *
 * @param {object} options Budget inputs.
 * @param {string} options.chatCompletionSource Active Chat Completion source.
 * @param {boolean} options.showThoughts Whether reasoning mode is enabled.
 * @param {string} options.reasoningEffort Saved reasoning effort.
 * @param {number} options.contextTokens User-selected total context allowance.
 * @param {number} options.outputTokens User-selected response allowance.
 * @returns {{contextTokens: number, outputTokens: number, protected: boolean}}
 */
export function getReasoningSafeTokenBudget({
    chatCompletionSource,
    showThoughts,
    reasoningEffort,
    contextTokens,
    outputTokens,
}) {
    const requestedContext = toPositiveInteger(contextTokens, 1);
    const requestedOutput = toPositiveInteger(outputTokens, 1);
    const shouldProtect = chatCompletionSource === 'deepseek' && Boolean(showThoughts);

    if (!shouldProtect) {
        return {
            contextTokens: requestedContext,
            outputTokens: requestedOutput,
            protected: false,
        };
    }

    const maximumEffort = reasoningEffort === 'max';
    const outputFloor = maximumEffort
        ? DEEPSEEK_MAX_THINKING_OUTPUT_FLOOR
        : DEEPSEEK_THINKING_OUTPUT_FLOOR;
    const promptFloor = maximumEffort
        ? DEEPSEEK_MAX_THINKING_PROMPT_FLOOR
        : DEEPSEEK_THINKING_PROMPT_FLOOR;
    const protectedOutput = Math.max(requestedOutput, outputFloor);
    const protectedContext = Math.max(requestedContext, protectedOutput + promptFloor);

    return {
        contextTokens: protectedContext,
        outputTokens: protectedOutput,
        protected: protectedContext !== requestedContext || protectedOutput !== requestedOutput,
    };
}

/**
 * Resolve the separate prompt reservation and outgoing request limit.
 * DeepSeek foreground replies may omit `max_tokens`, while prompt assembly
 * still reserves the provider's documented default output allowance.
 * Background and unsupported-provider calls keep the existing explicit limit.
 *
 * @param {object} options Budget inputs.
 * @param {string} options.chatCompletionSource Active Chat Completion source.
 * @param {boolean} options.showThoughts Whether reasoning mode is enabled.
 * @param {string} options.reasoningEffort Saved reasoning effort.
 * @param {number} options.contextTokens User-selected total context allowance.
 * @param {number} options.outputTokens User-selected response allowance.
 * @param {string} options.type Generation type.
 * @returns {{contextTokens: number, outputTokens: number, requestOutputTokens: number | undefined, protected: boolean, providerControlled: boolean}}
 */
export function getGenerationTokenBudget({
    chatCompletionSource,
    showThoughts,
    reasoningEffort,
    contextTokens,
    outputTokens,
    type,
}) {
    if (!isLeslieProviderControlledOutput({ chatCompletionSource, type })) {
        const budget = getReasoningSafeTokenBudget({
            chatCompletionSource,
            showThoughts,
            reasoningEffort,
            contextTokens,
            outputTokens,
        });
        return {
            ...budget,
            requestOutputTokens: budget.outputTokens,
            providerControlled: false,
        };
    }

    const requestedContext = toPositiveInteger(contextTokens, 1);
    const maximumEffort = Boolean(showThoughts) && reasoningEffort === 'max';
    const reservedOutput = !showThoughts
        ? DEEPSEEK_PROVIDER_OUTPUT_DEFAULT
        : maximumEffort
            ? DEEPSEEK_PROVIDER_MAX_THINKING_OUTPUT_DEFAULT
            : DEEPSEEK_PROVIDER_THINKING_OUTPUT_DEFAULT;
    const promptFloor = !showThoughts
        ? DEEPSEEK_PROVIDER_OUTPUT_DEFAULT
        : maximumEffort
            ? DEEPSEEK_MAX_THINKING_PROMPT_FLOOR
            : DEEPSEEK_THINKING_PROMPT_FLOOR;
    const protectedContext = Math.max(requestedContext, reservedOutput + promptFloor);

    return {
        contextTokens: protectedContext,
        outputTokens: reservedOutput,
        requestOutputTokens: undefined,
        protected: protectedContext !== requestedContext,
        providerControlled: true,
    };
}

/**
 * Convert an arbitrary setting value into a usable positive integer.
 * @param {unknown} value Candidate number.
 * @param {number} fallback Fallback number.
 * @returns {number}
 */
function toPositiveInteger(value, fallback) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
