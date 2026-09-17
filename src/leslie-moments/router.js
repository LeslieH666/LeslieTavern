import path from 'node:path';
import express from 'express';

import { LeslieIdentityStore, LeslieIdentityStoreError } from '../leslie-identity/store.js';
import { LeslieMomentsActivityStore, LeslieMomentsActivityStoreError } from './activity-store.js';
import { LeslieMomentsStore, LeslieMomentsStoreError } from './store.js';

export const router = express.Router();

export function resolveMomentsUserRoot(request) {
    const userRoot = request.user?.directories?.root;
    if (typeof userRoot !== 'string' || !userRoot.trim()) {
        throw new LeslieMomentsStoreError('NO_USER', 'No active SillyTavern user was found.');
    }
    return path.resolve(userRoot);
}

function getStores(request) {
    const userRoot = resolveMomentsUserRoot(request);
    return {
        identity: new LeslieIdentityStore(userRoot),
        moments: new LeslieMomentsStore(userRoot),
        activity: new LeslieMomentsActivityStore(userRoot),
    };
}

function sendError(response, error) {
    if (error instanceof LeslieMomentsStoreError || error instanceof LeslieMomentsActivityStoreError || error instanceof LeslieIdentityStoreError || error instanceof TypeError) {
        const status = error.code === 'NOT_FOUND' ? 404 : ['IDENTITY_MISMATCH', 'IDENTITY_CONFLICT', 'INVALID_STATE'].includes(error.code) ? 409 : 400;
        return response.status(status).send({ error: error.code ?? 'INVALID_INPUT', message: error.message });
    }
    console.error('Leslie moments request failed.', error);
    return response.status(500).send({ error: 'INTERNAL_ERROR', message: 'Leslie moments request failed. Check the server log for details.' });
}

function toIdentitySnapshot(entity, avatar = '') {
    return {
        entityId: entity.id,
        type: entity.type,
        sourceKey: entity.sourceKey,
        label: entity.label,
        avatar: String(avatar ?? '').trim().slice(0, 1000),
    };
}

function normalizeRawIdentity(value, type = value?.type) {
    return {
        id: value?.id,
        type,
        sourceKey: value?.sourceKey,
        label: value?.label,
    };
}

function resolveNormalDraft(identityStore, body) {
    const rawTargets = body.visibility?.type === 'selected' && Array.isArray(body.visibility.targets) ? body.visibility.targets : [];
    const resolution = identityStore.resolveEntities([
        normalizeRawIdentity(body.author, 'persona'),
        ...rawTargets.map(item => normalizeRawIdentity(item, item.type || 'character')),
    ]);
    const [author, ...targets] = resolution.entities;
    return {
        author: toIdentitySnapshot(author, body.author?.avatar),
        visibility: {
            type: body.visibility?.type === 'selected' ? 'selected' : 'all',
            targets: targets.map((entity, index) => toIdentitySnapshot(entity, rawTargets[index]?.avatar)),
        },
        storyBinding: null,
    };
}

function resolveStoryDraft(identityStore, body) {
    const resolution = identityStore.resolveStoryScope(body.storyContext);
    return {
        author: toIdentitySnapshot(resolution.persona, body.author?.avatar),
        visibility: {
            type: 'selected',
            targets: [toIdentitySnapshot(resolution.counterpart, body.storyContext?.counterpart?.avatar)],
        },
        storyBinding: {
            storyScopeId: resolution.storyScope.id,
            personaId: resolution.persona.id,
            counterpartId: resolution.counterpart.id,
            counterpartType: resolution.counterpart.type,
            chatKey: resolution.storyScope.currentChatKey,
            personaName: resolution.persona.label,
            counterpartName: resolution.counterpart.label,
        },
    };
}

function resolveAuthor(identityStore, author) {
    const result = identityStore.resolveEntities([normalizeRawIdentity(author, 'persona')]);
    return toIdentitySnapshot(result.entities[0], author?.avatar);
}

function resolveActivityCandidates(identityStore, post, body) {
    if (post.visibility?.type === 'selected') {
        return post.visibility.targets;
    }
    const rawCandidates = Array.isArray(body?.activityCandidates) ? body.activityCandidates.slice(0, 50) : [];
    if (!rawCandidates.length) {
        return [];
    }
    const resolution = identityStore.resolveEntities(rawCandidates.map(item => normalizeRawIdentity(item, item?.type || 'character')));
    return resolution.entities
        .filter(entity => entity.type === 'character' || entity.type === 'group')
        .map((entity, index) => toIdentitySnapshot(entity, rawCandidates[index]?.avatar));
}

function logActivityFailure(error) {
    console.warn(`Leslie moments background activity is unavailable. ${String(error?.message || error).slice(0, 500)}`);
}

