const CUSTOM_VOICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

/**
 * Small offline fallback. The full catalog is loaded from the server's fixed
 * official-docs reader, so users get newly published public voices without a
 * Leslie update while private cloned voices stay local.
 */
export const VOLCENGINE_BUILTIN_VOICES = [
    { name: '小何（女声）', voice_id: 'zh_female_xiaohe_uranus_bigtts', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: 'Vivi（女声）', voice_id: 'zh_female_vv_uranus_bigtts', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: '可爱女生', voice_id: 'saturn_zh_female_keainvsheng_tob', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: '调皮公主', voice_id: 'saturn_zh_female_tiaopigongzhu_tob', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: '灿灿（女声）', voice_id: 'saturn_zh_female_cancan_tob', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: '爽朗少年', voice_id: 'saturn_zh_male_shuanglangshaonian_tob', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: '天才同桌', voice_id: 'saturn_zh_male_tiancaitongzhuo_tob', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
    { name: '桃成（男声）', voice_id: 'zh_male_taocheng_uranus_bigtts', lang: '中文 / English', model: '2.0', resource_id: 'seed-tts-2.0' },
];

let catalogPromise;

/** @param {unknown} voice @returns {boolean} */
function isVoice(voice) {
    return Boolean(voice && typeof voice.name === 'string' && CUSTOM_VOICE_ID_PATTERN.test(String(voice.voice_id ?? '')));
}

/** @param {unknown[]} official @returns {typeof VOLCENGINE_BUILTIN_VOICES} */
function mergeVoiceCatalog(official) {
    const voices = new Map(VOLCENGINE_BUILTIN_VOICES.map(voice => [voice.voice_id, { ...voice }]));
    for (const voice of official.filter(isVoice)) {
        const current = voices.get(voice.voice_id) ?? {};
        voices.set(voice.voice_id, {
            ...current,
            ...voice,
            name: current.name || voice.name || voice.voice_id,
        });
    }
    return [...voices.values()];
}

/**
 * Load the current public TTS catalog. A failed network/docs request falls
 * back to the bundled voices and never prevents the settings page loading.
 * @param {boolean} [refresh] Ignore the in-page cache.
 */
export async function loadVolcengineVoices(refresh = false) {
    if (!catalogPromise || refresh) {
        catalogPromise = fetch('/api/volcengine/voices', { headers: { Accept: 'application/json' } })
            .then(async response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                if (!Array.isArray(payload.voices) || payload.voices.length === 0) throw new Error('Empty voice catalog');
                return mergeVoiceCatalog(payload.voices);
            })
            .catch(error => {
                console.warn('Unable to load the current Volcengine voice catalog; using offline fallback.', error);
                return mergeVoiceCatalog([]);
            });
    }
    return catalogPromise;
}

/** @param {string} voiceId @param {Array<Record<string, any>>} voices @param {string} fallback @returns {string} */
export function getVolcengineResourceId(voiceId, voices, fallback = '') {
    return String(voices.find(voice => voice.voice_id === voiceId || voice.name === voiceId)?.resource_id || fallback || '').trim();
}

/**
 * Accept direct IDs plus common console/document copy formats, including
 * JSON and `voice_type=...`. Credentials and other free text are rejected.
 * @param {unknown} input Raw pasted value.
 * @returns {string} Normalized voice_type, or an empty string when invalid.
 */
export function normalizeVolcengineVoiceId(input) {
    let raw = String(input ?? '').trim().replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/, '').trim();
    const unquoted = raw.replace(/^["'`]([^"'`]+)["'`]$/, '$1').trim();
    if (CUSTOM_VOICE_ID_PATTERN.test(unquoted)) return unquoted;

    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') raw = parsed;
        if (parsed && typeof parsed === 'object') {
            for (const key of ['voice_type', 'speaker', 'speaker_id', 'voiceId', 'voice_id']) {
                const value = String(parsed[key] ?? '').trim();
                if (CUSTOM_VOICE_ID_PATTERN.test(value)) return value;
            }
        }
    } catch {
        // Continue with tolerant console-copy parsing.
    }

    const assigned = raw.match(/(?:voice[_ ]?type|speaker(?:[_ ]?id)?|voice[_ ]?id)\s*[:=]\s*["'`]?([A-Za-z0-9][A-Za-z0-9_.:-]{0,159})/i)?.[1];
    if (assigned && CUSTOM_VOICE_ID_PATTERN.test(assigned)) return assigned;

    const candidates = raw.match(/[A-Za-z0-9][A-Za-z0-9_.:-]{2,159}/g) ?? [];
    const likelyVoiceIds = [...new Set(candidates.filter(value => CUSTOM_VOICE_ID_PATTERN.test(value) && /[_:.]/.test(value)))];
    return likelyVoiceIds.length === 1 ? likelyVoiceIds[0] : '';
}
