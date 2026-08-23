import { LESLIE_BRIDGE_TTS_MODEL } from './protocol.js';
import { LeslieBridgeRequestError } from './errors.js';

export { LeslieBridgeRequestError } from './errors.js';

export const LESLIE_BRIDGE_VOLCENGINE_RESOURCE_ID_ENV = 'LESLIE_BRIDGE_VOLCENGINE_RESOURCE_ID';
export const LESLIE_BRIDGE_TTS_MODEL_ALIASES = new Set([LESLIE_BRIDGE_TTS_MODEL, 'tts-1']);

function optionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Convert the OpenAI speed multiplier to Volcengine's integer speech rate.
 * Volcengine accepts -50 through 100; values outside its range are clamped.
 * @param {unknown} value OpenAI speed multiplier.
 * @returns {number} Volcengine speech rate.
 */
export function openAISpeedToVolcengineRate(value) {
    const multiplier = value === undefined ? 1 : Number(value);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
        throw new LeslieBridgeRequestError('INVALID_SPEED', 'speed must be a positive number.');
    }
    return Math.round(Math.min(100, Math.max(-50, (multiplier - 1) * 100)));
}

/**
 * Translate the OpenAI Audio Speech request into the existing Leslie
 * Volcengine request boundary.
 * @param {Record<string, unknown>} [body] OpenAI-compatible request body.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [environment] Environment source.
 * @returns {Record<string, unknown>} Volcengine route request body.
 */
export function toVolcengineSpeechRequest(body = {}, environment = process.env) {
    const model = optionalString(body.model) || LESLIE_BRIDGE_TTS_MODEL;
    if (!LESLIE_BRIDGE_TTS_MODEL_ALIASES.has(model)) {
        throw new LeslieBridgeRequestError('MODEL_NOT_SUPPORTED', `Unsupported speech model: ${model}.`);
    }

    const responseFormat = optionalString(body.response_format ?? body.format).toLowerCase() || 'mp3';
    if (responseFormat !== 'mp3') {
        throw new LeslieBridgeRequestError('FORMAT_NOT_SUPPORTED', 'Only the mp3 speech response format is supported.');
    }

    const resourceId = optionalString(body.resource_id ?? body.resourceId)
        || optionalString(environment?.[LESLIE_BRIDGE_VOLCENGINE_RESOURCE_ID_ENV]);
    if (!resourceId) {
        throw new LeslieBridgeRequestError(
            'RESOURCE_ID_REQUIRED',
            `Provide resource_id in the request or set ${LESLIE_BRIDGE_VOLCENGINE_RESOURCE_ID_ENV}.`,
        );
    }

    const input = optionalString(body.input);
    if (!input) {
        throw new LeslieBridgeRequestError('INPUT_REQUIRED', 'input must contain text to synthesize.');
    }

    const voice = optionalString(body.voice);
    if (!voice) {
        throw new LeslieBridgeRequestError('VOICE_REQUIRED', 'voice must contain a Volcengine speaker ID.');
    }

    return {
        resource_id: resourceId,
        text: input,
        voice_speaker: voice,
        speed: openAISpeedToVolcengineRate(body.speed),
        language_mode: body.language_mode,
    };
}
