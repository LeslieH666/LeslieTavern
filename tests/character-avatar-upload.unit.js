import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable playwright/expect-expect, playwright/no-conditional-in-test */

import {
    getCharacterAvatarRevision,
    getCharacterAvatarSourceType,
    getCharacterAvatarUploadUrl,
    refreshCharacterAvatarState,
    uploadCharacterAvatarFile,
    withAvatarRevision,
} from '../public/scripts/character-avatar-upload.js';

test('builds the dedicated avatar endpoint with optional crop data', () => {
    assert.equal(getCharacterAvatarUploadUrl(undefined), '/api/characters/edit-avatar');

    const cropData = { x: 12, y: 34, width: 512, height: 768, want_resize: true };
    const url = new URL(getCharacterAvatarUploadUrl(cropData), 'http://localhost');
    assert.equal(url.pathname, '/api/characters/edit-avatar');
    assert.deepEqual(JSON.parse(url.searchParams.get('crop')), cropData);
});

test('uploads only the replacement image and character avatar key', async () => {
    const calls = [];
    const image = new Blob(['synthetic-image'], { type: 'image/png' });
    const headers = { 'X-CSRF-Token': 'synthetic-token' };

    const response = await uploadCharacterAvatarFile({
        avatarKey: 'synthetic-character.png',
        file: image,
        cropData: { x: 1, y: 2, width: 3, height: 4, want_resize: true },
        headers,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return new Response(null, { status: 200 });
        },
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^\/api\/characters\/edit-avatar\?crop=/);
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(calls[0].options.headers, headers);
    assert.equal(calls[0].options.cache, 'no-cache');
    assert.equal(calls[0].options.body.get('avatar_url'), 'synthetic-character.png');
    assert.ok(calls[0].options.body.get('avatar') instanceof Blob);
});

test('surfaces a failed avatar upload response', async () => {
    await assert.rejects(
        uploadCharacterAvatarFile({
            avatarKey: 'synthetic-character.png',
            file: new Blob(['synthetic-image'], { type: 'image/png' }),
            headers: {},
            fetchImpl: async () => new Response('invalid image', { status: 400 }),
        }),
        /invalid image/,
    );
});

test('tracks avatar revisions and recognizes thumbnail and character sources', () => {
    assert.equal(withAvatarRevision('/thumbnail?type=avatar&file=card.png', 42), '/thumbnail?type=avatar&file=card.png&t=42');
    assert.equal(getCharacterAvatarSourceType('/thumbnail?type=avatar&file=card.png&t=1', 'card.png'), 'thumbnail');
    assert.equal(getCharacterAvatarSourceType('/characters/card.png?t=1', 'card.png'), 'character');
    assert.equal(getCharacterAvatarSourceType('/thumbnail?type=avatar&file=other.png', 'card.png'), null);
});

test('refreshes character state and every matching visible avatar with a new revision', async () => {
    const characterRefreshes = [];
    const fetches = [];
    const makeImage = source => ({
        source,
        getAttribute(name) {
            return name === 'src' ? this.source : null;
        },
        setAttribute(name, value) {
            if (name === 'src') this.source = value;
        },
    });
    const thumbnail = makeImage('/thumbnail?type=avatar&file=card.png');
    const direct = makeImage('/characters/card.png');
    const unrelated = makeImage('/thumbnail?type=avatar&file=other.png');
    const preview = makeImage('data:image/png;base64,preview');
    const root = {
        querySelectorAll: () => [thumbnail, direct, unrelated, preview],
        querySelector: selector => selector === '#avatar_load_preview' ? preview : null,
    };

    const result = await refreshCharacterAvatarState({
        avatarKey: 'card.png',
        revision: 123,
        root,
        getThumbnailUrl: (type, file) => `/thumbnail?type=${type}&file=${file}`,
        getOneCharacter: async avatarKey => characterRefreshes.push(avatarKey),
        fetchImpl: async url => {
            fetches.push(url);
            return new Response(null, { status: 200 });
        },
    });

    assert.deepEqual(characterRefreshes, ['card.png']);
    assert.deepEqual(fetches, [
        '/thumbnail?type=avatar&file=card.png&t=123',
        '/characters/card.png?t=123',
    ]);
    assert.equal(getCharacterAvatarRevision('card.png'), 123);
    assert.equal(thumbnail.source, '/thumbnail?type=avatar&file=card.png&t=123');
    assert.equal(direct.source, '/characters/card.png?t=123');
    assert.equal(preview.source, '/thumbnail?type=avatar&file=card.png&t=123');
    assert.equal(unrelated.source, '/thumbnail?type=avatar&file=other.png');
    assert.equal(result.updatedImages, 3);
    assert.equal(result.characterSynchronized, true);
});

test('keeps refreshing visible avatars when character synchronization fails', async () => {
    const image = {
        source: '/thumbnail?type=avatar&file=offline.png',
        getAttribute: () => image.source,
        setAttribute: (_name, value) => image.source = value,
    };

    const result = await refreshCharacterAvatarState({
        avatarKey: 'offline.png',
        revision: 456,
        root: {
            querySelectorAll: () => [image],
            querySelector: () => null,
        },
        getThumbnailUrl: (type, file) => `/thumbnail?type=${type}&file=${file}`,
        getOneCharacter: async () => {
            throw new Error('synthetic network error');
        },
        fetchImpl: async () => new Response(null, { status: 200 }),
    });

    assert.equal(result.characterSynchronized, false);
    assert.equal(result.updatedImages, 1);
    assert.equal(image.source, '/thumbnail?type=avatar&file=offline.png&t=456');
});
