export const LESLIE_LENGTH_CONTINUATION_LIMIT = 2;

/**
 * Decide whether a provider response stopped by a token limit can be safely
 * continued without involving the user's normal auto-continue preference.
 *
 * @param {object} options Continuation state.
 * @param {string?} options.finishReason Provider completion finish reason.
 * @param {string} options.messageChunk Last generated chunk.
 * @param {boolean} options.isImpersonate Whether the model is writing as the user.
 * @param {boolean} options.isSending Whether another send is in progress.
 * @param {boolean} options.isAborted Whether generation was stopped.
 * @param {boolean} options.hasPendingInput Whether the composer contains user text.
 * @param {boolean} options.isGroup Whether a group chat is active.
 * @param {number} options.attempts Automatic length-continuation attempts already made.
 * @param {number} [options.limit] Maximum automatic length continuations.
 * @returns {'not-length-limited' | 'blocked' | 'limit-reached' | 'continue'}
 */
export function getLengthContinuationDecision({
    finishReason,
    messageChunk,
    isImpersonate,
    isSending,
    isAborted,
    hasPendingInput,
    isGroup,
    attempts,
    limit = LESLIE_LENGTH_CONTINUATION_LIMIT,
}) {
    if (finishReason !== 'length') {
        return 'not-length-limited';
    }

    const hasUsableText = typeof messageChunk === 'string' && messageChunk.trim().length > 0;
    if (!hasUsableText || isImpersonate || isSending || isAborted || hasPendingInput || isGroup) {
        return 'blocked';
    }

    if (attempts >= limit) {
        return 'limit-reached';
    }

    return 'continue';
}
