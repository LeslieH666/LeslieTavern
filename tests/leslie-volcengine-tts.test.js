import { describe, expect, test } from '@jest/globals';

import {
    buildVolcenginePayload,
    normalizeVolcengineEndpoint,
    normalizeVolcengineRequest,
    parseVolcengineStreamLine,
    parseVolcengineUpstreamError,
    resolveVolcengineLanguage,
    VOLCENGINE_TTS_ENDPOINT,
    VOLCENGINE_TTS_MAX_TEXT_LENGTH,
} from '../src/leslie-tts/volcengine.js';

describe('Leslie Volcengine TTS request boundary', () => {
    test('uses only the canonical official V3 endpoint', () => {
        expect(normalizeVolcengineEndpoint()).toBe(VOLCENGINE_TTS_ENDPOINT);
        expect(normalizeVolcengineEndpoint(VOLCENGINE_TTS_ENDPOINT)).toBe(VOLCENGINE_TTS_ENDPOINT);
        expect(() => normalizeVolcengineEndpoint('http://openspeech.bytedance.com/api/v3/tts/unidirectional')).toThrow();
        expect(() => normalizeVolcengineEndpoint('https://example.com/api/v3/tts/unidirectional')).toThrow();
        expect(() => normalizeVolcengineEndpoint(`${VOLCENGINE_TTS_ENDPOINT}?forward=1`)).toThrow();
    });

    test('validates required fields and clamps speech speed', () => {
        const normalized = normalizeVolcengineRequest({
            resource_id: 'volc.service_type.10029',
            text: ' 你好，世界。 ',
            voice_speaker: 'zh_female_xiaohe_uranus_bigtts',
            speed: 900,
        });

        expect(normalized).toMatchObject({
            endpoint: VOLCENGINE_TTS_ENDPOINT,
            resourceId: 'volc.service_type.10029',
            text: '你好，世界。',
            speaker: 'zh_female_xiaohe_uranus_bigtts',
            speed: 100,
            languageMode: 'auto',
        });
        expect(normalizeVolcengineRequest({ ...normalized, resource_id: 'r', voice_speaker: 'v', speed: -900 }).speed).toBe(-50);
        expect(() => normalizeVolcengineRequest({ resource_id: 'r', text: '', voice_speaker: 'v' })).toThrow('朗读文字');
        expect(() => normalizeVolcengineRequest({ resource_id: 'r', text: 'a'.repeat(VOLCENGINE_TTS_MAX_TEXT_LENGTH + 1), voice_speaker: 'v' })).toThrow('过长');
    });

    test('builds the fixed MP3 payload without accepting arbitrary additions', () => {
        const payload = buildVolcenginePayload({ text: '测试', speaker: 'voice-a', speed: 12 });
        expect(payload.req_params).toMatchObject({
            text: '测试',
            speaker: 'voice-a',
            audio_params: { format: 'mp3', speech_rate: 12 },
        });
        expect(JSON.parse(payload.req_params.additions)).toMatchObject({
            explicit_language: 'zh-cn',
            enable_language_detector: true,
            unsupported_char_ratio_thresh: 1,
            disable_markdown_filter: true,
            cache_config: { use_cache: true, text_type: 1 },
        });
    });

    test('automatically selects Chinese, English, and mixed-language modes', () => {
        expect(resolveVolcengineLanguage('你好，今天过得怎么样？')).toBe('zh-cn');
        expect(resolveVolcengineLanguage('Hello, how are you today?')).toBe('en');
        expect(resolveVolcengineLanguage('你好，Leslie.')).toBe('crosslingual');
        expect(resolveVolcengineLanguage('こんにちは')).toBe('ja');
        expect(resolveVolcengineLanguage('Hello', 'zh-cn')).toBe('zh-cn');
    });

    test('decodes successful stream records and rejects provider error records', () => {
        const audio = Buffer.from('fake-mp3');
        expect(parseVolcengineStreamLine(JSON.stringify({ code: 0, data: audio.toString('base64') }))).toEqual(audio);
        expect(parseVolcengineStreamLine(JSON.stringify({ code: 20_000_000 }))).toBeNull();
        expect(() => parseVolcengineStreamLine(JSON.stringify({ code: 30_000_001, message: 'secret upstream detail' }))).toThrow('30000001');
        expect(() => parseVolcengineStreamLine('not-json')).toThrow('无法识别');
    });

    test('keeps safe upstream diagnostics without echoing arbitrary response bodies', () => {
        expect(parseVolcengineUpstreamError({
            apiStatusCode: '45000030',
            apiMessage: 'speaker is not allowed',
            body: '{"access_key":"must-not-leak"}',
        })).toEqual({ code: '45000030', message: 'speaker is not allowed' });

        expect(parseVolcengineUpstreamError({
            body: JSON.stringify({ ResponseMetadata: { Error: { Code: 'OperationDenied.InvalidSpeakerID', Message: 'No permission' } } }),
        })).toEqual({ code: 'OperationDenied.InvalidSpeakerID', message: 'No permission' });
    });
});
