import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import {
    MOMENTS_SCHEMA_VERSION,
    createMomentPost,
    migrateMomentsTimeline,
    normalizeMomentVisibility,
} from './schema.js';

export class LeslieMomentsStoreError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'LeslieMomentsStoreError';
        this.code = code;
    }
}

function createInitialTimeline() {
    const now = new Date().toISOString();
    return {
        schemaVersion: MOMENTS_SCHEMA_VERSION,
        revision: 0,
        posts: [],
        createdAt: now,
        updatedAt: now,
    };
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

function cleanContent(value) {
    const content = String(value ?? '').trim();
    if (!content || content.length > 5000) {
        throw new LeslieMomentsStoreError('INVALID_INPUT', 'Moment content is required and must be shorter than 5000 characters.');
    }
    return content;
}

export function canMomentBeViewedBy(post, viewerEntityId) {
    if (!viewerEntityId || post.visibility?.type === 'all') {
        return true;
    }
    return post.visibility?.targets?.some(target => target.entityId === viewerEntityId) === true;
}

export class LeslieMomentsStore {
    constructor(userRoot) {
        if (!path.isAbsolute(userRoot)) {
            throw new TypeError('Leslie moments storage requires an absolute user data directory.');
        }
        this.directory = path.join(userRoot, 'leslie', 'moments');
        this.timelinePath = path.join(this.directory, 'timeline.json');
        this.historyDirectory = path.join(this.directory, 'history');
        this.migrationDirectory = path.join(this.historyDirectory, 'migrations');
    }

    readTimeline() {
        if (!fs.existsSync(this.timelinePath)) {
            return createInitialTimeline();
        }
        try {
            const parsed = JSON.parse(fs.readFileSync(this.timelinePath, 'utf8'));
            const migration = migrateMomentsTimeline(parsed);
            if (migration.migrated) {
                fs.mkdirSync(this.migrationDirectory, { recursive: true });
                const stamp = Date.now();
                fs.copyFileSync(this.timelinePath, path.join(this.migrationDirectory, `timeline-v${migration.fromVersion}-${stamp}.json`));
                writeJson(this.timelinePath, migration.value);
            }
            return migration.value;
        } catch (error) {
            throw new LeslieMomentsStoreError('CORRUPT_DATA', `Could not read the Leslie moments timeline. ${error.message}`);
        }
    }

    saveTimeline(previous, next) {
        fs.mkdirSync(this.historyDirectory, { recursive: true });
        writeJson(path.join(this.historyDirectory, `timeline-r${previous.revision}-${Date.now()}.json`), previous);
        next.schemaVersion = MOMENTS_SCHEMA_VERSION;
        next.revision = Number(previous.revision ?? 0) + 1;
        next.updatedAt = new Date().toISOString();
        writeJson(this.timelinePath, next);
        return next;
    }

    listPosts({ includeArchived = false, viewerEntityId = null } = {}) {
        const timeline = this.readTimeline();
        const posts = timeline.posts
            .filter(post => includeArchived || post.status === 'active')
            .filter(post => canMomentBeViewedBy(post, viewerEntityId))
            .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        return { schemaVersion: timeline.schemaVersion, revision: timeline.revision, posts };
    }

    getPost(postId) {
        const post = this.readTimeline().posts.find(item => item.id === postId);
        if (!post) {
            throw new LeslieMomentsStoreError('NOT_FOUND', 'The requested moment was not found.');
        }
        return post;
    }

    createPost(value) {
        const previous = this.readTimeline();
        if (previous.posts.length >= 5000) {
            throw new LeslieMomentsStoreError('LIMIT_REACHED', 'The first Leslie moments version supports up to 5000 posts. Archive export is required before adding more.');
        }
        let post;
        try {
            post = createMomentPost(value, { id: randomUUID() });
        } catch (error) {
            throw new LeslieMomentsStoreError('INVALID_INPUT', error.message);
        }
        const next = structuredClone(previous);
        next.posts.unshift(post);
        this.saveTimeline(previous, next);
        return post;
    }

    updatePost(postId, { authorEntityId, content, visibility }) {
        const previous = this.readTimeline();
        const next = structuredClone(previous);
        const post = next.posts.find(item => item.id === postId);
        if (!post) {
            throw new LeslieMomentsStoreError('NOT_FOUND', 'The requested moment was not found.');
        }
        if (post.origin === 'ai' || post.author?.type === 'character') {
            throw new LeslieMomentsStoreError('INVALID_STATE', 'AI-authored moments cannot be edited. Delete the moment instead.');
        }
        if (post.author.entityId !== authorEntityId) {
            throw new LeslieMomentsStoreError('IDENTITY_MISMATCH', 'Only the Persona that published this moment can edit it.');
        }
        if (post.status !== 'active') {
            throw new LeslieMomentsStoreError('INVALID_STATE', 'Restore this moment before editing it.');
        }
        post.content = cleanContent(content);
        if (post.mode !== 'story') {
            try {
                post.visibility = normalizeMomentVisibility(visibility);
            } catch (error) {
                throw new LeslieMomentsStoreError('INVALID_INPUT', error.message);
            }
        }
        post.revision = Number(post.revision ?? 1) + 1;
        post.editedAt = new Date().toISOString();
        post.updatedAt = post.editedAt;
        this.saveTimeline(previous, next);
        return post;
    }

    setPostStatus(postId, status) {
        if (!['active', 'archived'].includes(status)) {
            throw new LeslieMomentsStoreError('INVALID_INPUT', 'Unsupported moment status.');
        }
        const previous = this.readTimeline();
        const next = structuredClone(previous);
        const post = next.posts.find(item => item.id === postId);
        if (!post) {
            throw new LeslieMomentsStoreError('NOT_FOUND', 'The requested moment was not found.');
        }
        if (post.status === status) {
            return post;
        }
        post.status = status;
        post.revision = Number(post.revision ?? 1) + 1;
        post.updatedAt = new Date().toISOString();
        post.archivedAt = status === 'archived' ? post.updatedAt : null;
        this.saveTimeline(previous, next);
        return post;
    }
}
