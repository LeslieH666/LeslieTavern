import { getLeslieLocalSettings } from '../leslie-local-model-core.js';

export const WORKSHOP_PROVIDER = Object.freeze({
    CHAT: 'chat',
    LOCAL: 'local',
});

const LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:5001';
const DEFAULT_CONTEXT = 8192;
const MIN_RESPONSE_TOKENS = 256;
const RESPONSE_SAFETY_MARGIN = 160;
const RESPONSE_HARD_CAP = 3072;

export function getWorkshopProviderLabel(provider) {
    return provider === WORKSHOP_PROVIDER.LOCAL
        ? '本地 Peach 2.0 · KoboldCpp'
        : '当前聊天 API（DeepSeek 等）';
}

export function getLocalWorkshopSettings() {
    const settings = getLeslieLocalSettings('koboldcpp');
    return {
        ...settings,
        endpoint: settings.endpoint || LOCAL_MODEL_ENDPOINT,
        modelName: 'Peach 2.0 9B Q4_K_M',
    };
}

function estimateTokenCount(text) {
    const value = String(text || '');
    let cjkCount = 0;
    let latinCount = 0;
    for (const character of value) {
        if (/\p{Script=Han}|[\u3040-\u30ff\uac00-\ud7af]/u.test(character)) {
            cjkCount++;
        } else if (!/\s/u.test(character)) {
            latinCount++;
        }
    }
    return Math.ceil(cjkCount / 1.8 + latinCount / 3.8);
}

export function getLocalResponseTokenBudget(request, settings = getLocalWorkshopSettings()) {
    const messages = [request?.systemPrompt, request?.prompt].filter(Boolean).join('\n\n');
    const context = Number(settings.context) || DEFAULT_CONTEXT;
    const available = context - estimateTokenCount(messages) - RESPONSE_SAFETY_MARGIN;
    const requested = Number(request?.responseLength) || Number(settings.responseTokens) || 512;
    return Math.max(MIN_RESPONSE_TOKENS, Math.min(requested, available, RESPONSE_HARD_CAP));
}

export function buildLocalChatCompletionRequest(request, settings = getLocalWorkshopSettings()) {
    const generation = settings.generation || {};
    return {
        model: settings.modelName,
        messages: [
            { role: 'system', content: request?.systemPrompt || '' },
            { role: 'user', content: request?.prompt || '' },
        ],
        max_tokens: getLocalResponseTokenBudget(request, settings),
        // Roleplay chat benefits from a warmer temperature, but the workshop
        // must reserve probability mass for exact JSON syntax and field names.
        temperature: Math.min(Number(generation.temp) || 0.9, 0.45),
        top_p: Number(generation.top_p) || 0.9,
        top_k: Number(generation.top_k) || 40,
        min_p: Number(generation.min_p) || 0.05,
        repeat_penalty: Number(generation.rep_pen) || 1.1,
        repeat_last_n: Number(generation.rep_pen_range) || 4096,
        stream: false,
        stop: ['</leslie-json>'],
    };
}

export function getLocalChatCompletionUrl(settings = getLocalWorkshopSettings()) {
    return `${String(settings.endpoint || LOCAL_MODEL_ENDPOINT).replace(/\/+$/, '')}/v1/chat/completions`;
}

export function extractLocalCompletionText(payload) {
    const text = payload?.choices?.[0]?.message?.content
        ?? payload?.choices?.[0]?.text
        ?? payload?.results?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('本地模型返回了空内容或无法识别的响应格式。');
    }
    return text;
}

export function extractLocalModelName(payload) {
    return payload?.data?.[0]?.id
        || payload?.model
        || payload?.result
        || '本地模型已连接';
}

export async function probeLocalWorkshopProvider({ fetchImpl = globalThis.fetch, settings = getLocalWorkshopSettings(), signal } = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('当前浏览器不支持本地模型连接检查。');
    }

    const response = await fetchImpl(`${String(settings.endpoint || LOCAL_MODEL_ENDPOINT).replace(/\/+$/, '')}/v1/models`, {
        method: 'GET',
        signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || `本地模型连接失败（HTTP ${response.status}）。`);
    }
    return {
        connected: true,
        model: extractLocalModelName(payload),
        payload,
    };
}
