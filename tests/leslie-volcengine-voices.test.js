import { describe, expect, test } from '@jest/globals';

import { normalizeVolcengineVoiceId, VOLCENGINE_BUILTIN_VOICES } from '../public/scripts/leslie-volcengine-voices.js';
import { parseVolcengineVoiceCatalog, readVolcengineVoiceDocument } from '../src/leslie-tts/volcengine-voices.js';

describe('Leslie Volcengine voice catalog', () => {
    test('parses TTS 1.0 and 2.0 voices while excluding real-time speakers', () => {
        const markdown = `
## 豆包语音合成模型2.0 音色列表
| 场景 | 音色名称 | voice_type | 语种 |
| --- | --- | --- | --- |
| 通用 | 测试音色 | zh_female_testvoice_uranus_bigtts | 中文/英文 |
### 情感参数
| 场景 | 音色名称 | voice_type | 语种 |
| --- | --- | --- | --- |
| 通用 | 小何 | zh_female_xiaohe_uranus_bigtts | 中文 |
## 端到端实时语音大模型 音色列表
| 音色名称 | voice_type |
| --- | --- |
| 实时音色 | real_time_voice |
## 豆包语音合成模型1.0 音色列表
| 分类 | 音色名称 | 音色ID | 语言 |
| --- | --- | --- | --- |
| 精品 | 灿灿 | zh_female_cancan_mars_bigtts | 中文 |
`;
        const voices = parseVolcengineVoiceCatalog(markdown);
        expect(voices).toHaveLength(3);
        expect(voices.find(voice => voice.voice_id.includes('testvoice'))).toMatchObject({ model: '2.0', resource_id: 'seed-tts-2.0' });
        expect(voices.find(voice => voice.voice_id.includes('cancan'))).toMatchObject({ model: '1.0', resource_id: 'volc.service_type.10029' });
        expect(voices.some(voice => voice.voice_id === 'real_time_voice')).toBe(false);
    });

    test('reads only the fixed public document response shape', () => {
        const document = readVolcengineVoiceDocument({ Result: { Content: 'x'.repeat(101), UpdatedTime: '2026-08-03' } });
        expect(document.updatedAt).toBe('2026-08-03');
        expect(() => readVolcengineVoiceDocument({ Result: { Content: 'too short' } })).toThrow();
    });

    test.each([
        ['zh_female_xiaohe_uranus_bigtts', 'zh_female_xiaohe_uranus_bigtts'],
        ['"zh_female_xiaohe_uranus_bigtts"', 'zh_female_xiaohe_uranus_bigtts'],
        ['voice_type=zh_female_xiaohe_uranus_bigtts', 'zh_female_xiaohe_uranus_bigtts'],
        ['{"voice_type":"zh_female_xiaohe_uranus_bigtts"}', 'zh_female_xiaohe_uranus_bigtts'],
        ['speaker_id: S_xxx_123', 'S_xxx_123'],
    ])('imports common custom voice formats: %s', (input, expected) => {
        expect(normalizeVolcengineVoiceId(input)).toBe(expected);
    });

    test('rejects ambiguous free text', () => {
        expect(normalizeVolcengineVoiceId('first_voice and second_voice')).toBe('');
    });

    test('offline fallback voices carry their own resource IDs', () => {
        expect(VOLCENGINE_BUILTIN_VOICES.length).toBeGreaterThan(0);
        expect(VOLCENGINE_BUILTIN_VOICES.every(voice => voice.resource_id === 'seed-tts-2.0')).toBe(true);
    });
});
