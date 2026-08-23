const characterAvatarRevisions = new Map();

/**
 * Builds the dedicated character-avatar upload endpoint.
 *
 * @param {object|undefined} cropData Cropper.js crop payload.
 * @returns {string} Avatar upload URL.
 */
export function getCharacterAvatarUploadUrl(cropData) {
    const url = '/api/characters/edit-avatar';
    return cropData === undefined
        ? url
        : `${url}?crop=${encodeURIComponent(JSON.stringify(cropData))}`;
}

/**
 * Uploads a replacement image without rebuilding the character definition.
 *
 * @param {object} options Upload options.
 * @param {string} options.avatarKey Existing character avatar filename.
 * @param {Blob} options.file Image file to upload.
 * @param {object|undefined} options.cropData Cropper.js crop payload.
 * @param {HeadersInit} options.headers Request headers, excluding Content-Type.
 * @param {typeof fetch} [options.fetchImpl=fetch] Fetch implementation.
 * @returns {Promise<Response>} Successful upload response.
 */
export async function uploadCharacterAvatarFile({
    avatarKey,
    file,
    cropData,
    headers,
    fetchImpl = globalThis.fetch,
}) {
    if (!avatarKey || !(file instanceof Blob)) {
        throw new TypeError('A character avatar key and image file are required.');
    }

    const formData = new FormData();
    const fileName = typeof file.name === 'string' && file.name ? file.name : 'avatar.png';
    formData.append('avatar', file, fileName);
    formData.append('avatar_url', avatarKey);

    const response = await fetchImpl(getCharacterAvatarUploadUrl(cropData), {
        method: 'POST',
        headers,
        body: formData,
        cache: 'no-cache',
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Character avatar upload failed (${response.status}).`);
    }

    return response;
}

/**
 * Synchronizes character data and every visible image after an avatar update.
 *
 * @param {object} options Refresh options.
 * @param {string} options.avatarKey Existing character avatar filename.
 * @param {(type: string, file: string) => string} options.getThumbnailUrl Thumbnail URL builder.
 * @param {(avatarKey: string) => Promise<void>} options.getOneCharacter Character refresh callback.
 * @param {Document|Element} [options.root=document] DOM root to update.
 * @param {typeof fetch} [options.fetchImpl=fetch] Fetch implementation.
 * @param {number} [options.revision=Date.now()] Revision value.
 * @returns {Promise<{revision: number, thumbnailUrl: string, characterUrl: string, updatedImages: number, characterSynchronized: boolean}>} Refresh result.
 */
export async function refreshCharacterAvatarState({
    avatarKey,
    getThumbnailUrl,
    getOneCharacter,
    root = globalThis.document,
    fetchImpl = globalThis.fetch,
    revision = Date.now(),
}) {
    if (!avatarKey || typeof getThumbnailUrl !== 'function' || typeof getOneCharacter !== 'function') {
        throw new TypeError('Avatar refresh requires a key and character refresh callbacks.');
    }

    updateCharacterAvatarRevision(avatarKey, revision);
    const [characterRefresh] = await Promise.allSettled([getOneCharacter(avatarKey)]);

    const thumbnailUrl = withAvatarRevision(getThumbnailUrl('avatar', avatarKey), revision);
    const characterUrl = withAvatarRevision(`/characters/${avatarKey}`, revision);

    await Promise.allSettled([
        fetchImpl(thumbnailUrl, { method: 'GET', cache: 'reload' }),
        fetchImpl(characterUrl, { method: 'GET', cache: 'reload' }),
    ]);

    const images = new Set(root?.querySelectorAll?.('img') ?? []);
    const preview = root?.querySelector?.('#avatar_load_preview');
    if (preview) {
        images.add(preview);
    }

    let updatedImages = 0;
    for (const image of images) {
        const isPreview = image === preview;
        const sourceType = getCharacterAvatarSourceType(image.getAttribute?.('src') ?? '', avatarKey);
        if (!isPreview && !sourceType) {
            continue;
        }

        image.setAttribute('src', sourceType === 'character' ? characterUrl : thumbnailUrl);
        updatedImages++;
    }

    return {
        revision,
        thumbnailUrl,
        characterUrl,
        updatedImages,
        characterSynchronized: characterRefresh.status === 'fulfilled',
    };
}

/**
 * Records a new client-side revision for a character avatar.
 *
 * @param {string} avatarKey Character avatar filename.
 * @param {number} [revision=Date.now()] Revision value.
 * @returns {number} Stored revision.
 */
export function updateCharacterAvatarRevision(avatarKey, revision = Date.now()) {
    characterAvatarRevisions.set(avatarKey, revision);
    return revision;
}

/**
 * Gets the current client-side revision for a character avatar.
 *
 * @param {string} avatarKey Character avatar filename.
 * @returns {number|undefined} Stored revision, if any.
 */
export function getCharacterAvatarRevision(avatarKey) {
    return characterAvatarRevisions.get(avatarKey);
}

/**
 * Adds or replaces the cache-busting revision on a URL.
 *
 * @param {string} url Image URL.
 * @param {number} revision Revision value.
 * @returns {string} Versioned image URL.
 */
export function withAvatarRevision(url, revision) {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(url);
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.set('t', String(revision));
    return absolute ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Identifies whether an image source belongs to a character avatar.
 *
 * @param {string} source Image source URL.
 * @param {string} avatarKey Character avatar filename.
 * @returns {'thumbnail'|'character'|null} Matching avatar source type.
 */
export function getCharacterAvatarSourceType(source, avatarKey) {
    if (!source) {
        return null;
    }

    try {
        const parsed = new URL(source, 'http://localhost');
        if (parsed.pathname === '/thumbnail'
            && parsed.searchParams.get('type') === 'avatar'
            && parsed.searchParams.get('file') === avatarKey) {
            return 'thumbnail';
        }

        if (decodeURIComponent(parsed.pathname) === `/characters/${avatarKey}`) {
            return 'character';
        }
    } catch {
        return null;
    }

    return null;
}
