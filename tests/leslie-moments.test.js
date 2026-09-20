import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';

import { router as momentsRouter } from '../src/leslie-moments/router.js';
import {
    getMomentsActivityEnthusiasmProfile,
    LeslieMomentsActivityStore,
} from '../src/leslie-moments/activity-store.js';
import { LeslieMomentsStore } from '../src/leslie-moments/store.js';
import { LeslieMomentsMemoryStore } from '../src/leslie-moments/memory-store.js';
import { LeslieMomentsSettingsStore } from '../src/leslie-moments/settings-store.js';
import {
    describeMomentVisibility,
    filterMomentPosts,
    formatMomentTime,
    getMomentEnthusiasmProfile,
    normalizeLeslieMomentsSettings,
} from '../public/scripts/extensions/leslie-moments/model.js';
import { buildMomentsPromptContext } from '../public/scripts/extensions/leslie-moments/memory-context.js';

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

    test('allows every local user to delete and restore any Persona or AI post without changing its original text', () => {
        const post = store.createPost(realityDraft());
        const archived = store.setPostStatus(post.id, 'archived');
        const restored = store.setPostStatus(post.id, 'active');

        expect(archived.content).toBe(post.content);
        expect(restored.content).toBe(post.content);
        expect(restored.author).toEqual(post.author);
    });

    test('migrates a v1 timeline only after preserving the complete source file', () => {
        const post = store.createPost(realityDraft());
        const timeline = store.readTimeline();
        timeline.schemaVersion = 1;
        delete timeline.posts[0].origin;
        delete timeline.posts[0].sourceContext;
        fs.writeFileSync(store.timelinePath, `${JSON.stringify(timeline, null, 4)}\n`, 'utf8');

        const migrated = store.readTimeline();
        const backups = fs.readdirSync(store.migrationDirectory);

        expect(migrated.schemaVersion).toBe(2);
        expect(migrated.posts[0].content).toBe(post.content);
        expect(migrated.posts[0].createdAt).toBe(post.createdAt);
        expect(migrated.posts[0].origin).toBe('user');
        expect(backups.some(name => name.startsWith('timeline-v1-'))).toBe(true);
    });

    test('stops on corrupt data instead of silently replacing it', () => {
        fs.mkdirSync(path.dirname(store.timelinePath), { recursive: true });
        fs.writeFileSync(store.timelinePath, '{broken', 'utf8');

        expect(() => store.listPosts()).toThrow('Could not read');
        expect(fs.readFileSync(store.timelinePath, 'utf8')).toBe('{broken');
    });
});

