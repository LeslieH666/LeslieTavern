import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import express from 'express';

import { router as momentsRouter } from '../src/leslie-moments/router.js';
import { LeslieMomentsStore } from '../src/leslie-moments/store.js';
import {
    describeMomentVisibility,
    filterMomentPosts,
    formatMomentTime,
} from '../public/scripts/extensions/leslie-moments/model.js';

const PERSONA = {
    entityId: '11111111-1111-4111-8111-111111111111',
    type: 'persona',
    sourceKey: '哥哥.png',
    label: '哥哥',
    avatar: '/persona.png',
};

const SISTER = {
    entityId: '22222222-2222-4222-8222-222222222222',
    type: 'character',
    sourceKey: '妹妹.png',
    label: '妹妹',
    avatar: '/sister.png',
};

const CLASSMATE = {
    entityId: '33333333-3333-4333-8333-333333333333',
    type: 'character',
    sourceKey: '同学.png',
    label: '同学',
    avatar: '/classmate.png',
};

function realityDraft(overrides = {}) {
    return {
        mode: 'reality',
        content: '今天第一次把现实里的小事分享到这里。',
        author: PERSONA,
        visibility: { type: 'all', targets: [] },
        ...overrides,
    };
}

describe('Leslie moments store', () => {
    let temporaryRoot;
    let store;

    beforeEach(() => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-moments-'));
        store = new LeslieMomentsStore(temporaryRoot);
    });

    afterEach(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test('does not write an empty timeline merely because the page was opened', () => {
        expect(store.listPosts().posts).toEqual([]);
        expect(fs.existsSync(path.join(temporaryRoot, 'leslie', 'moments', 'timeline.json'))).toBe(false);
    });

    test('creates a versioned local post and preserves an empty history snapshot', () => {
        const post = store.createPost(realityDraft());
        const timeline = store.listPosts();

        expect(post.mode).toBe('reality');
        expect(post.author.entityId).toBe(PERSONA.entityId);
        expect(timeline.revision).toBe(1);
        expect(timeline.posts).toHaveLength(1);
        expect(fs.readdirSync(path.join(temporaryRoot, 'leslie', 'moments', 'history'))).toHaveLength(1);
    });

    test('filters selected posts for the intended role without hiding all-role posts', () => {
        store.createPost(realityDraft());
        store.createPost(realityDraft({
            content: '这条只给妹妹看。',
            visibility: { type: 'selected', targets: [SISTER] },
        }));

        expect(store.listPosts({ viewerEntityId: SISTER.entityId }).posts).toHaveLength(2);
        expect(store.listPosts({ viewerEntityId: CLASSMATE.entityId }).posts).toHaveLength(1);
    });

    test('requires a story post to target exactly its bound story counterpart', () => {
        expect(() => store.createPost(realityDraft({
            mode: 'story',
            content: '剧情里今天正式入学。',
            storyBinding: {
                storyScopeId: '44444444-4444-4444-8444-444444444444',
                personaId: PERSONA.entityId,
                counterpartId: SISTER.entityId,
                counterpartType: 'character',
                chatKey: '妹妹.png::主线',
                personaName: '哥哥',
                counterpartName: '妹妹',
            },
            visibility: { type: 'selected', targets: [CLASSMATE] },
        }))).toThrow('bound character');
    });

    test('edits only through the publishing Persona and keeps the mode immutable', () => {
        const post = store.createPost(realityDraft({
            visibility: { type: 'selected', targets: [SISTER] },
        }));
        const edited = store.updatePost(post.id, {
            authorEntityId: PERSONA.entityId,
            content: '修改后的现实分享。',
            visibility: { type: 'all', targets: [] },
        });

        expect(edited.content).toBe('修改后的现实分享。');
        expect(edited.mode).toBe('reality');
        expect(edited.revision).toBe(2);
        expect(() => store.updatePost(post.id, {
            authorEntityId: '55555555-5555-4555-8555-555555555555',
            content: '不应成功',
            visibility: { type: 'all', targets: [] },
        })).toThrow('Only the Persona');
    });

    test('archives and restores instead of permanently deleting posts', () => {
        const post = store.createPost(realityDraft());
        store.setPostStatus(post.id, 'archived', PERSONA.entityId);

        expect(store.listPosts().posts).toEqual([]);
        expect(store.listPosts({ includeArchived: true }).posts[0].status).toBe('archived');

        store.setPostStatus(post.id, 'active', PERSONA.entityId);
        expect(store.listPosts().posts[0].status).toBe('active');
        expect(fs.readdirSync(path.join(temporaryRoot, 'leslie', 'moments', 'history')).length).toBeGreaterThanOrEqual(3);
    });

    test('stops on corrupt data instead of silently replacing it', () => {
        fs.mkdirSync(path.dirname(store.timelinePath), { recursive: true });
        fs.writeFileSync(store.timelinePath, '{broken', 'utf8');

        expect(() => store.listPosts()).toThrow('Could not read');
        expect(fs.readFileSync(store.timelinePath, 'utf8')).toBe('{broken');
    });
});

describe('Leslie moments API', () => {
    let temporaryRoot;
    let server;
    let baseUrl;

    beforeEach(async () => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-moments-router-'));
        const app = express();
        app.use(express.json());
        app.use((request, _response, next) => {
            request.user = { directories: { root: temporaryRoot } };
            next();
        });
        app.use('/api/leslie/moments', momentsRouter);
        server = await new Promise(resolve => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        baseUrl = `http://127.0.0.1:${server.address().port}/api/leslie/moments`;
    });

    afterEach(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test('resolves stable identities while publishing and returns the local timeline', async () => {
        const createResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reality',
                content: 'API 发布验收。',
                author: { sourceKey: '哥哥.png', label: '哥哥' },
                visibility: {
                    type: 'selected',
                    targets: [{ type: 'character', sourceKey: '妹妹.png', label: '妹妹' }],
                },
            }),
        });
        const created = await createResponse.json();
        const listResponse = await fetch(baseUrl);
        const timeline = await listResponse.json();

        expect(createResponse.status).toBe(201);
        expect(created.post.author.entityId).toMatch(/^[0-9a-f-]{36}$/);
        expect(created.post.visibility.targets[0].label).toBe('妹妹');
        expect(timeline.posts[0].content).toBe('API 发布验收。');
    });
});

describe('Leslie moments browser model', () => {
    test('describes visibility without exposing internal ids', () => {
        expect(describeMomentVisibility({ type: 'all' })).toBe('所有角色可见');
        expect(describeMomentVisibility({ type: 'selected', targets: [SISTER, CLASSMATE] })).toBe('仅 妹妹、同学 可见');
    });

    test('filters modes and formats recent timestamps', () => {
        const now = new Date('2026-08-05T12:00:00.000Z');
        const posts = [
            { id: '1', mode: 'reality', status: 'active', createdAt: '2026-08-05T11:59:00.000Z' },
            { id: '2', mode: 'aside', status: 'archived', createdAt: '2026-08-05T11:58:00.000Z' },
        ];

        expect(filterMomentPosts(posts, { mode: 'reality' }).map(post => post.id)).toEqual(['1']);
        expect(filterMomentPosts(posts, { includeArchived: true })).toHaveLength(2);
        expect(formatMomentTime('2026-08-05T11:59:00.000Z', now)).toBe('1 分钟前');
    });
});
