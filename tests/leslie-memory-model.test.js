/* eslint-disable playwright/no-conditional-in-test */

import { describe, expect, test } from '@jest/globals';

import {
    MEMORY_MODEL_PROVIDER,
    buildMemoryModelRequest,
    extractMemoryModelText,
    generateMemoryModelResponse,
    getMemoryModelCompletionUrl,
    getMemoryModelModelsUrl,
    normalizeMemoryModelSettings,
    probeMemoryModel,
} from '../public/scripts/extensions/leslie-memory/model.js';

describe('Leslie memory model adapter', () => {
    test('keeps the legacy chat provider as the default', () => {
        const settings = normalizeMemoryModelSettings();

        expect(settings.provider).toBe(MEMORY_MODEL_PROVIDER.CHAT);
        expect(settings.endpoint).toBe('');
        expect(getMemoryModelCompletionUrl({ provider: MEMORY_MODEL_PROVIDER.LOCAL })).toBe('http://127.0.0.1:5001/v1/chat/completions');
    });

    test('normalizes OpenAI-compatible endpoint variants', () => {
        const settings = { provider: MEMORY_MODEL_PROVIDER.OPENAI_COMPATIBLE, endpoint: 'http://localhost:9000/v1/chat/completions', model: 'memory-model' };

        expect(getMemoryModelCompletionUrl(settings)).toBe('http://localhost:9000/v1/chat/completions');
        expect(getMemoryModelModelsUrl(settings)).toBe('http://localhost:9000/v1/models');
    });

    test('provides DeepSeek defaults using the chat completions endpoint', () => {
        const settings = normalizeMemoryModelSettings({ provider: MEMORY_MODEL_PROVIDER.DEEPSEEK });

        expect(settings).toMatchObject({
            provider: MEMORY_MODEL_PROVIDER.DEEPSEEK,
            endpoint: 'https://api.deepseek.com',
            model: 'deepseek-v4-flash',
        });
        expect(getMemoryModelCompletionUrl(settings)).toBe('https://api.deepseek.com/v1/chat/completions');
        expect(getMemoryModelModelsUrl(settings)).toBe('https://api.deepseek.com/v1/models');
    });

    test('builds a low-temperature structured-memory request', () => {
        const request = buildMemoryModelRequest({
            systemPrompt: 'Return JSON only.',
            prompt: [{ role: 'user', content: '{"events":[]}' }],
            responseLength: 1400,
        }, { provider: MEMORY_MODEL_PROVIDER.LOCAL, model: 'peach-local', temperature: 0.9 });

        expect(request).toMatchObject({
            model: 'peach-local',
            max_tokens: 1400,
            temperature: 0.35,
            stream: false,
        });
        expect(request.messages).toEqual([
            { role: 'system', content: 'Return JSON only.' },
            { role: 'user', content: '{"events":[]}' },
        ]);
    });

    test('probes and generates through an independent local endpoint', async () => {
        const calls = [];
        const fetchImpl = async (url, options = {}) => {
            calls.push({ url, options });
            if (options.method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ data: [{ id: 'peach-local' }] }) };
            }
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"events":[]}' } }] }) };
        };
        const settings = {
            provider: MEMORY_MODEL_PROVIDER.LOCAL,
            endpoint: 'http://127.0.0.1:5001',
            model: 'peach-local',
            apiKey: 'test-key',
        };
        let chatGeneratorCalled = false;

        const probe = await probeMemoryModel({ settings, fetchImpl });
        const result = await generateMemoryModelResponse({
            settings,
            request: { systemPrompt: 'JSON only.', prompt: 'memory data', responseLength: 512 },
            generateChat: async () => {
                chatGeneratorCalled = true;
                return 'wrong path';
            },
            fetchImpl,
        });

        expect(probe).toMatchObject({ connected: true, model: 'peach-local' });
        expect(result).toBe('{"events":[]}');
        expect(chatGeneratorCalled).toBe(false);
        expect(calls.map(call => call.url)).toEqual([
            'http://127.0.0.1:5001/v1/models',
            'http://127.0.0.1:5001/v1/chat/completions',
        ]);
        expect(calls[1].options.headers.Authorization).toBe('Bearer test-key');
        expect(JSON.parse(calls[1].options.body).model).toBe('peach-local');
    });

    test('uses the DeepSeek OpenAI chat completions request format', async () => {
        const calls = [];
        const fetchImpl = async (url, options = {}) => {
            calls.push({ url, options });
            if (options.method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ data: [{ id: 'deepseek-v4-flash' }] }) };
            }
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"events":[]}' } }] }) };
        };
        const settings = {
            provider: MEMORY_MODEL_PROVIDER.DEEPSEEK,
            endpoint: 'https://api.deepseek.com/v1',
            model: 'deepseek-v4-flash',
            apiKey: 'test-deepseek-key',
            temperature: 0.8,
        };

        const probe = await probeMemoryModel({ settings, fetchImpl });
        const result = await generateMemoryModelResponse({
            settings,
            request: { systemPrompt: 'JSON only.', prompt: 'memory data', responseLength: 512 },
            generateChat: async () => 'wrong path',
            fetchImpl,
        });
        const body = JSON.parse(calls[1].options.body);

        expect(probe).toMatchObject({ connected: true, model: 'deepseek-v4-flash', provider: MEMORY_MODEL_PROVIDER.DEEPSEEK });
        expect(result).toBe('{"events":[]}');
        expect(calls.map(call => call.url)).toEqual([
            'https://api.deepseek.com/v1/models',
            'https://api.deepseek.com/v1/chat/completions',
        ]);
        expect(calls[1].options.headers.Authorization).toBe('Bearer test-deepseek-key');
        expect(body).toMatchObject({
            model: 'deepseek-v4-flash',
            max_tokens: 512,
            temperature: 0.35,
            top_p: 0.9,
            stream: false,
            thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
        });
        expect(body.messages).toEqual([
            { role: 'system', content: 'JSON only.' },
            { role: 'user', content: 'memory data' },
        ]);
    });

    test('extracts both OpenAI and native completion payloads', () => {
        expect(extractMemoryModelText({ choices: [{ text: 'plain text' }] })).toBe('plain text');
        expect(extractMemoryModelText({ results: [{ text: 'native result' }] })).toBe('native result');
        expect(extractMemoryModelText({ choices: [{ message: { content: [{ type: 'text', text: 'json' }] } }] })).toBe('json');
    });
});
