import path from 'node:path';
import express from 'express';

import { LeslieIdentityStore, LeslieIdentityStoreError } from './store.js';

export const router = express.Router();

function resolveUserRoot(request) {
    const userRoot = request.user?.directories?.root;
    if (typeof userRoot !== 'string' || !userRoot.trim()) {
        throw new LeslieIdentityStoreError('NO_USER', 'No active SillyTavern user was found.');
    }
    return path.resolve(userRoot);
}

function getStore(request) {
    return new LeslieIdentityStore(resolveUserRoot(request));
}

function sendError(response, error) {
    if (error instanceof LeslieIdentityStoreError || error instanceof TypeError) {
        const status = error.code === 'NOT_FOUND' ? 404 : 400;
        return response.status(status).send({ error: error.code ?? 'INVALID_INPUT', message: error.message });
    }
    console.error('Leslie identity request failed.', error);
    return response.status(500).send({ error: 'INTERNAL_ERROR', message: 'Leslie identity request failed. Check the server log for details.' });
}

router.get('/', (request, response) => {
    try {
        return response.send({ registry: getStore(request).getRegistry() });
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/story-scope', (request, response) => {
    try {
        return response.send(getStore(request).resolveStoryScope(request.body));
    } catch (error) {
        return sendError(response, error);
    }
});

router.post('/entities/resolve', (request, response) => {
    try {
        return response.send(getStore(request).resolveEntities(request.body?.entities));
    } catch (error) {
        return sendError(response, error);
    }
});
