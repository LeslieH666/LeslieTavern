import {
    LESLIE_LOCAL_MODEL,
    getLeslieLocalRuntime,
    getLeslieLocalRuntimeKeys,
    getLeslieLocalSettings,
} from '../public/scripts/leslie-local-model-core.js';

describe('Leslie local model setup', () => {
    test('exposes both supported local runtimes', () => {
        expect(getLeslieLocalRuntimeKeys()).toEqual(['koboldcpp', 'llamacpp']);
        expect(getLeslieLocalRuntime('koboldcpp').endpoint).toBe('http://127.0.0.1:5001');
        expect(getLeslieLocalRuntime('llamacpp').endpoint).toBe('http://127.0.0.1:8080');
    });

    test('falls back to KoboldCpp for unknown runtimes', () => {
        expect(getLeslieLocalRuntime('unknown')).toEqual(getLeslieLocalRuntime('koboldcpp'));
    });

    test('returns conservative 8GB-friendly generation defaults', () => {
        const settings = getLeslieLocalSettings('koboldcpp');
        expect(settings.context).toBe(8192);
        expect(settings.responseTokens).toBe(512);
        expect(settings.generation.streaming).toBe(true);
        expect(settings.generation.min_p).toBe(0.05);
        expect(LESLIE_LOCAL_MODEL.modelPath).toContain('Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf');
    });
});
