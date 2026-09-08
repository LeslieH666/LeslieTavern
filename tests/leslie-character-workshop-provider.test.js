import { jest } from '@jest/globals';
import {
    WORKSHOP_PROVIDER,
    buildLocalChatCompletionRequest,
    extractLocalCompletionText,
    getLocalChatCompletionUrl,
    getLocalResponseTokenBudget,
    getWorkshopProviderLabel,
    probeLocalWorkshopProvider,
} from '../public/scripts/leslie-character-workshop/provider.js';

describe('Leslie character workshop providers', () => {
    test('keeps the existing chat provider and exposes the local provider', () => {
        expect(getWorkshopProviderLabel(WORKSHOP_PROVIDER.CHAT)).toContain('当前聊天 API');
        expect(getWorkshopProviderLabel(WORKSHOP_PROVIDER.LOCAL)).toContain('Peach 2.0');
    });

    test('builds an OpenAI-compatible local request with an 8K context budget', () => {
        const request = buildLocalChatCompletionRequest({
            systemPrompt: '系统规则',
            prompt: '请返回一个角色卡 JSON。',
            responseLength: 5200,
        }, {
            context: 8192,
            responseTokens: 512,
            modelName: 'Peach test',
            endpoint: 'http://127.0.0.1:5001',
            generation: { temp: 0.8, top_p: 0.9, top_k: 40, min_p: 0.05, rep_pen: 1.1, rep_pen_range: 4096 },
        });

        expect(request.model).toBe('Peach test');
        expect(request.messages).toHaveLength(2);
        expect(request.stream).toBe(false);
        expect(request.stop).toEqual(['</leslie-json>']);
        expect(request.max_tokens).toBeLessThanOrEqual(3072);
        expect(request.temperature).toBe(0.45);
        expect(getLocalChatCompletionUrl({ endpoint: 'http://127.0.0.1:5001/' })).toBe('http://127.0.0.1:5001/v1/chat/completions');
    });

    test('does not allow a requested response to exceed remaining context', () => {
        const budget = getLocalResponseTokenBudget({ systemPrompt: '系统'.repeat(100), prompt: '提示'.repeat(100), responseLength: 5000 }, {
            context: 600,
            responseTokens: 512,
        });
        expect(budget).toBe(256);
    });

    test('extracts both KoboldCpp OpenAI and native completion responses', () => {
        expect(extractLocalCompletionText({ choices: [{ message: { content: '  {"ok":true}  ' } }] })).toContain('ok');
        expect(extractLocalCompletionText({ results: [{ text: '<leslie-json>{"ok":true}</leslie-json>' }] })).toContain('leslie-json');
        expect(() => extractLocalCompletionText({ choices: [] })).toThrow('空内容');
    });

    test('probes the local model without touching the chat API settings', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: [{ id: 'koboldcpp/Peach-test' }] }),
        });
        const result = await probeLocalWorkshopProvider({
            fetchImpl,
            settings: { endpoint: 'http://127.0.0.1:5001' },
        });
        expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:5001/v1/models', expect.objectContaining({ method: 'GET' }));
        expect(result).toMatchObject({ connected: true, model: 'koboldcpp/Peach-test' });
    });
});