describe('Leslie moments background activity store', () => {
    let temporaryRoot;
    let moments;
    let activity;

    beforeEach(() => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-moments-activity-'));
        moments = new LeslieMomentsStore(temporaryRoot);
        activity = new LeslieMomentsActivityStore(temporaryRoot);
    });

    afterEach(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test('does not create activity files merely because status was read', () => {
        expect(activity.getStatus().pendingCount).toBe(0);
        expect(fs.existsSync(activity.activityPath)).toBe(false);
        expect(fs.existsSync(activity.queuePath)).toBe(false);
    });

    test('records a genuine read without changing the original timeline', () => {
        const post = moments.createPost(realityDraft());
        const timelineBefore = fs.readFileSync(moments.timelinePath, 'utf8');
        activity.planPost(post, [SISTER], {
            now: '2026-09-17T01:00:00.000Z',
            random: () => 0,
        });
        const claim = activity.claimJob(moments.readTimeline().posts, {
            now: '2026-09-17T01:02:00.000Z',
        });

        expect(claim.job.actor.label).toBe('妹妹');
        activity.completeJob(claim.job.id, { action: 'read', comment: '' }, {
            now: '2026-09-17T01:02:10.000Z',
        });
        const decorated = activity.decoratePosts([post])[0];

        expect(decorated.readReceipts).toHaveLength(1);
        expect(decorated.reactions.likes).toHaveLength(0);
        expect(decorated.reactions.comments).toHaveLength(0);
        expect(fs.readFileSync(moments.timelinePath, 'utf8')).toBe(timelineBefore);
    });

    test('completes a comment idempotently and limits a post to three scheduled roles', () => {
        const post = moments.createPost(realityDraft());
        const fourth = { ...CLASSMATE, entityId: '44444444-4444-4444-8444-444444444444', sourceKey: '第四人.png', label: '第四人' };
        const fifth = { ...CLASSMATE, entityId: '55555555-5555-4555-8555-555555555555', sourceKey: '第五人.png', label: '第五人' };
        const planned = activity.planPost(post, [SISTER, CLASSMATE, fourth, fifth], {
            now: '2026-09-17T01:00:00.000Z',
            random: () => 0,
        });
        expect(planned.jobs).toHaveLength(3);

        const claim = activity.claimJob(moments.readTimeline().posts, {
            now: '2026-09-17T01:02:00.000Z',
        });
        activity.completeJob(claim.job.id, { action: 'comment', comment: '今天看起来很开心。' }, {
            now: '2026-09-17T01:02:10.000Z',
        });
        activity.completeJob(claim.job.id, { action: 'comment', comment: '今天看起来很开心。' }, {
            now: '2026-09-17T01:02:11.000Z',
        });

        const decorated = activity.decoratePosts([post])[0];
        expect(decorated.readReceipts).toHaveLength(1);
        expect(decorated.reactions.comments).toHaveLength(1);
        expect(decorated.reactions.comments[0].content).toBe('今天看起来很开心。');
    });

    test('hides old receipts after an edit and cancels obsolete jobs', () => {
        const post = moments.createPost(realityDraft());
        activity.planPost(post, [SISTER], {
            now: '2026-09-17T01:00:00.000Z',
            random: () => 0,
        });
        const claim = activity.claimJob(moments.readTimeline().posts, {
            now: '2026-09-17T01:02:00.000Z',
        });
        activity.completeJob(claim.job.id, { action: 'like', comment: '' }, {
            now: '2026-09-17T01:02:10.000Z',
        });
        const edited = moments.updatePost(post.id, {
            authorEntityId: PERSONA.entityId,
            content: '修改后的动态。',
            visibility: { type: 'all', targets: [] },
        });
        activity.planPost(edited, [CLASSMATE], {
            now: '2026-09-17T01:03:00.000Z',
            random: () => 0,
        });

        const decorated = activity.decoratePosts([edited])[0];
        expect(decorated.readReceipts).toEqual([]);
        expect(decorated.reactions.likes).toEqual([]);
        expect(activity.getStatus({ now: '2026-09-17T01:03:00.000Z' }).pendingCount).toBe(1);
    });

    test('keeps every generated comment so a thread has no two-comment lifetime cap', () => {
        const post = moments.createPost(realityDraft());
        const third = { ...CLASSMATE, entityId: '44444444-4444-4444-8444-444444444444', sourceKey: '第三人.png', label: '第三人' };
        activity.planPost(post, [SISTER, CLASSMATE, third], {
            now: '2026-09-17T01:00:00.000Z',
            random: () => 0,
        });

        for (let index = 0; index < 3; index++) {
            const claim = activity.claimJob(moments.readTimeline().posts, {
                now: `2026-09-17T01:0${5 + index}:00.000Z`,
            });
            activity.completeJob(claim.job.id, { action: 'comment', comment: `评论 ${index + 1}` }, {
                now: `2026-09-17T01:0${5 + index}:10.000Z`,
            });
        }

        const decorated = activity.decoratePosts([post])[0];
        expect(decorated.readReceipts).toHaveLength(3);
        expect(decorated.reactions.comments).toHaveLength(3);
    });

    test('stores Persona replies as a tree and prioritizes the directly addressed character', () => {
        const post = moments.createPost(realityDraft());
        activity.planPost(post, [SISTER], { now: '2026-09-17T01:00:00.000Z', random: () => 0 });
        const claim = activity.claimJob(moments.readTimeline().posts, { now: '2026-09-17T01:05:00.000Z' });
        activity.completeJob(claim.job.id, { action: 'comment', comment: '我会记得。' }, { now: '2026-09-17T01:05:10.000Z' });
        const aiComment = activity.decoratePosts([post])[0].reactions.comments[0];
        const userReply = activity.addComment(post, PERSONA, '那之后也继续聊。', {
            parentCommentId: aiComment.id,
            now: '2026-09-17T01:06:00.000Z',
        });
        const planned = activity.planThread(post, {
            ...userReply,
            parentActorEntityId: SISTER.entityId,
        }, [CLASSMATE, SISTER], { now: '2026-09-17T01:06:00.000Z', random: () => 0 });

        expect(userReply.parentCommentId).toBe(aiComment.id);
        expect(userReply.rootCommentId).toBe(aiComment.id);
        expect(planned.jobs[0].actor.entityId).toBe(SISTER.entityId);
        expect(planned.jobs[0].type).toBe('review_thread');
        expect(planned.jobs[0].priority).toBe(100);
    });

    test('allows a reply to a preserved legacy comment and keeps one like per character', () => {
        const post = moments.createPost(realityDraft());
        const legacyComment = {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            jobId: 'legacy-comment',
            actor: PERSONA,
            postRevision: post.revision,
            content: '旧数据里的评论。',
            createdAt: '2026-09-17T01:00:00.000Z',
        };
        post.reactions.comments.push(legacyComment);
        activity.planThread(post, legacyComment, [SISTER], {
            now: '2026-09-17T01:01:00.000Z',
            random: () => 0,
        });
        const firstClaim = activity.claimJob([post], { now: '2026-09-17T01:02:00.000Z' });
        activity.completeJob(firstClaim.job.id, {
            action: 'reply',
            comment: '我接着回复这条旧评论。',
            targetCommentId: legacyComment.id,
        }, {
            now: '2026-09-17T01:02:10.000Z',
            knownComments: [legacyComment],
        });
        const userReply = activity.addComment(post, PERSONA, '再聊一句。', {
            now: '2026-09-17T01:03:00.000Z',
        });
        activity.planThread(post, userReply, [SISTER], {
            now: '2026-09-17T01:03:00.000Z',
            random: () => 0,
        });
        const secondClaim = activity.claimJob([post], { now: '2026-09-17T01:04:00.000Z' });
        activity.completeJob(secondClaim.job.id, { action: 'like', comment: '' }, {
            now: '2026-09-17T01:04:10.000Z',
        });
        const secondUserReply = activity.addComment(post, PERSONA, '再触发一次。', {
            now: '2026-09-17T01:05:00.000Z',
        });
        activity.planThread(post, secondUserReply, [SISTER], {
            now: '2026-09-17T01:05:00.000Z',
            random: () => 0,
        });
        const thirdClaim = activity.claimJob([post], { now: '2026-09-17T01:06:00.000Z' });
        activity.completeJob(thirdClaim.job.id, { action: 'like', comment: '' }, {
            now: '2026-09-17T01:06:10.000Z',
        });

        const decorated = activity.decoratePosts([post])[0];
        expect(decorated.reactions.comments.find(item => item.content === '我接着回复这条旧评论。').parentCommentId).toBe(legacyComment.id);
        expect(decorated.reactions.likes).toHaveLength(1);
    });

    test('reconciles unread legacy posts but keeps already-read posts untouched', () => {
        const unread = moments.createPost(realityDraft({ content: '后台互动功能之前发布。' }));
        const read = moments.createPost(realityDraft({ content: '已经被读取和回复。' }));
        activity.planPost(read, [SISTER], { now: '2026-09-17T01:00:00.000Z', random: () => 0 });
        const claim = activity.claimJob(moments.readTimeline().posts, { now: '2026-09-17T01:05:00.000Z' });
        activity.completeJob(claim.job.id, { action: 'comment', comment: '已经承接。' }, { now: '2026-09-17T01:05:10.000Z' });

        const reconciled = activity.reconcilePosts(moments.readTimeline().posts, [SISTER], {
            now: '2026-09-17T02:00:00.000Z',
            random: () => 0,
        });

        expect(reconciled.jobs.map(job => job.postId)).toContain(unread.id);
        expect(reconciled.jobs.map(job => job.postId)).not.toContain(read.id);
        expect(activity.decoratePosts([read])[0].reactions.comments[0].content).toBe('已经承接。');
    });

    test('uses bounded low, medium, and high scheduling profiles', () => {
        const lowPost = moments.createPost(realityDraft({ content: '低热情排程。' }));
        const highPost = moments.createPost(realityDraft({ content: '高热情排程。' }));
        const extraActors = [
            { ...CLASSMATE, entityId: '44444444-4444-4444-8444-444444444444', sourceKey: '第三人.png', label: '第三人' },
            { ...CLASSMATE, entityId: '55555555-5555-4555-8555-555555555555', sourceKey: '第四人.png', label: '第四人' },
            { ...CLASSMATE, entityId: '66666666-6666-4666-8666-666666666666', sourceKey: '第五人.png', label: '第五人' },
            { ...CLASSMATE, entityId: '77777777-7777-4777-8777-777777777777', sourceKey: '第六人.png', label: '第六人' },
        ];
        const candidates = [SISTER, CLASSMATE, ...extraActors];

        const low = activity.planPost(lowPost, candidates, {
            now: '2026-09-17T01:00:00.000Z',
            random: () => 0,
            enthusiasm: 'low',
        });
        const high = activity.planPost(highPost, candidates, {
            now: '2026-09-17T02:00:00.000Z',
            random: () => 0,
            enthusiasm: 'high',
        });

        expect(low.jobs).toHaveLength(1);
        expect(low.jobs[0].dueAt).toBe('2026-09-17T01:05:00.000Z');
        expect(high.jobs).toHaveLength(5);
        expect(high.jobs[0].dueAt).toBe('2026-09-17T02:00:20.000Z');
        expect(high.jobs[1].dueAt).toBe('2026-09-17T02:02:00.000Z');
        expect(getMomentsActivityEnthusiasmProfile('unexpected').actorLimit).toBe(3);
    });

    test('stops on corrupt activity data without replacing it', () => {
        fs.mkdirSync(path.dirname(activity.activityPath), { recursive: true });
        fs.writeFileSync(activity.activityPath, '{broken', 'utf8');

        expect(() => activity.decoratePosts([])).toThrow('Could not read');
        expect(fs.readFileSync(activity.activityPath, 'utf8')).toBe('{broken');
    });

    test('migrates existing AI comments into reply roots after backing up activity and queue files', () => {
        const post = moments.createPost(realityDraft());
        activity.planPost(post, [SISTER], { now: '2026-09-17T01:00:00.000Z', random: () => 0 });
        const claim = activity.claimJob(moments.readTimeline().posts, { now: '2026-09-17T01:05:00.000Z' });
        activity.completeJob(claim.job.id, { action: 'comment', comment: '旧评论原文。' }, { now: '2026-09-17T01:05:10.000Z' });
        const oldActivity = JSON.parse(fs.readFileSync(activity.activityPath, 'utf8'));
        const oldQueue = JSON.parse(fs.readFileSync(activity.queuePath, 'utf8'));
        oldActivity.schemaVersion = 1;
        delete oldActivity.posts[post.id].comments[0].parentCommentId;
        delete oldActivity.posts[post.id].comments[0].rootCommentId;
        oldQueue.schemaVersion = 1;
        for (const job of oldQueue.jobs) {
            delete job.type;
            delete job.priority;
            delete job.triggerCommentId;
            delete job.dedupeKey;
        }
        fs.writeFileSync(activity.activityPath, `${JSON.stringify(oldActivity, null, 4)}\n`, 'utf8');
        fs.writeFileSync(activity.queuePath, `${JSON.stringify(oldQueue, null, 4)}\n`, 'utf8');

        const migratedComment = activity.readActivity().posts[post.id].comments[0];
        const migratedJob = activity.readQueue().jobs[0];

        expect(migratedComment.content).toBe('旧评论原文。');
        expect(migratedComment.parentCommentId).toBeNull();
        expect(migratedComment.rootCommentId).toBe(migratedComment.id);
        expect(migratedJob.type).toBe('read_post');
        expect(fs.readdirSync(activity.migrationDirectory).some(name => name.startsWith('activity-v1-'))).toBe(true);
        expect(fs.readdirSync(activity.migrationDirectory).some(name => name.startsWith('activity-queue-v1-'))).toBe(true);
    });
});

