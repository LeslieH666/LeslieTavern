import {
    normalizeCharacterCard,
    parseStructuredResponse,
} from './core.js';

const MAX_JSON_TEXT_LENGTH = 1_500_000;
const SUPPORTED_SPECS = new Set(['chara_card_v2', 'chara_card_v3']);
const STRING_FIELDS = [
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'first_message',
    'mes_example',
    'creator_notes',
    'system_prompt',
    'post_history_instructions',
    'creator',
    'character_version',
];
const LOSSY_ADVANCED_FIELDS = [
    ['character_book', '嵌入式世界书'],
    ['assets', 'V3 资源附件'],
    ['group_only_greetings', '群聊专用开场白'],
    ['creator_notes_multilingual', '多语言创作者备注'],
    ['nickname', '昵称字段'],
    ['source', 'V3 来源字段'],
];
const CLARIX_PERSONALIZATION_KEY = 'clarix_personalization';

function hasContent(value) {
    if (value === null || value === undefined || value === '') {
        return false;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    if (typeof value === 'object') {
        return Object.keys(value).length > 0;
    }
    return true;
}

function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('这里只能导入一张角色卡 JSON，不能导入数组或批量数据。');
    }

    if (payload.spec && !SUPPORTED_SPECS.has(payload.spec)) {
        throw new Error(`暂不支持 ${payload.spec}。请从网站复制 Character Card V2 JSON，或使用 SillyTavern 原生文件导入。`);
    }

    if ('data' in payload && (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data))) {
        throw new Error('角色卡的 data 必须是一个 JSON 对象。');
    }

    const data = payload.data ?? payload;
    for (const field of STRING_FIELDS) {
        if (field in data && data[field] !== null && typeof data[field] !== 'string') {
            throw new Error(`角色卡字段 ${field} 应当是文本，当前格式无法安全导入。`);
        }
    }

    if (typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('角色卡缺少有效的角色名称。');
    }

    if ('alternate_greetings' in data && !Array.isArray(data.alternate_greetings)) {
        throw new Error('alternate_greetings 应当是文本数组。');
    }

    if ('tags' in data && !Array.isArray(data.tags) && typeof data.tags !== 'string') {
        throw new Error('tags 应当是文本数组或逗号分隔文本。');
    }

    if ('extensions' in data && (!data.extensions || typeof data.extensions !== 'object' || Array.isArray(data.extensions))) {
        throw new Error('extensions 应当是一个 JSON 对象。');
    }

    const unsupported = LOSSY_ADVANCED_FIELDS
        .filter(([field]) => hasContent(data[field]))
        .map(([, label]) => label);
    if (unsupported.length > 0) {
        throw new Error(`检测到${unsupported.join('、')}。为避免这些内容丢失，请下载 JSON 文件后使用 SillyTavern 原生“导入角色”功能。`);
    }

    return data;
}

/**
 * Parses one pasted Character Card V2/V3 JSON document without saving it.
 * @param {string} text Pasted JSON text.
 * @returns {{card: object, sourceLabel: string, sourceSpec: string, notices: string[]}}
 */
export function parseCharacterCardJsonText(text) {
    const sourceText = String(text ?? '').trim();
    if (!sourceText) {
        throw new Error('请先粘贴从公益角色网站复制的 JSON 文本。');
    }
    if (sourceText.length > MAX_JSON_TEXT_LENGTH) {
        throw new Error('JSON 文本超过 1.5 MB。请改用 SillyTavern 原生文件导入，避免浏览器页面卡顿。');
    }

    const withoutFence = sourceText
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
    let payload;
    try {
        payload = JSON.parse(withoutFence);
    } catch {
        payload = parseStructuredResponse(sourceText);
    }
    const data = validatePayload(payload);
    const hasClarixMarker = hasContent(payload[CLARIX_PERSONALIZATION_KEY])
        || hasContent(data.extensions?.[CLARIX_PERSONALIZATION_KEY]);
    const sourceSpec = payload.spec || 'legacy-json';
    const notices = [];

    if (sourceSpec === 'chara_card_v2') {
        notices.push('已在内存中转换为 Character Card V3，原始 JSON 没有被改写。');
    } else if (sourceSpec === 'legacy-json') {
        notices.push('这份 JSON 没有声明卡片版本，已按兼容字段读取；保存前请重点检查预览。');
    }

    if (hasClarixMarker) {
        notices.push('已识别并保留 Clarix 个性化扩展字段。');
    }

    return {
        card: normalizeCharacterCard(payload),
        sourceLabel: hasClarixMarker ? 'Clarix 公益角色网站' : '外部角色卡 JSON',
        sourceSpec: sourceSpec,
        notices: notices,
    };
}
