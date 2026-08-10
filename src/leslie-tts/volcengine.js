export const VOLCENGINE_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
export const VOLCENGINE_TTS_TIMEOUT_MS = 45_000;
export const VOLCENGINE_TTS_MAX_TEXT_LENGTH = 10_000;
const VOLCENGINE_LANGUAGE_MODES = new Set(['auto', 'crosslingual', 'zh-cn', 'en', 'ja']);
const VOLCENGINE_ERROR_DETAIL_MAX_LENGTH = 240;

/**
 * Error raised when a browser request cannot safely be sent to Volcengine.
 */
export class VolcengineRequestError extends Error {
    /**
     * @param {string} message Safe client-facing explanation.
     * @param {number} [status] HTTP status to return.
     */
    constructor(message, status = 400) {
        super(message);
        this.name = 'VolcengineRequestError';
        this.status = status;
    }
}

/**
 * Only allow the official Volcengine V3 TTS endpoint. This prevents the
 * authenticated server route from being used as a general-purpose proxy.
 * @param {unknown} value Requested provider endpoint.
 * @returns {string} Canonical endpoint.
 */
export function normalizeVolcengineEndpoint(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return VOLCENGINE_TTS_ENDPOINT;
    }

    let endpoint;
    try {
        endpoint = new URL(String(value).trim());
    } catch {
        throw new VolcengineRequestError('火山引擎语音地址格式无效。');
    }

    const isOfficialEndpoint = endpoint.protocol === 'https:'
        && endpoint.hostname === 'openspeech.bytedance.com'
        && endpoint.port === ''
        && endpoint.pathname === '/api/v3/tts/unidirectional'
        && endpoint.search === ''
        && endpoint.hash === '';

    if (!isOfficialEndpoint) {
        throw new VolcengineRequestError('第一版只允许使用火山引擎官方 V3 语音地址。');
    }

    return VOLCENGINE_TTS_ENDPOINT;
}

/**
 * Read and validate a required request string.
 * @param {unknown} value Input value.
 * @param {string} label User-facing field name.
 * @param {number} maximumLength Maximum accepted length.
 * @returns {string} Trimmed string.
 */
function requiredString(value, label, maximumLength) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new VolcengineRequestError(`缺少${label}。`);
    }

    const normalized = value.trim();
    if (normalized.length > maximumLength) {
        throw new VolcengineRequestError(`${label}过长。`);
    }

    return normalized;
}

/**
 * Normalize the request body accepted from the browser.
 * @param {Record<string, unknown>} body Browser request body.
 * @returns {{endpoint: string, resourceId: string, text: string, speaker: string, speed: number}} Validated request.
 */
export function normalizeVolcengineRequest(body = {}) {
    const rawSpeed = Number.parseInt(String(body.speed ?? '0'), 10);
    const speed = Number.isFinite(rawSpeed) ? Math.min(100, Math.max(-50, rawSpeed)) : 0;
    const requestedLanguage = String(body.language_mode ?? 'auto').trim().toLowerCase();

    return {
        endpoint: normalizeVolcengineEndpoint(body.provider_endpoint),
        resourceId: requiredString(body.resource_id, 'Resource ID', 256),
        text: requiredString(body.text, '朗读文字', VOLCENGINE_TTS_MAX_TEXT_LENGTH),
        speaker: requiredString(body.voice_speaker, '角色音色', 256),
        speed,
        languageMode: VOLCENGINE_LANGUAGE_MODES.has(requestedLanguage) ? requestedLanguage : 'auto',
    };
}

/**
 * Pick the V3 language hint from the actual text. This keeps Chinese speakers
 * usable for English replies and handles mixed Chinese/English naturally.
 * @param {string} text Text to synthesize.
 * @param {string} [mode] User override.
 * @returns {string} Volcengine explicit_language value.
 */
export function resolveVolcengineLanguage(text, mode = 'auto') {
    if (mode !== 'auto' && VOLCENGINE_LANGUAGE_MODES.has(mode)) return mode;
    if (/[\u3040-\u30ff]/u.test(text)) return 'ja';
    const hasChinese = /[\u3400-\u9fff]/u.test(text);
    const hasLatin = /[A-Za-z]/u.test(text);
    if (hasChinese && hasLatin) return 'crosslingual';
    if (hasChinese) return 'zh-cn';
    if (hasLatin) return 'en';
    return 'crosslingual';
}

/**
 * Build the fixed-shape payload expected by Volcengine's V3 HTTP API.
 * @param {{text: string, speaker: string, speed: number}} request Validated request.
 * @returns {Record<string, unknown>} Volcengine request payload.
 */
export function buildVolcenginePayload(request) {
    return {
        req_params: {
            text: request.text,
            speaker: request.speaker,
            audio_params: {
                format: 'mp3',
                speech_rate: request.speed,
            },
            additions: JSON.stringify({
                mute_cut_threshold: '400',
                mute_cut_remain_ms: '1',
                explicit_language: resolveVolcengineLanguage(request.text, request.languageMode),
                enable_language_detector: true,
                unsupported_char_ratio_thresh: 1,
                disable_markdown_filter: true,
                cache_config: {
                    use_cache: true,
                    text_type: 1,
                },
            }),
        },
    };
}

/**
 * Extract a short, non-secret diagnostic from a failed Volcengine response.
 * The full upstream body is intentionally never logged or returned because it
 * may change shape without notice. Credentials and the submitted text are not
 * accepted by this helper.
 * @param {{apiStatusCode?: unknown, apiMessage?: unknown, body?: unknown}} input Upstream error metadata.
 * @returns {{code: string, message: string}} Safe diagnostic fields.
 */
export function parseVolcengineUpstreamError(input = {}) {
    let parsed = null;
    const body = String(input.body ?? '').trim();
    if (body) {
        try {
            parsed = JSON.parse(body);
        } catch {
            const firstRecord = body.split(/\r?\n/u).find(line => line.trim());
            try {
                parsed = firstRecord ? JSON.parse(firstRecord) : null;
            } catch {
                parsed = null;
            }
        }
    }

    const metadataError = parsed?.ResponseMetadata?.Error ?? parsed?.responseMetadata?.error ?? {};
    const rawCode = input.apiStatusCode ?? parsed?.code ?? parsed?.Code ?? metadataError.Code ?? metadataError.code ?? '';
    const rawMessage = input.apiMessage ?? parsed?.message ?? parsed?.Message ?? metadataError.Message ?? metadataError.message ?? '';
    const clean = value => String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, VOLCENGINE_ERROR_DETAIL_MAX_LENGTH);

    return { code: clean(rawCode), message: clean(rawMessage) };
}

/**
 * Parse one newline-delimited response record from the V3 endpoint.
 * @param {string} line JSON response record.
 * @returns {Buffer | null} Decoded MP3 chunk, when present.
 */
export function parseVolcengineStreamLine(line) {
    let record;
    try {
        record = JSON.parse(line);
    } catch {
        throw new VolcengineRequestError('火山引擎返回了无法识别的语音数据。', 502);
    }

    if (record.code !== 0 && record.code !== 20_000_000) {
        const code = Number.isFinite(Number(record.code)) ? String(record.code) : 'unknown';
        throw new VolcengineRequestError(`火山引擎语音生成失败（错误码 ${code}）。`, 502);
    }

    if (!record.data) {
        return null;
    }

    return Buffer.from(record.data, 'base64');
}