describe('Leslie moments publishing settings and social memory', () => {
    let temporaryRoot;

    beforeEach(() => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-moments-memory-'));
    });

    afterEach(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test('keeps AI publishing disabled by default and stores per-character permission', () => {
        const settingsStore = new LeslieMomentsSettingsStore(temporaryRoot);
        expect(settingsStore.readSettings().globalAiPostingEnabled).toBe(false);

        const saved = settingsStore.updateSettings({
            globalAiPostingEnabled: true,
            characterPolicies: [{
                actor: SISTER,
                canPost: true,
                frequency: 'active',
                useChatMemory: true,
            }],
        });

        expect(saved.characterPolicies[0]).toMatchObject({ canPost: true, frequency: 'active', useChatMemory: true });
    });

    test('cancels queued AI publishing as soon as its permission is removed', () => {
        const activityStore = new LeslieMomentsActivityStore(temporaryRoot);
        activityStore.syncPublisherJobs([{ actor: SISTER, canPost: true, frequency: 'active' }], {
            now: '2026-09-17T01:00:00.000Z',
            random: () => 0,
        });

        expect(activityStore.readQueue().jobs[0].status).toBe('pending');
        activityStore.cancelPublisherJobs([], { now: '2026-09-17T01:01:00.000Z' });
        expect(activityStore.readQueue().jobs[0].status).toBe('cancelled');
    });

    test('selects only the memories actually observed by the requested character and invalidates deleted sources', () => {
        const momentsStore = new LeslieMomentsStore(temporaryRoot);
        const memoryStore = new LeslieMomentsMemoryStore(temporaryRoot);
        const post = momentsStore.createPost(realityDraft({ content: '今天在湖边见到了一只白鹭。' }));
        memoryStore.recordObservation(SISTER, post, {
            summary: '哥哥在湖边见到白鹭。',
            topics: ['湖边', '白鹭'],
        });

        expect(memoryStore.selectContext({ actorEntityId: SISTER.entityId, personaId: PERSONA.entityId, query: '白鹭' }).events).toHaveLength(1);
        expect(memoryStore.selectContext({ actorEntityId: CLASSMATE.entityId, personaId: PERSONA.entityId, query: '白鹭' }).events).toHaveLength(0);

        memoryStore.invalidatePost(post.id);
        expect(memoryStore.selectContext({ actorEntityId: SISTER.entityId, personaId: PERSONA.entityId, query: '白鹭' }).events).toHaveLength(0);
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

    test('passes the selected enthusiasm profile into background scheduling', async () => {
        const activityCandidates = Array.from({ length: 6 }, (_, index) => ({
            type: 'character',
            sourceKey: `热情测试角色-${index}.png`,
            label: `热情测试角色 ${index}`,
        }));
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                ...realityDraft(),
                author: { sourceKey: PERSONA.sourceKey, label: PERSONA.label },
                enthusiasm: 'high',
                activityCandidates,
            }),
        });
        const activityStore = new LeslieMomentsActivityStore(temporaryRoot);

        expect(response.status).toBe(201);
        expect(activityStore.readQueue().jobs.filter(job => job.status === 'pending')).toHaveLength(5);
    });

    test('claims and completes a background read through the API', async () => {
        const createResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reality',
                content: '后台已读验收。',
                author: { sourceKey: '哥哥.png', label: '哥哥' },
                visibility: {
                    type: 'selected',
                    targets: [{ type: 'character', sourceKey: '妹妹.png', label: '妹妹' }],
                },
            }),
        });
        expect(createResponse.status).toBe(201);

        const activityStore = new LeslieMomentsActivityStore(temporaryRoot);
        const previousQueue = activityStore.readQueue();
        const dueQueue = structuredClone(previousQueue);
        dueQueue.jobs[0].dueAt = '2000-01-01T00:00:00.000Z';
        activityStore.saveQueue(previousQueue, dueQueue);

        const claimResponse = await fetch(`${baseUrl}/activity/jobs/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        const claim = await claimResponse.json();
        expect(claimResponse.status).toBe(200);
        expect(claim.job.actor.label).toBe('妹妹');

        const completeResponse = await fetch(`${baseUrl}/activity/jobs/${claim.job.id}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'read', comment: '' }),
        });
        expect(completeResponse.status).toBe(200);

        const timeline = await (await fetch(baseUrl)).json();
        expect(timeline.posts[0].readReceipts).toHaveLength(1);
        expect(timeline.posts[0].readReceipts[0].actor.label).toBe('妹妹');
    });

    test('keeps the original timeline available when the activity sidecar is corrupt', async () => {
        const momentsStore = new LeslieMomentsStore(temporaryRoot);
        momentsStore.createPost(realityDraft({ content: '旁路损坏时仍应可见。' }));
        const activityStore = new LeslieMomentsActivityStore(temporaryRoot);
        fs.mkdirSync(path.dirname(activityStore.activityPath), { recursive: true });
        fs.writeFileSync(activityStore.activityPath, '{broken', 'utf8');

        const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const response = await fetch(baseUrl);
            const timeline = await response.json();

            expect(response.status).toBe(200);
            expect(timeline.posts[0].content).toBe('旁路损坏时仍应可见。');
            expect(timeline.activityStatus.state).toBe('error');
            expect(fs.readFileSync(activityStore.activityPath, 'utf8')).toBe('{broken');
        } finally {
            warning.mockRestore();
        }
    });

    test('accepts a Persona reply to an existing AI comment and preserves its parent link', async () => {
        const momentsStore = new LeslieMomentsStore(temporaryRoot);
        const activityStore = new LeslieMomentsActivityStore(temporaryRoot);
        const post = momentsStore.createPost(realityDraft());
        activityStore.planPost(post, [SISTER], { now: '2026-09-17T01:00:00.000Z', random: () => 0 });
        const claim = activityStore.claimJob(momentsStore.readTimeline().posts, { now: '2026-09-17T01:05:00.000Z' });
        activityStore.completeJob(claim.job.id, { action: 'comment', comment: '可以继续聊。' }, { now: '2026-09-17T01:05:10.000Z' });
        const parent = activityStore.decoratePosts([post])[0].reactions.comments[0];

        const response = await fetch(`${baseUrl}/${post.id}/comments`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                author: { sourceKey: PERSONA.sourceKey, label: PERSONA.label },
                content: '那就继续。',
                parentCommentId: parent.id,
                activityCandidates: [{ type: 'character', sourceKey: SISTER.sourceKey, label: SISTER.label }],
                enthusiasm: 'high',
            }),
        });
        const result = await response.json();

        expect(response.status).toBe(201);
        expect(result.comment.parentCommentId).toBe(parent.id);
        expect(result.post.reactions.comments).toHaveLength(2);
        expect(activityStore.readQueue().jobs.some(job => job.type === 'review_thread' && job.triggerCommentId === result.comment.id)).toBe(true);
    });

    test('publishes only for an explicitly enabled AI character and allows author-independent deletion', async () => {
        const settingsResponse = await fetch(`${baseUrl}/settings`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                globalAiPostingEnabled: true,
                characterPolicies: [{
                    actor: { sourceKey: SISTER.sourceKey, label: SISTER.label },
                    canPost: true,
                    frequency: 'active',
                    useChatMemory: false,
                }],
            }),
        });
        expect(settingsResponse.status).toBe(200);

        const activityStore = new LeslieMomentsActivityStore(temporaryRoot);
        const previousQueue = activityStore.readQueue();
        const dueQueue = structuredClone(previousQueue);
        dueQueue.jobs[0].dueAt = '2000-01-01T00:00:00.000Z';
        activityStore.saveQueue(previousQueue, dueQueue);
        const claim = await (await fetch(`${baseUrl}/activity/jobs/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        })).json();
        expect(claim.job.type).toBe('compose_post');

        const publishResponse = await fetch(`${baseUrl}/activity/jobs/${claim.job.id}/publish`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'publish',
                content: '今天想安静地看看窗外。',
                memorySummary: '妹妹分享了想看窗外的心情。',
                topics: ['窗外'],
                activityCandidates: [],
            }),
        });
        const published = await publishResponse.json();
        expect(publishResponse.status).toBe(201);
        expect(published.post.origin).toBe('ai');
        expect(published.post.mode).toBe('character');

        const deleteResponse = await fetch(`${baseUrl}/${published.post.id}/archive`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        expect(deleteResponse.status).toBe(200);
        expect((await deleteResponse.json()).post.content).toBe('今天想安静地看看窗外。');
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

    test('migrates enthusiasm settings and exposes the three bounded profiles', () => {
        expect(normalizeLeslieMomentsSettings(null)).toEqual({ schemaVersion: 1, enthusiasm: 'medium' });
        expect(normalizeLeslieMomentsSettings({ schemaVersion: 0, enthusiasm: 'high' })).toEqual({ schemaVersion: 1, enthusiasm: 'high' });
        expect(normalizeLeslieMomentsSettings({ enthusiasm: 'unexpected' }).enthusiasm).toBe('medium');
        expect(getMomentEnthusiasmProfile('low')).toMatchObject({ publicInteractionChance: 0.3, actorLimit: 1 });
        expect(getMomentEnthusiasmProfile('medium')).toMatchObject({ publicInteractionChance: 0.7, actorLimit: 3 });
        expect(getMomentEnthusiasmProfile('high')).toMatchObject({ publicInteractionChance: 0.95, actorLimit: 5 });
    });

    test('builds a bounded future prompt adapter without enabling chat injection', () => {
        const prompt = buildMomentsPromptContext([{
            status: 'active',
            summary: '哥哥曾分享在湖边看到白鹭。',
            topics: ['湖边', '白鹭'],
        }], { actorLabel: '妹妹' });

        expect(prompt).toContain('妹妹亲自读过');
        expect(prompt).toContain('白鹭');
    });
});
