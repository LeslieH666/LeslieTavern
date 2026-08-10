import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { LeslieIdentityStore } from '../src/leslie-identity/store.js';
import {
    buildMemoryIdentityBinding,
    buildStoryScopeRequest,
    createPersonaDescriptor,
    getMemoryMetadataReference,
    upsertMemoryMetadata,
} from '../public/scripts/extensions/leslie-memory/identity-context.js';

function storyRequest(personaSourceKey = '哥哥.png', personaLabel = '哥哥') {
    return {
        persona: { sourceKey: personaSourceKey, label: personaLabel },
        counterpart: { type: 'character', sourceKey: '妹妹.png', label: '妹妹' },
        chat: { chatKey: '妹妹.png::主线', parentChatKey: null },
    };
}

describe('Leslie identity registry', () => {
    let temporaryRoot;
    let store;

    beforeEach(() => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-identity-'));
        store = new LeslieIdentityStore(temporaryRoot);
    });

    afterEach(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test('creates stable owner, Persona, character and story-line identities', () => {
        const first = store.resolveStoryScope(storyRequest());
        const second = store.resolveStoryScope(storyRequest());

        expect(first.owner.type).toBe('owner');
        expect(second.owner.id).toBe(first.owner.id);
        expect(second.persona.id).toBe(first.persona.id);
        expect(second.counterpart.id).toBe(first.counterpart.id);
        expect(second.storyScope.id).toBe(first.storyScope.id);
    });

    test('keeps the same Persona after an explicitly confirmed rename or avatar change', () => {
        const first = store.resolveStoryScope(storyRequest());
        const changed = store.resolveStoryScope({
            ...storyRequest('哥哥-新头像.png', '悠'),
            existingStoryScopeId: first.storyScope.id,
            persona: { id: first.persona.id, sourceKey: '哥哥-新头像.png', label: '悠' },
        });

        expect(changed.persona.id).toBe(first.persona.id);
        expect(changed.persona.sourceAliases).toContain('哥哥.png');
        expect(changed.persona.labelHistory).toContain('哥哥');
        expect(changed.storyScope.id).toBe(first.storyScope.id);
        expect(fs.readdirSync(path.join(temporaryRoot, 'leslie', 'identity', 'history')).length).toBeGreaterThan(0);
    });

    test('creates a different story line for a different Persona', () => {
        const brother = store.resolveStoryScope(storyRequest());
        const classmate = store.resolveStoryScope(storyRequest('同学.png', '同学'));

        expect(classmate.persona.id).not.toBe(brother.persona.id);
        expect(classmate.storyScope.id).not.toBe(brother.storyScope.id);
    });

    test('resolves a Persona and an audience roster in one atomic registry update', () => {
        const result = store.resolveEntities([
            { type: 'persona', sourceKey: '哥哥.png', label: '哥哥' },
            { type: 'character', sourceKey: '妹妹.png', label: '妹妹' },
            { type: 'character', sourceKey: '同学.png', label: '同学' },
        ]);
        const repeated = store.resolveEntities([
            { type: 'persona', sourceKey: '哥哥.png', label: '哥哥' },
            { type: 'character', sourceKey: '妹妹.png', label: '妹妹' },
        ]);

        expect(result.entities).toHaveLength(3);
        expect(repeated.entities[0].id).toBe(result.entities[0].id);
        expect(repeated.entities[1].id).toBe(result.entities[1].id);
        expect(repeated.registryRevision).toBe(result.registryRevision);
    });
});

describe('Leslie browser identity routing', () => {
    test('builds explicit Persona and counterpart requests', () => {
        const context = { name1: '哥哥', chatMetadata: { persona: '哥哥.png' } };
        const persona = createPersonaDescriptor(context, { avatarId: '哥哥.png', name: '哥哥' });
        const identity = {
            persona,
            isGroup: false,
            characterKey: '妹妹.png',
            displayName: '妹妹',
            chatKey: '妹妹.png::主线',
            parentChatKey: null,
            isBranch: false,
        };
        const request = buildStoryScopeRequest(identity);

        expect(persona.lockedToChat).toBe(true);
        expect(request.persona.sourceKey).toBe('哥哥.png');
        expect(request.counterpart).toEqual({ type: 'character', sourceKey: '妹妹.png', label: '妹妹' });
    });

    test('keeps separate metadata bindings for two Personas', () => {
        const brotherBinding = {
            storyScopeId: '11111111-1111-4111-8111-111111111111',
            personaId: '22222222-2222-4222-8222-222222222222',
            personaSourceKey: '哥哥.png',
            personaName: '哥哥',
        };
        const classmateBinding = {
            storyScopeId: '33333333-3333-4333-8333-333333333333',
            personaId: '44444444-4444-4444-8444-444444444444',
            personaSourceKey: '同学.png',
            personaName: '同学',
        };
        const first = upsertMemoryMetadata({}, {
            memoryId: '55555555-5555-4555-8555-555555555555',
            chatKey: 'chat',
            identityBinding: brotherBinding,
        });
        const second = upsertMemoryMetadata(first, {
            memoryId: '66666666-6666-4666-8666-666666666666',
            chatKey: 'chat',
            identityBinding: classmateBinding,
        });

        expect(second.bindings).toHaveLength(2);
        expect(getMemoryMetadataReference(second, '哥哥.png').memoryId).toBe('55555555-5555-4555-8555-555555555555');
        expect(getMemoryMetadataReference(second, '同学.png').memoryId).toBe('66666666-6666-4666-8666-666666666666');
        expect(getMemoryMetadataReference(second, '陌生人.png').kind).toBe('different-persona');
    });

    test('preserves an unbound legacy archive when a new Persona archive is added', () => {
        const legacy = { id: '77777777-7777-4777-8777-777777777777', chatKey: 'old-chat', schemaVersion: 1 };
        const next = upsertMemoryMetadata(legacy, {
            memoryId: '88888888-8888-4888-8888-888888888888',
            chatKey: 'new-chat',
            identityBinding: {
                storyScopeId: '11111111-1111-4111-8111-111111111111',
                personaId: '22222222-2222-4222-8222-222222222222',
                personaSourceKey: '哥哥.png',
                personaName: '哥哥',
            },
        });

        expect(next.legacyUnbound.memoryId).toBe(legacy.id);
        expect(next.id).toBe('88888888-8888-4888-8888-888888888888');
    });

    test('creates a server-ready binding only from resolved stable identities', () => {
        const binding = buildMemoryIdentityBinding({
            storyScope: { id: '11111111-1111-4111-8111-111111111111' },
            persona: { id: '22222222-2222-4222-8222-222222222222', sourceKey: '哥哥.png', label: '哥哥' },
            counterpart: { id: '33333333-3333-4333-8333-333333333333', type: 'character', sourceKey: '妹妹.png', label: '妹妹' },
        });

        expect(binding.domain).toBe('story');
        expect(binding.personaName).toBe('哥哥');
        expect(binding.counterpartName).toBe('妹妹');
        expect(binding.confirmed).toBe(true);
    });
});
