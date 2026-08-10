import path from 'node:path';
import express from 'express';

import { LeslieIdentityStore, LeslieIdentityStoreError } from '../leslie-identity/store.js';
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
    };
}

function sendError(response, error) {
    if (error instanceof LeslieMomentsStoreError || error instanceof LeslieIdentityStoreError || error instanceof TypeError) {
        const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'IDENTITY_MISMATCH' || error.code === 'IDENTITY_CONFLICT' ? 409 : 400;
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

router.get('/', (request, response) => {
    try {
        const includeArchived = request.query.includeArchived === 'true';
        const viewerEntityId = typeof request.query.viewerEntityId === 'string' ? request.query.viewerEntityId : null;
        return response.send(getStores(request).moments.listPosts({ includeArchived, viewerEntityId }));
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
        return response.status(201).send({ post });
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
        return response.send({ post });
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
            return response.send({ post });
        } catch (error) {
            return sendError(response, error);
        }
    });
}
