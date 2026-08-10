export const VOLCENGINE_VOICE_DOC_API = 'https://www.volcengine.com/api/doc/getDocDetail?LibraryID=6561&DocumentID=1257544&lang=zh';
export const VOLCENGINE_VOICE_DOC_TIMEOUT_MS = 12_000;

const VOICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,159}$/;
const RESOURCE_IDS = {
    '1.0': 'volc.service_type.10029',
    '2.0': 'seed-tts-2.0',
};

/** @param {string} value @returns {string} */
function cleanCell(value) {
    return String(value ?? '')
        .replace(/<br\s*\/?\s*>/gi, ' / ')
        .replace(/<[^>]+>/g, '')
        .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
        .replace(/[*`]/g, '')
        .replace(/\\([|_])/g, '$1')
        .replace(/&nbsp;/gi, ' ')
        .trim();
}

/** @param {string} line @returns {string[]} */
function readMarkdownRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cleanCell);
}

/**
 * Parse the public Volcengine voice documentation. Only the normal TTS 1.0
 * and 2.0 sections are accepted; real-time speech-model speakers belong to a
 * different API and are intentionally omitted.
 * @param {string} markdown Official documentation markdown.
 * @returns {Array<{name: string, voice_id: string, lang: string, category: string, model: string, resource_id: string}>}
 */
export function parseVolcengineVoiceCatalog(markdown) {
    const voices = new Map();
    let model = '';
    let resourceId = '';
    let columns = null;

    for (const rawLine of String(markdown ?? '').split(/\r?\n/)) {
        const heading = rawLine.match(/^##\s+(.+)/);
        if (heading) {
            const title = cleanCell(heading[1]);
            columns = null;
            if (/端到端实时语音|实时语音大模型/.test(title)) {
                model = '';
                resourceId = '';
            } else if (/豆包语音合成模型\s*2\.0/.test(title)) {
                model = '2.0';
                resourceId = RESOURCE_IDS[model];
            } else if (/豆包语音合成模型\s*1\.0/.test(title)) {
                model = '1.0';
                resourceId = RESOURCE_IDS[model];
            } else {
                model = '';
                resourceId = '';
            }
            continue;
        }

        if (!resourceId || !rawLine.trim().startsWith('|')) continue;
        const cells = readMarkdownRow(rawLine);
        if (cells.every(cell => /^:?-{3,}:?$/.test(cell))) continue;

        const voiceIndex = cells.findIndex(cell => /^voice[_ ]?type$/i.test(cell) || /音色\s*(?:ID|id)/.test(cell));
        if (voiceIndex !== -1) {
            columns = {
                voice: voiceIndex,
                name: cells.findIndex(cell => /音色名称|音色名|声音名称/.test(cell)),
                lang: cells.findIndex(cell => /语种|语言/.test(cell)),
                category: cells.findIndex(cell => /场景|分类|类型/.test(cell)),
            };
            continue;
        }

        if (!columns) continue;
        const voiceId = cleanCell(cells[columns.voice]);
        if (!VOICE_ID_PATTERN.test(voiceId)) continue;

        const name = cleanCell(cells[columns.name]) || voiceId;
        const lang = cleanCell(cells[columns.lang]);
        const category = cleanCell(cells[columns.category]);
        const existing = voices.get(voiceId);
        if (existing) {
            existing.lang = [...new Set([existing.lang, lang].filter(Boolean))].join(' / ');
            existing.category = [...new Set([existing.category, category].filter(Boolean))].join(' / ');
            continue;
        }

        voices.set(voiceId, {
            name,
            voice_id: voiceId,
            lang,
            category,
            model,
            resource_id: resourceId,
        });
    }

    return [...voices.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

/**
 * Validate the fixed-shape response returned by Volcengine's public docs API.
 * @param {unknown} value Parsed response JSON.
 * @returns {{markdown: string, updatedAt: string}}
 */
export function readVolcengineVoiceDocument(value) {
    const markdown = value?.Result?.Content;
    if (typeof markdown !== 'string' || markdown.length < 100) {
        throw new Error('Volcengine voice document did not contain a usable catalog.');
    }
    return {
        markdown,
        updatedAt: typeof value?.Result?.UpdatedTime === 'string' ? value.Result.UpdatedTime : '',
    };
}