function decoratePostsFailOpen(activityStore, posts) {
    const fallbackPosts = posts.map(post => ({
        ...post,
        readReceipts: Array.isArray(post.readReceipts) ? post.readReceipts : [],
        reactions: {
            likes: Array.isArray(post.reactions?.likes) ? post.reactions.likes : [],
            comments: Array.isArray(post.reactions?.comments) ? post.reactions.comments : [],
        },
    }));
    let decoratedPosts = fallbackPosts;
    let status;
    let activityFailed = false;
    try {
        decoratedPosts = activityStore.decoratePosts(posts);
    } catch (error) {
        activityFailed = true;
        logActivityFailure(error);
    }
    try {
        status = activityStore.getStatus();
    } catch (error) {
        logActivityFailure(error);
    }
    if (activityFailed) {
        status = {
            ...(status ?? {}),
            state: 'error',
            lastError: '朋友圈互动数据不可用；原动态仍可正常使用。',
        };
    }
    return {
        posts: decoratedPosts,
        status: status ?? {
            state: 'error',
            paused: false,
            pendingCount: 0,
            dueCount: 0,
            lastError: '朋友圈互动数据不可用；原动态仍可正常使用。',
        },
    };
}

function planActivityFailOpen(stores, post, body) {
    try {
        const candidates = resolveActivityCandidates(stores.identity, post, body);
        stores.activity.planPost(post, candidates, { enthusiasm: body?.enthusiasm });
    } catch (error) {
        logActivityFailure(error);
    }
}

function cancelActivityFailOpen(activityStore, postId) {
    try {
        activityStore.cancelPost(postId);
    } catch (error) {
        logActivityFailure(error);
    }
}

router.get('/', (request, response) => {
    try {
        const includeArchived = request.query.includeArchived === 'true';
        const viewerEntityId = typeof request.query.viewerEntityId === 'string' ? request.query.viewerEntityId : null;
        const stores = getStores(request);
        const timeline = stores.moments.listPosts({ includeArchived, viewerEntityId });
        const decorated = decoratePostsFailOpen(stores.activity, timeline.posts);
        return response.send({
            ...timeline,
            posts: decorated.posts,
            activityStatus: decorated.status,
        });
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/', (request, response) => {
    try {
        const stores = getStores(request);
        const mode = request.body?.mode;
        const binding = mode === 'story'
            ? resolveStoryDraft(stores.identity, request.body)
            : resolveNormalDraft(stores.identity, request.body);
        const post = stores.moments.createPost({
            mode,
            content: request.body?.content,
            ...binding,
        });
        planActivityFailOpen(stores, post, request.body);
        return response.status(201).send({ post: decoratePostsFailOpen(stores.activity, [post]).posts[0] });
    } catch (error) {
        return sendError(response, error);
    }
});

router.patch('/:postId', (request, response) => {
    try {
        const stores = getStores(request);
        const existing = stores.moments.getPost(request.params.postId);
        const author = resolveAuthor(stores.identity, request.body?.author);
        let visibility = existing.visibility;
        if (existing.mode !== 'story') {
            visibility = resolveNormalDraft(stores.identity, {
                author: request.body?.author,
                visibility: request.body?.visibility,
            }).visibility;
        }
        const post = stores.moments.updatePost(request.params.postId, {
            authorEntityId: author.entityId,
            content: request.body?.content,
            visibility,
        });
        planActivityFailOpen(stores, post, request.body);
        return response.send({ post: decoratePostsFailOpen(stores.activity, [post]).posts[0] });
    } catch (error) {
        return sendError(response, error);
    }
});

for (const [route, status] of [['archive', 'archived'], ['restore', 'active']]) {
    router.post(`/:postId/${route}`, (request, response) => {
        try {
            const stores = getStores(request);
            const author = resolveAuthor(stores.identity, request.body?.author);
            const post = stores.moments.setPostStatus(request.params.postId, status, author.entityId);
            if (status === 'archived') {
                cancelActivityFailOpen(stores.activity, post.id);
            } else {
                planActivityFailOpen(stores, post, request.body);
            }
            return response.send({ post: decoratePostsFailOpen(stores.activity, [post]).posts[0] });
        } catch (error) {
            return sendError(response, error);
        }
    });
}

router.get('/activity/status', (request, response) => {
    try {
        return response.send({ status: getStores(request).activity.getStatus() });
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/activity/pause', (request, response) => {
    try {
        return response.send({ status: getStores(request).activity.setPaused(Boolean(request.body?.paused)) });
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/activity/heartbeat', (request, response) => {
    try {
        const status = getStores(request).activity.heartbeat(request.body?.state, request.body?.error);
        return response.send({ status });
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/activity/jobs/claim', (request, response) => {
    try {
        const stores = getStores(request);
        const timeline = stores.moments.readTimeline();
        return response.send(stores.activity.claimJob(timeline.posts));
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/activity/jobs/:jobId/complete', (request, response) => {
    try {
        const stores = getStores(request);
        const activity = stores.activity.completeJob(request.params.jobId, request.body);
        return response.send({ activity });
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/activity/jobs/:jobId/fail', (request, response) => {
    try {
        const stores = getStores(request);
        const job = stores.activity.failJob(request.params.jobId, request.body?.error, {
            retryAfterMs: request.body?.retryAfterMs,
        });
        return response.send({ job });
    } catch (error) {
        return sendError(response, error);
    }
});
