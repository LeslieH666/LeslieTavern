import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import express from 'express';

import { LeslieMemoryStore } from '../src/leslie-memory/store.js';
import { resolveMemoryUserRoot, router as memoryRouter } from '../src/leslie-memory/router.js';
import { scoreMemoryEvent, selectMemoryEvents } from '../src/leslie-memory/scoring.js';

const STORY_BINDING = {
    storyScopeId: '11111111-1111-4111-8111-111111111111',
    personaId: '22222222-2222-4222-8222-222222222222',
    personaSourceKey: '哥哥.png',
    personaName: '哥哥',
    counterpartId: '33333333-3333-4333-8333-333333333333',
    counterpartType: 'character',
    counterpartSourceKey: '妹妹.png',
    counterpartName: '妹妹',
    confirmed: true,
};

describe('Leslie memory request path', () => {
    test('normalizes SillyTavern relative user roots without touching user data', () => {
        const relativeRoot = path.join('data', 'default-user');
        const request = { user: { directories: { root: relativeRoot } } };

        expect(resolveMemoryUserRoot(request)).toBe(path.resolve(relativeRoot));
    });

    test('preserves an existing absolute user root', () => {
        const absoluteRoot = path.join(os.tmpdir(), 'leslie-existing-user');
        const request = { user: { directories: { root: absoluteRoot } } };

        expect(resolveMemoryUserRoot(request)).toBe(absoluteRoot);
    });

    test('accepts a group ensure request through the existing API route', async () => {
        const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-memory-router-'));
        const app = express();
        app.use(express.json());
        app.use((request, _response, next) => {
            request.user = { directories: { root: temporaryRoot } };
            next();
        });
        app.use('/api/leslie/memory', memoryRouter);
        const server = await new Promise(resolve => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });

        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/leslie/memory/ensure`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chatKey: 'group:group-42::chat-one',
                    characterKey: 'group:group-42',
                    coreSnapshot: { name: 'Test Group' },
                    isGroup: true,
                }),
            });
            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.created).toBe(true);
            expect(result.memory.manifest.chatKey).toBe('group:group-42::chat-one');
            expect(result.memory.state.enabled).toBe(false);
        } finally {
            await new Promise(resolve => server.close(resolve));
            fs.rmSync(temporaryRoot, { recursive: true, force: true });
        }
    });
});

describe('Leslie memory store', () => {
    let temporaryRoot;
    let store;

    beforeEach(() => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-memory-'));
        store = new LeslieMemoryStore(temporaryRoot);
    });

    afterEach(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test('creates an isolated disabled memory with a protected core snapshot', () => {
        const result = store.ensureMemory({
            chatKey: 'character/avatar.png::chat-one',
            characterKey: 'character/avatar.png',
            coreSnapshot: { name: 'Leslie', personality: 'Careful and loyal.' },
        });

        expect(result.created).toBe(true);
        expect(result.memory.state.enabled).toBe(false);
        expect(result.memory.coreSnapshot.personality).toBe('Careful and loyal.');
        expect(fs.existsSync(path.join(temporaryRoot, 'leslie', 'memory', result.memory.manifest.id, 'events.jsonl'))).toBe(true);
    });

    test('binds new memories to one stable Persona story line and rejects another scope', () => {
        const result = store.ensureMemory({
            chatKey: '妹妹.png::主线',
            characterKey: '妹妹.png',
            identityBinding: STORY_BINDING,
        });
        const otherBinding = {
            ...STORY_BINDING,
            storyScopeId: '44444444-4444-4444-8444-444444444444',
            personaId: '55555555-5555-4555-8555-555555555555',
            personaSourceKey: '同学.png',
            personaName: '同学',
        };
        const mismatch = store.ensureMemory({
            memoryId: result.memory.manifest.id,
            chatKey: '妹妹.png::主线',
            characterKey: '妹妹.png',
            identityBinding: otherBinding,
        });

        expect(result.identityStatus).toBe('matched');
        expect(result.memory.manifest.schemaVersion).toBe(2);
        expect(result.memory.manifest.identityBinding.personaName).toBe('哥哥');
        expect(mismatch.identityStatus).toBe('mismatch');
        expect(() => store.assertStoryScope(result.memory.manifest.id, otherBinding.storyScopeId)).toThrow(/different Persona/);
        expect(() => store.assertStoryScope(result.memory.manifest.id, STORY_BINDING.storyScopeId)).not.toThrow();
    });

    test('keeps legacy memories unbound until an explicit confirmed binding', () => {
        const result = store.ensureMemory({ chatKey: 'legacy-chat', characterKey: '妹妹.png' });
        expect(result.identityStatus).toBe('unbound');
        expect(result.memory.manifest.identityBinding).toBeNull();
        expect(() => store.bindIdentity(result.memory.manifest.id, STORY_BINDING)).toThrow(/explicit confirmation/);

        const manifest = store.bindIdentity(result.memory.manifest.id, STORY_BINDING, { confirmed: true });
        expect(manifest.identityBinding.personaId).toBe(STORY_BINDING.personaId);
        expect(fs.readdirSync(path.join(temporaryRoot, 'leslie', 'memory', result.memory.manifest.id, 'history'))
            .some(file => file.startsWith('manifest-'))).toBe(true);
    });

    test('clones a bound memory when a chat branch receives a new story-line identity', () => {
        const main = store.ensureMemory({
            chatKey: '妹妹.png::主线',
            characterKey: '妹妹.png',
            identityBinding: STORY_BINDING,
        });
        const branchBinding = {
            ...STORY_BINDING,
            storyScopeId: '66666666-6666-4666-8666-666666666666',
        };
        const branch = store.ensureMemory({
            memoryId: main.memory.manifest.id,
            chatKey: '妹妹.png::分支',
            parentChatKey: '妹妹.png::主线',
            characterKey: '妹妹.png',
            isBranch: true,
            branchPointMessageId: 4,
            identityBinding: branchBinding,
        });

        expect(branch.branched).toBe(true);
        expect(branch.identityStatus).toBe('matched');
        expect(branch.memory.manifest.id).not.toBe(main.memory.manifest.id);
        expect(branch.memory.manifest.identityBinding.storyScopeId).toBe(branchBinding.storyScopeId);
    });

    test('stores a group chat in the same schema while preserving participant attribution', () => {
        const result = store.ensureMemory({
            chatKey: 'group:group-42::shared-chat',
            characterKey: 'group:group-42',
            coreSnapshot: {
                name: '旧画室里的香夜梨与雅雪',
                description: '[香夜梨]\n冷淡而温柔。\n\n[雅雪]\n开朗而敏锐。',
            },
            isGroup: true,
        });
        const [event] = store.upsertEvents(result.memory.manifest.id, [{
            summary: '雅雪发现香夜梨把旧画室当作安稳的落脚点。',
            level: 'B',
            participants: ['香夜梨', '雅雪'],
            source: [{ messageId: 7 }],
        }], { sourceType: 'ai' });

        expect(result.created).toBe(true);
        expect(result.memory.manifest.chatKey).toBe('group:group-42::shared-chat');
        expect(result.memory.manifest.characterKey).toBe('group:group-42');
        expect(result.memory.manifest).not.toHaveProperty('isGroup');
        expect(event.participants).toEqual(['香夜梨', '雅雪']);
        expect(result.memory.state.enabled).toBe(false);
    });

    test('keeps AI A memories pending until explicitly approved', () => {
        const { memory } = store.ensureMemory({ chatKey: 'chat', characterKey: 'character' });
        const [event] = store.upsertEvents(memory.manifest.id, [{
            summary: 'The character decided to trust the user after a rescue.',
            level: 'A',
            source: [{ messageId: 12, swipeId: 0, hash: 'abc' }],
        }], { sourceType: 'ai' });

        expect(event.status).toBe('pending');
        expect(event.approved).toBe(false);

        const approved = store.patchEvent(memory.manifest.id, event.id, { status: 'active', approved: true });
        expect(approved.status).toBe('active');
        expect(approved.approved).toBe(true);
    });

    test('reinforces repeated AI memories instead of creating duplicates', () => {
        const { memory } = store.ensureMemory({ chatKey: 'chat', characterKey: 'character' });
        const [first] = store.upsertEvents(memory.manifest.id, [{
            summary: 'They promised to return before dawn.',
            level: 'B',
            source: [{ messageId: 3 }],
        }], { sourceType: 'ai' });
        const [repeated] = store.upsertEvents(memory.manifest.id, [{
            summary: 'They promised to return before dawn!',
            level: 'B',
            source: [{ messageId: 9 }],
        }], { sourceType: 'ai' });

        expect(repeated.id).toBe(first.id);
        expect(repeated.reinforcement).toBe(2);
        expect(repeated.source.map(item => item.messageId)).toEqual([3, 9]);
        expect(store.readEvents(memory.manifest.id)).toHaveLength(1);
    });

    test('invalidates memories that depend on edited or swiped messages', () => {
        const { memory } = store.ensureMemory({ chatKey: 'chat', characterKey: 'character' });
        const [event] = store.upsertEvents(memory.manifest.id, [{
            summary: 'A promise was made.',
            level: 'B',
            source: [{ messageId: 4, swipeId: 0, hash: 'old' }],
        }]);

        const affected = store.invalidateByMessageIds(memory.manifest.id, [4], 'Message was edited.');
        expect(affected).toHaveLength(1);
        expect(store.readEvents(memory.manifest.id).find(item => item.id === event.id).status).toBe('invalid');
    });

    test('versions and restores the growth state', () => {
        const { memory } = store.ensureMemory({ chatKey: 'chat', characterKey: 'character' });
        const id = memory.manifest.id;
        const first = store.updateState(id, { enabled: true, growth: { relationship: 'Cautious allies.' } });
        const second = store.updateState(id, { growth: { relationship: 'Trusted companions.' } });

        expect(first.revision).toBe(1);
        expect(second.revision).toBe(2);
        expect(store.listHistory(id).map(item => item.revision)).toEqual(expect.arrayContaining([0, 1]));

        const restored = store.restoreState(id, 1);
        expect(restored.relationship).toBeUndefined();
        expect(restored.growth.relationship).toBe('Cautious allies.');
        expect(restored.revision).toBe(3);
    });

    test('creates a separate branch and drops events after the branch point', () => {
        const { memory } = store.ensureMemory({ chatKey: 'main-chat', characterKey: 'character' });
        store.upsertEvents(memory.manifest.id, [
            { summary: 'An early promise.', level: 'A', approved: true, source: [{ messageId: 2 }] },
            { summary: 'A later betrayal.', level: 'A', approved: true, source: [{ messageId: 20 }] },
        ]);

        const branch = store.cloneMemory(memory.manifest.id, { chatKey: 'branch-chat', characterKey: 'character', branchPointMessageId: 5 });
        expect(branch.manifest.id).not.toBe(memory.manifest.id);
        expect(branch.manifest.parentMemoryId).toBe(memory.manifest.id);
        expect(branch.events.map(event => event.summary)).toEqual(['An early promise.']);
    });

    test('keeps the same memory on rename and clones only an explicit branch', () => {
        const { memory } = store.ensureMemory({ chatKey: 'old-name', characterKey: 'character' });
        const renamed = store.ensureMemory({ memoryId: memory.manifest.id, chatKey: 'new-name', characterKey: 'character' });
        const branched = store.ensureMemory({
            memoryId: memory.manifest.id,
            chatKey: 'branch-name',
            characterKey: 'character',
            branchPointMessageId: 3,
            isBranch: true,
            parentChatKey: 'new-name',
        });

        expect(renamed.memory.manifest.id).toBe(memory.manifest.id);
        expect(renamed.branched).toBe(false);
        expect(renamed.memory.manifest.chatKey).toBe('new-name');
        expect(branched.memory.manifest.id).not.toBe(memory.manifest.id);
        expect(branched.branched).toBe(true);
    });

    test('rebinds a renamed branch instead of creating a nested clone', () => {
        const { memory } = store.ensureMemory({ chatKey: 'main-chat', characterKey: 'character' });
        const { memory: branch } = store.ensureMemory({
            memoryId: memory.manifest.id,
            chatKey: 'branch-chat',
            characterKey: 'character',
            isBranch: true,
            parentChatKey: 'main-chat',
        });
        const renamed = store.ensureMemory({
            memoryId: branch.manifest.id,
            chatKey: 'renamed-branch',
            characterKey: 'character',
            isBranch: true,
            parentChatKey: 'main-chat',
        });

        expect(renamed.memory.manifest.id).toBe(branch.manifest.id);
        expect(renamed.branched).toBe(false);
        expect(renamed.memory.manifest.chatKey).toBe('renamed-branch');
    });
});

describe('Leslie memory selection', () => {
    test('lets a relevant older memory outrank an unrelated recent detail', () => {
        const events = [
            {
                id: 'old', summary: 'The spare key is hidden below the flowerpot.', level: 'C', status: 'active',
                importance: 25, confidence: 1, reinforcement: 1, source: [{ messageId: 1 }], tags: ['key', 'flowerpot'], participants: [],
            },
            {
                id: 'new', summary: 'They ate noodles for lunch.', level: 'C', status: 'active',
                importance: 25, confidence: 1, reinforcement: 1, source: [{ messageId: 99 }], tags: ['lunch'], participants: [],
            },
        ];

        const selected = selectMemoryEvents(events, { query: 'Where did we hide the flowerpot key?', currentMessageId: 100, maximum: 1 });
        expect(selected[0].event.id).toBe('old');
        expect(scoreMemoryEvent(events[0], { query: 'flowerpot key', currentMessageId: 100 })).toBeGreaterThan(scoreMemoryEvent(events[1], { query: 'flowerpot key', currentMessageId: 100 }));
    });

    test('forgets stale B and C details unless the current conversation recalls them', () => {
        const events = [
            {
                id: 'stale-c', summary: 'The spare key is below the flowerpot.', level: 'C', status: 'active',
                importance: 30, confidence: 1, reinforcement: 1, source: [{ messageId: 1 }], tags: ['key'], participants: [],
            },
            {
                id: 'stale-b', summary: 'They planned a winter journey.', level: 'B', status: 'active',
                importance: 60, confidence: 1, reinforcement: 1, source: [{ messageId: 1 }], tags: ['journey'], participants: [],
            },
        ];
        const settings = { cDecayTurns: 8, bDecayTurns: 40 };

        expect(selectMemoryEvents(events, { query: 'What shall we eat?', currentMessageId: 100, settings })).toEqual([]);
        expect(selectMemoryEvents(events, { query: 'Where is the flowerpot key?', currentMessageId: 100, settings }).map(item => item.event.id)).toContain('stale-c');
        expect(selectMemoryEvents(events, { query: 'Should we resume the winter journey?', currentMessageId: 100, settings }).map(item => item.event.id)).toContain('stale-b');
    });
});
