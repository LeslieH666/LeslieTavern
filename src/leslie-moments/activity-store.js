import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { normalizeMomentIdentity } from './schema.js';

export const MOMENTS_ACTIVITY_SCHEMA_VERSION = 2;
export const MOMENTS_QUEUE_SCHEMA_VERSION = 2;

const ACTIONS = Object.freeze(['read', 'like', 'comment', 'reply', 'like_and_comment']);
const JOB_TYPES = Object.freeze(['read_post', 'review_thread', 'compose_post']);
const HEARTBEAT_STATES = Object.freeze(['starting', 'running', 'busy', 'busy_foreground', 'waiting_model', 'paused', 'error']);
const MAX_MODEL_RUNS_PER_HOUR = 8;
const LEASE_DURATION_MS = 5 * 60_000;

const PUBLISHING_DELAY_RANGES = Object.freeze({
    occasional: Object.freeze([24 * 60 * 60_000, 72 * 60 * 60_000]),
    normal: Object.freeze([8 * 60 * 60_000, 24 * 60 * 60_000]),
    active: Object.freeze([2 * 60 * 60_000, 8 * 60 * 60_000]),
});

export const MOMENTS_ACTIVITY_ENTHUSIASM_PROFILES = Object.freeze({
    low: Object.freeze({
        actorLimit: 1,
        firstDelayRange: Object.freeze([5 * 60_000, 15 * 60_000]),
        laterDelayRange: Object.freeze([20 * 60_000, 60 * 60_000]),
    }),
    medium: Object.freeze({
        actorLimit: 3,
        firstDelayRange: Object.freeze([60_000, 3 * 60_000]),
        laterDelayRange: Object.freeze([4 * 60_000, 20 * 60_000]),
    }),
    high: Object.freeze({
        actorLimit: 5,
        firstDelayRange: Object.freeze([20_000, 90_000]),
        laterDelayRange: Object.freeze([2 * 60_000, 8 * 60_000]),
    }),
});

export function getMomentsActivityEnthusiasmProfile(level) {
    return MOMENTS_ACTIVITY_ENTHUSIASM_PROFILES[level] ?? MOMENTS_ACTIVITY_ENTHUSIASM_PROFILES.medium;
}

export class LeslieMomentsActivityStoreError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'LeslieMomentsActivityStoreError';
        this.code = code;
    }
}

function createInitialActivity(now = new Date().toISOString()) {
    return {
        schemaVersion: MOMENTS_ACTIVITY_SCHEMA_VERSION,
        revision: 0,
        posts: {},
        createdAt: now,
        updatedAt: now,
    };
}

function createInitialQueue(now = new Date().toISOString()) {
    return {
        schemaVersion: MOMENTS_QUEUE_SCHEMA_VERSION,
        revision: 0,
        paused: false,
        jobs: [],
        recentRuns: [],
        status: {
            state: 'starting',
            lastHeartbeatAt: null,
            lastRunAt: null,
            lastSuccessAt: null,
            lastError: null,
        },
        createdAt: now,
        updatedAt: now,
    };
}

function cleanOptionalText(value, maximumLength = 500) {
    return String(value ?? '').trim().slice(0, maximumLength);
}

function readJson(filePath, label) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `Could not read Leslie moments ${label}. ${error.message}`);
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

function migrateActivity(value) {
    const version = Number(value?.schemaVersion);
    if (version === MOMENTS_ACTIVITY_SCHEMA_VERSION) {
        return { value, migrated: false, fromVersion: version };
    }
    if (version !== 1 || !value?.posts || typeof value.posts !== 'object' || Array.isArray(value.posts)) {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'The Leslie moments activity file is invalid.');
    }
    const migrated = structuredClone(value);
    migrated.schemaVersion = MOMENTS_ACTIVITY_SCHEMA_VERSION;
    for (const postActivity of Object.values(migrated.posts)) {
        postActivity.comments = (Array.isArray(postActivity.comments) ? postActivity.comments : []).map(comment => ({
            ...comment,
            parentCommentId: comment.parentCommentId || null,
            rootCommentId: comment.rootCommentId || comment.id,
            source: comment.source || 'ai',
        }));
    }
    return { value: migrated, migrated: true, fromVersion: version };
}

function migrateQueue(value) {
    const version = Number(value?.schemaVersion);
    if (version === MOMENTS_QUEUE_SCHEMA_VERSION) {
        return { value, migrated: false, fromVersion: version };
    }
    if (version !== 1 || !Array.isArray(value?.jobs)) {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'The Leslie moments activity queue is invalid.');
    }
    const migrated = structuredClone(value);
    migrated.schemaVersion = MOMENTS_QUEUE_SCHEMA_VERSION;
    migrated.jobs = migrated.jobs.map(job => ({
        ...job,
        type: 'read_post',
        priority: 50,
        triggerCommentId: null,
        dedupeKey: `read_post:${job.postId}:${job.postRevision}:${job.actor?.entityId}`,
    }));
    return { value: migrated, migrated: true, fromVersion: version };
}

function validateActivity(value) {
    if (!value || typeof value !== 'object' || Number(value.schemaVersion) !== MOMENTS_ACTIVITY_SCHEMA_VERSION || !value.posts || typeof value.posts !== 'object' || Array.isArray(value.posts)) {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'The Leslie moments activity file is invalid.');
    }
    for (const [postId, postActivity] of Object.entries(value.posts)) {
        if (!postId || !postActivity || typeof postActivity !== 'object') {
            throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'A Leslie moments activity entry is invalid.');
        }
        for (const field of ['readReceipts', 'likes', 'comments']) {
            if (!Array.isArray(postActivity[field])) {
                throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `The Leslie moments ${field} collection is invalid.`);
            }
            if (postActivity[field].length > 1000) {
                throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `The Leslie moments ${field} collection is too large.`);
            }
            for (const item of postActivity[field]) {
                const timestamp = field === 'readReceipts' ? item?.readAt : item?.createdAt;
                if (!item || typeof item !== 'object'
                    || !String(item.id ?? '').trim()
                    || !String(item.jobId ?? '').trim()
                    || !Number.isInteger(Number(item.postRevision))
                    || !Number.isFinite(new Date(timestamp).getTime())) {
                    throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `A Leslie moments ${field} entry is invalid.`);
                }
                try {
                    normalizeMomentIdentity(item.actor, ['persona', 'character', 'group']);
                } catch (error) {
                    throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `A Leslie moments ${field} actor is invalid. ${error.message}`);
                }
                if (field === 'comments' && (!String(item.content ?? '').trim() || String(item.content).length > 500)) {
                    throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'A Leslie moments comment is invalid.');
                }
                if (field === 'comments' && (item.parentCommentId !== null && typeof item.parentCommentId !== 'string')) {
                    throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'A Leslie moments comment parent is invalid.');
                }
            }
        }
    }
    return value;
}

function validateQueue(value) {
    if (!value || typeof value !== 'object' || Number(value.schemaVersion) !== MOMENTS_QUEUE_SCHEMA_VERSION || !Array.isArray(value.jobs) || !Array.isArray(value.recentRuns)) {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'The Leslie moments activity queue is invalid.');
    }
    if (!value.status || typeof value.status !== 'object') {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'The Leslie moments activity status is invalid.');
    }
    if (value.jobs.length > 20_000 || typeof value.paused !== 'boolean') {
        throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'The Leslie moments activity queue limits are invalid.');
    }
    for (const job of value.jobs) {
        if (!job || typeof job !== 'object'
            || !String(job.id ?? '').trim()
            || !JOB_TYPES.includes(job.type)
            || (job.type !== 'compose_post' && !String(job.postId ?? '').trim())
            || !Number.isInteger(Number(job.postRevision))
            || !['pending', 'running', 'completed', 'cancelled'].includes(job.status)
            || !Number.isFinite(new Date(job.dueAt).getTime())) {
            throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'A Leslie moments activity job is invalid.');
        }
        try {
            normalizeMomentIdentity(job.actor, ['character', 'group']);
        } catch (error) {
            throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `A Leslie moments activity job actor is invalid. ${error.message}`);
        }
    }
    return value;
}

function normalizeActor(value) {
    try {
        return normalizeMomentIdentity(value, ['character', 'group']);
    } catch (error) {
        throw new LeslieMomentsActivityStoreError('INVALID_INPUT', error.message);
    }
}

function saveVersioned({ previous, next, filePath, historyDirectory, prefix, schemaVersion, snapshot = true }) {
    fs.mkdirSync(historyDirectory, { recursive: true });
    if (snapshot && fs.existsSync(filePath)) {
        writeJson(path.join(historyDirectory, `${prefix}-r${previous.revision}-${Date.now()}.json`), previous);
    }
    next.schemaVersion = schemaVersion;
    next.revision = Number(previous.revision ?? 0) + 1;
    next.updatedAt = new Date().toISOString();
    writeJson(filePath, next);
    return next;
}

function addMilliseconds(isoDate, milliseconds) {
    return new Date(new Date(isoDate).getTime() + milliseconds).toISOString();
}

function getPostActivity(activity, postId) {
    activity.posts[postId] ??= {
        readReceipts: [],
        likes: [],
        comments: [],
    };
    return activity.posts[postId];
}

function mergeActivityItems(legacyItems, sidecarItems) {
    const merged = new Map();
    for (const item of [...(Array.isArray(legacyItems) ? legacyItems : []), ...(Array.isArray(sidecarItems) ? sidecarItems : [])]) {
        const key = item?.id || item?.jobId || `${item?.actor?.entityId ?? 'unknown'}:${item?.createdAt ?? item?.readAt ?? merged.size}`;
        merged.set(key, item);
    }
    return [...merged.values()];
}

function pruneQueueJobs(jobs) {
    const active = jobs.filter(job => job.status === 'pending' || job.status === 'running');
    const finalized = jobs.filter(job => job.status === 'completed' || job.status === 'cancelled').slice(-5000);
    return [...finalized, ...active];
}

function summarizeStatus(queue, now = new Date().toISOString()) {
    const pendingJobs = queue.jobs.filter(job => job.status === 'pending' || job.status === 'running');
    return {
        paused: Boolean(queue.paused),
        state: queue.paused ? 'paused' : queue.status.state,
        pendingCount: pendingJobs.length,
        dueCount: pendingJobs.filter(job => new Date(job.dueAt).getTime() <= new Date(now).getTime()).length,
        lastHeartbeatAt: queue.status.lastHeartbeatAt,
        lastRunAt: queue.status.lastRunAt,
        lastSuccessAt: queue.status.lastSuccessAt,
        lastError: queue.status.lastError,
        maxRunsPerHour: MAX_MODEL_RUNS_PER_HOUR,
    };
}

export class LeslieMomentsActivityStore {
    constructor(userRoot) {
        if (!path.isAbsolute(userRoot)) {
            throw new TypeError('Leslie moments activity storage requires an absolute user data directory.');
        }
        this.directory = path.join(userRoot, 'leslie', 'moments');
        this.activityPath = path.join(this.directory, 'activity.json');
        this.queuePath = path.join(this.directory, 'activity-queue.json');
        this.activityHistoryDirectory = path.join(this.directory, 'history', 'activity');
        this.queueHistoryDirectory = path.join(this.directory, 'history', 'activity-queue');
        this.migrationDirectory = path.join(this.directory, 'history', 'migrations');
    }

    readActivity() {
        if (!fs.existsSync(this.activityPath)) {
            return createInitialActivity();
        }
        const migration = migrateActivity(readJson(this.activityPath, 'activity'));
        const validated = validateActivity(migration.value);
        if (migration.migrated) {
            fs.mkdirSync(this.migrationDirectory, { recursive: true });
            fs.copyFileSync(this.activityPath, path.join(this.migrationDirectory, `activity-v${migration.fromVersion}-${Date.now()}.json`));
            writeJson(this.activityPath, validated);
        }
        return validated;
    }

    readQueue() {
        if (!fs.existsSync(this.queuePath)) {
            return createInitialQueue();
        }
        const migration = migrateQueue(readJson(this.queuePath, 'activity queue'));
        const validated = validateQueue(migration.value);
        if (migration.migrated) {
            fs.mkdirSync(this.migrationDirectory, { recursive: true });
            fs.copyFileSync(this.queuePath, path.join(this.migrationDirectory, `activity-queue-v${migration.fromVersion}-${Date.now()}.json`));
            writeJson(this.queuePath, validated);
        }
        return validated;
    }

    saveActivity(previous, next) {
        return saveVersioned({
            previous,
            next,
            filePath: this.activityPath,
            historyDirectory: this.activityHistoryDirectory,
            prefix: 'activity',
            schemaVersion: MOMENTS_ACTIVITY_SCHEMA_VERSION,
        });
    }

    saveQueue(previous, next, { snapshot = true } = {}) {
        return saveVersioned({
            previous,
            next,
            filePath: this.queuePath,
            historyDirectory: this.queueHistoryDirectory,
            prefix: 'queue',
            schemaVersion: MOMENTS_QUEUE_SCHEMA_VERSION,
            snapshot,
        });
    }

    decoratePosts(posts) {
        const activity = this.readActivity();
        return (Array.isArray(posts) ? posts : []).map((post) => {
            const postActivity = activity.posts[post.id] ?? { readReceipts: [], likes: [], comments: [] };
            const currentRevision = Number(post.revision ?? 1);
            const receipts = postActivity.readReceipts.filter(item => Number(item.postRevision) === currentRevision);
            const likes = postActivity.likes.filter(item => Number(item.postRevision) === currentRevision);
            const comments = postActivity.comments.filter(item => Number(item.postRevision) === currentRevision);
            return {
                ...post,
                readReceipts: mergeActivityItems(post.readReceipts, receipts),
                reactions: {
                    likes: mergeActivityItems(post.reactions?.likes, likes),
                    comments: mergeActivityItems(post.reactions?.comments, comments),
                },
                activityRevision: activity.revision,
            };
        });
    }

    planPost(post, candidates, { now = new Date().toISOString(), random = Math.random, enthusiasm = 'medium' } = {}) {
        const enthusiasmProfile = getMomentsActivityEnthusiasmProfile(enthusiasm);
        const actors = [...new Map((Array.isArray(candidates) ? candidates : [])
            .map(normalizeActor)
            .map(actor => [actor.entityId, actor])).values()].slice(0, enthusiasmProfile.actorLimit);
        const previous = this.readQueue();
        const next = structuredClone(previous);
        let changed = false;

        for (const job of next.jobs) {
            if (job.postId === post.id && (job.status === 'pending' || job.status === 'running')) {
                job.status = 'cancelled';
                job.updatedAt = now;
                job.cancelledAt = now;
                changed = true;
            }
        }

        actors.forEach((actor, index) => {
            const [minimum, maximum] = index === 0
                ? enthusiasmProfile.firstDelayRange
                : enthusiasmProfile.laterDelayRange;
            const offset = Math.round(minimum + Math.max(0, Math.min(1, Number(random()) || 0)) * (maximum - minimum));
            next.jobs.push({
                id: randomUUID(),
                type: 'read_post',
                postId: post.id,
                postRevision: Number(post.revision ?? 1),
                actor,
                priority: 50,
                triggerCommentId: null,
                dedupeKey: `read_post:${post.id}:${Number(post.revision ?? 1)}:${actor.entityId}`,
                status: 'pending',
                dueAt: addMilliseconds(now, offset),
                attempts: 0,
                leaseUntil: null,
                createdAt: now,
                updatedAt: now,
                completedAt: null,
                cancelledAt: null,
            });
            changed = true;
        });

        next.jobs = pruneQueueJobs(next.jobs);

        if (!changed) {
            return { jobs: [], queue: previous };
        }
        next.status.state = next.paused ? 'paused' : 'running';
        const saved = this.saveQueue(previous, next);
        return {
            jobs: saved.jobs.filter(job => job.postId === post.id && job.postRevision === Number(post.revision ?? 1) && job.status === 'pending'),
            queue: saved,
        };
    }

    reconcilePosts(posts, candidates, { now = new Date().toISOString(), random = Math.random, enthusiasm = 'medium' } = {}) {
        const activity = this.readActivity();
        const previous = this.readQueue();
        const next = structuredClone(previous);
        const profile = getMomentsActivityEnthusiasmProfile(enthusiasm);
        const fallbackActors = [...new Map((Array.isArray(candidates) ? candidates : [])
            .map(normalizeActor)
            .map(actor => [actor.entityId, actor])).values()];
        const planned = [];

        for (const post of Array.isArray(posts) ? posts : []) {
            if (planned.length >= 500) {
                break;
            }
            if (post.status !== 'active') {
                continue;
            }
            const postRevision = Number(post.revision ?? 1);
            const postActivity = activity.posts[post.id] ?? { readReceipts: [], comments: [] };
            const hasRecordedActivity = [...(post.readReceipts ?? []), ...(postActivity.readReceipts ?? [])]
                .some(item => Number(item.postRevision ?? postRevision) === postRevision)
                || [...(post.reactions?.comments ?? []), ...(postActivity.comments ?? [])]
                    .some(item => Number(item.postRevision ?? postRevision) === postRevision);
            const hasActiveJob = next.jobs.some(job => job.postId === post.id
                && Number(job.postRevision) === postRevision
                && (job.status === 'pending' || job.status === 'running'));
            if (hasRecordedActivity || hasActiveJob) {
                continue;
            }
            const visibleActors = post.visibility?.type === 'selected'
                ? post.visibility.targets.map(normalizeActor)
                : fallbackActors;
            const actors = [...new Map(visibleActors
                .filter(actor => actor.entityId !== post.author?.entityId)
                .map(actor => [actor.entityId, actor])).values()].slice(0, profile.actorLimit);
            actors.slice(0, Math.max(0, 500 - planned.length)).forEach((actor, index) => {
                const [minimum, maximum] = index === 0 ? profile.firstDelayRange : profile.laterDelayRange;
                const offset = Math.round(minimum + Math.max(0, Math.min(1, Number(random()) || 0)) * (maximum - minimum));
                const job = {
                    id: randomUUID(),
                    type: 'read_post',
                    postId: post.id,
                    postRevision,
                    actor,
                    priority: 50,
                    triggerCommentId: null,
                    dedupeKey: `read_post:${post.id}:${postRevision}:${actor.entityId}`,
                    status: 'pending',
                    dueAt: addMilliseconds(now, offset),
                    attempts: 0,
                    leaseUntil: null,
                    createdAt: now,
                    updatedAt: now,
                    completedAt: null,
                    cancelledAt: null,
                };
                next.jobs.push(job);
                planned.push(job);
            });
        }
        if (!planned.length) {
            return { jobs: [], queue: previous };
        }
        next.jobs = pruneQueueJobs(next.jobs);
        next.status.state = next.paused ? 'paused' : 'running';
        return { jobs: planned, queue: this.saveQueue(previous, next) };
    }

    addComment(post, actorValue, contentValue, { parentCommentId = null, now = new Date().toISOString(), source = 'user' } = {}) {
        const actor = (() => {
            try {
                return normalizeMomentIdentity(actorValue, ['persona', 'character']);
            } catch (error) {
                throw new LeslieMomentsActivityStoreError('INVALID_INPUT', error.message);
            }
        })();
        const content = cleanOptionalText(contentValue, 500);
        if (!content) {
            throw new LeslieMomentsActivityStoreError('INVALID_INPUT', 'A reply requires text.');
        }
        const previous = this.readActivity();
        const next = structuredClone(previous);
        const postActivity = getPostActivity(next, post.id);
        const currentComments = postActivity.comments.filter(item => Number(item.postRevision) === Number(post.revision ?? 1));
        const legacyComments = (post.reactions?.comments ?? [])
            .filter(item => Number(item.postRevision ?? post.revision ?? 1) === Number(post.revision ?? 1));
        const parent = parentCommentId ? [...legacyComments, ...currentComments].find(item => item.id === parentCommentId) : null;
        if (parentCommentId && !parent) {
            throw new LeslieMomentsActivityStoreError('NOT_FOUND', 'The comment being replied to was not found.');
        }
        if (currentComments.length >= 1000) {
            throw new LeslieMomentsActivityStoreError('LIMIT_REACHED', 'This moment has reached the reply storage limit.');
        }
        const id = randomUUID();
        const comment = {
            id,
            jobId: `manual:${id}`,
            actor,
            postRevision: Number(post.revision ?? 1),
            parentCommentId: parent?.id ?? null,
            rootCommentId: parent?.rootCommentId || parent?.id || id,
            content,
            createdAt: now,
            source: source === 'ai' ? 'ai' : 'user',
        };
        postActivity.comments.push(comment);
        this.saveActivity(previous, next);
        return comment;
    }

    planThread(post, triggerComment, candidates, { now = new Date().toISOString(), random = Math.random, enthusiasm = 'medium' } = {}) {
        const profile = getMomentsActivityEnthusiasmProfile(enthusiasm);
        const normalized = [...new Map((Array.isArray(candidates) ? candidates : [])
            .map(normalizeActor)
            .filter(actor => actor.entityId !== triggerComment.actor?.entityId)
            .map(actor => [actor.entityId, actor])).values()];
        normalized.sort((left, right) => {
            const targetId = triggerComment.parentActorEntityId;
            return Number(right.entityId === targetId) - Number(left.entityId === targetId);
        });
        const previous = this.readQueue();
        const next = structuredClone(previous);
        const jobs = [];
        const actorLimit = triggerComment.source === 'ai' ? 1 : profile.actorLimit;
        normalized.slice(0, actorLimit).forEach((actor, index) => {
            const dedupeKey = `review_thread:${post.id}:${post.revision}:${triggerComment.id}:${actor.entityId}`;
            if (next.jobs.some(job => job.dedupeKey === dedupeKey && job.status !== 'cancelled')) {
                return;
            }
            const minimum = index === 0 ? 20_000 : 60_000;
            const maximum = index === 0 ? 90_000 : 5 * 60_000;
            const offset = Math.round(minimum + Math.max(0, Math.min(1, Number(random()) || 0)) * (maximum - minimum));
            const job = {
                id: randomUUID(),
                type: 'review_thread',
                postId: post.id,
                postRevision: Number(post.revision ?? 1),
                actor,
                priority: triggerComment.parentActorEntityId === actor.entityId ? 100 : 80,
                triggerCommentId: triggerComment.id,
                dedupeKey,
                status: 'pending',
                dueAt: addMilliseconds(now, offset),
                attempts: 0,
                leaseUntil: null,
                createdAt: now,
                updatedAt: now,
                completedAt: null,
                cancelledAt: null,
            };
            next.jobs.push(job);
            jobs.push(job);
        });
        if (!jobs.length) {
            return { jobs: [], queue: previous };
        }
        next.jobs = pruneQueueJobs(next.jobs);
        next.status.state = next.paused ? 'paused' : 'running';
        return { jobs, queue: this.saveQueue(previous, next) };
    }

    syncPublisherJobs(policies, { now = new Date().toISOString(), random = Math.random } = {}) {
        const previous = this.readQueue();
        const next = structuredClone(previous);
        const jobs = [];
        for (const policy of Array.isArray(policies) ? policies : []) {
            if (!policy?.canPost || !PUBLISHING_DELAY_RANGES[policy.frequency]) {
                continue;
            }
            const actor = normalizeActor(policy.actor);
            const existing = next.jobs.some(job => job.type === 'compose_post'
                && job.actor?.entityId === actor.entityId
                && (job.status === 'pending' || job.status === 'running'));
            if (existing) {
                continue;
            }
            const [minimum, maximum] = PUBLISHING_DELAY_RANGES[policy.frequency];
            const offset = Math.round(minimum + Math.max(0, Math.min(1, Number(random()) || 0)) * (maximum - minimum));
            const job = {
                id: randomUUID(),
                type: 'compose_post',
                postId: null,
                postRevision: 0,
                actor,
                priority: 10,
                triggerCommentId: null,
                dedupeKey: `compose_post:${actor.entityId}:${now}`,
                status: 'pending',
                dueAt: addMilliseconds(now, offset),
                attempts: 0,
                leaseUntil: null,
                createdAt: now,
                updatedAt: now,
                completedAt: null,
                cancelledAt: null,
            };
            next.jobs.push(job);
            jobs.push(job);
        }
        if (!jobs.length) {
            return { jobs: [], queue: previous };
        }
        next.jobs = pruneQueueJobs(next.jobs);
        next.status.state = next.paused ? 'paused' : 'running';
        return { jobs, queue: this.saveQueue(previous, next) };
    }

    cancelPublisherJobs(allowedActorIds = [], { now = new Date().toISOString() } = {}) {
        const allowed = new Set(Array.isArray(allowedActorIds) ? allowedActorIds : []);
        const previous = this.readQueue();
        const next = structuredClone(previous);
        let changed = false;
        for (const job of next.jobs) {
            if (job.type === 'compose_post'
                && (job.status === 'pending' || job.status === 'running')
                && !allowed.has(job.actor?.entityId)) {
                job.status = 'cancelled';
                job.leaseUntil = null;
                job.cancelledAt = now;
                job.updatedAt = now;
                changed = true;
            }
        }
        return changed ? this.saveQueue(previous, next) : previous;
    }

    cancelPost(postId, { now = new Date().toISOString() } = {}) {
        const previous = this.readQueue();
        const next = structuredClone(previous);
        let changed = false;
        for (const job of next.jobs) {
            if (job.postId === postId && (job.status === 'pending' || job.status === 'running')) {
                job.status = 'cancelled';
                job.updatedAt = now;
                job.cancelledAt = now;
                changed = true;
            }
        }
        return changed ? this.saveQueue(previous, next) : previous;
    }

    claimJob(posts, { now = new Date().toISOString() } = {}) {
        const previous = this.readQueue();
        const next = structuredClone(previous);
        const nowTime = new Date(now).getTime();
        const cutoff = nowTime - 60 * 60_000;
        const postsById = new Map((Array.isArray(posts) ? posts : []).map(post => [post.id, post]));
        let changed = false;

        next.recentRuns = next.recentRuns.filter(value => Number.isFinite(new Date(value).getTime()) && new Date(value).getTime() > cutoff);
        if (next.recentRuns.length !== previous.recentRuns.length) {
            changed = true;
        }
        for (const job of next.jobs) {
            if (job.status === 'running' && job.leaseUntil && new Date(job.leaseUntil).getTime() <= nowTime) {
                job.status = 'pending';
                job.leaseUntil = null;
                job.dueAt = now;
                job.updatedAt = now;
                changed = true;
            }
            if (job.status !== 'pending') {
                continue;
            }
            if (job.type === 'compose_post') {
                continue;
            }
            const post = postsById.get(job.postId);
            if (!post || post.status !== 'active' || Number(post.revision ?? 1) !== Number(job.postRevision)) {
                job.status = 'cancelled';
                job.cancelledAt = now;
                job.updatedAt = now;
                changed = true;
            }
        }

        if (next.paused || next.recentRuns.length >= MAX_MODEL_RUNS_PER_HOUR) {
            if (changed) {
                this.saveQueue(previous, next);
            }
            return { job: null, post: null, status: summarizeStatus(next, now) };
        }

        const job = next.jobs
            .filter(item => item.status === 'pending' && new Date(item.dueAt).getTime() <= nowTime)
            .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0)
                || String(left.dueAt).localeCompare(String(right.dueAt)))[0];
        if (!job) {
            if (changed) {
                this.saveQueue(previous, next);
            }
            return { job: null, post: null, status: summarizeStatus(next, now) };
        }

        job.status = 'running';
        job.leaseUntil = addMilliseconds(now, LEASE_DURATION_MS);
        job.updatedAt = now;
        next.recentRuns.push(now);
        next.status.state = 'busy';
        next.status.lastRunAt = now;
        const saved = this.saveQueue(previous, next);
        const savedJob = saved.jobs.find(item => item.id === job.id);
        return {
            job: savedJob,
            post: savedJob.type === 'compose_post' ? null : postsById.get(savedJob.postId),
            status: summarizeStatus(saved, now),
        };
    }

    completeJob(jobId, value, { now = new Date().toISOString(), knownComments = [] } = {}) {
        let action = cleanOptionalText(value?.action, 40);
        if (!ACTIONS.includes(action)) {
            throw new LeslieMomentsActivityStoreError('INVALID_INPUT', 'Unsupported Leslie moments interaction action.');
        }
        const comment = cleanOptionalText(value?.comment, 500);
        if ((action === 'comment' || action === 'reply' || action === 'like_and_comment') && !comment) {
            throw new LeslieMomentsActivityStoreError('INVALID_INPUT', 'A comment action requires comment text.');
        }

        const previousQueue = this.readQueue();
        const nextQueue = structuredClone(previousQueue);
        const job = nextQueue.jobs.find(item => item.id === jobId);
        if (!job) {
            throw new LeslieMomentsActivityStoreError('NOT_FOUND', 'The requested Leslie moments activity job was not found.');
        }
        if (job.status === 'cancelled') {
            return getPostActivity(this.readActivity(), job.postId);
        }
        if (job.type === 'compose_post') {
            throw new LeslieMomentsActivityStoreError('INVALID_STATE', 'A publishing job must use the publishing completion path.');
        }

        const previousActivity = this.readActivity();
        const nextActivity = structuredClone(previousActivity);
        const postActivity = getPostActivity(nextActivity, job.postId);
        const existingReceipt = postActivity.readReceipts.find(item => item.jobId === job.id);
        if (!existingReceipt) {
            const receipt = {
                id: randomUUID(),
                jobId: job.id,
                actor: job.actor,
                postRevision: job.postRevision,
                action,
                readAt: now,
            };
            postActivity.readReceipts.push(receipt);
            if (action === 'like' || action === 'like_and_comment') {
                const existingLike = postActivity.likes.some(item => item.actor?.entityId === job.actor.entityId
                    && Number(item.postRevision) === Number(job.postRevision));
                if (!existingLike) {
                    postActivity.likes.push({
                        id: randomUUID(),
                        jobId: job.id,
                        actor: job.actor,
                        postRevision: job.postRevision,
                        createdAt: now,
                        source: 'ai',
                    });
                }
            }
            if (action === 'comment' || action === 'reply' || action === 'like_and_comment') {
                const requestedParentId = cleanOptionalText(value?.targetCommentId, 80) || null;
                const parent = requestedParentId
                    ? [...(Array.isArray(knownComments) ? knownComments : []), ...postActivity.comments]
                        .find(item => item.id === requestedParentId && Number(item.postRevision ?? job.postRevision) === Number(job.postRevision))
                    : null;
                const parentCommentId = action === 'reply' ? (parent?.id ?? null) : null;
                if (action === 'reply' && !parentCommentId) {
                    throw new LeslieMomentsActivityStoreError('INVALID_INPUT', 'The reply target was not found.');
                }
                if (postActivity.comments.filter(item => Number(item.postRevision) === Number(job.postRevision)).length >= 1000) {
                    throw new LeslieMomentsActivityStoreError('LIMIT_REACHED', 'This moment has reached the reply storage limit.');
                }
                const commentId = randomUUID();
                postActivity.comments.push({
                    id: commentId,
                    jobId: job.id,
                    actor: job.actor,
                    postRevision: job.postRevision,
                    parentCommentId,
                    rootCommentId: parent?.rootCommentId || parent?.id || commentId,
                    content: comment,
                    createdAt: now,
                    source: 'ai',
                });
            }
            this.saveActivity(previousActivity, nextActivity);
        }

        if (job.status !== 'completed') {
            job.status = 'completed';
            job.leaseUntil = null;
            job.completedAt = now;
            job.updatedAt = now;
            job.resultAction = action;
            nextQueue.status.state = nextQueue.paused ? 'paused' : 'running';
            nextQueue.status.lastSuccessAt = now;
            nextQueue.status.lastError = null;
            this.saveQueue(previousQueue, nextQueue);
        }
        return getPostActivity(this.readActivity(), job.postId);
    }

    completeComposeJob(jobId, { publishedPostId = null, skipped = false, now = new Date().toISOString() } = {}) {
        const previous = this.readQueue();
        const next = structuredClone(previous);
        const job = next.jobs.find(item => item.id === jobId);
        if (!job) {
            throw new LeslieMomentsActivityStoreError('NOT_FOUND', 'The requested Leslie moments publishing job was not found.');
        }
        if (job.type !== 'compose_post') {
            throw new LeslieMomentsActivityStoreError('INVALID_STATE', 'The requested job is not a publishing job.');
        }
        if (job.status === 'completed' || job.status === 'cancelled') {
            return job;
        }
        job.status = 'completed';
        job.leaseUntil = null;
        job.completedAt = now;
        job.updatedAt = now;
        job.resultAction = skipped ? 'skip' : 'publish';
        job.publishedPostId = publishedPostId;
        next.status.state = next.paused ? 'paused' : 'running';
        next.status.lastSuccessAt = now;
        next.status.lastError = null;
        this.saveQueue(previous, next);
        return job;
    }

    getJob(jobId) {
        const job = this.readQueue().jobs.find(item => item.id === jobId);
        if (!job) {
            throw new LeslieMomentsActivityStoreError('NOT_FOUND', 'The requested Leslie moments activity job was not found.');
        }
        return job;
    }

    failJob(jobId, errorMessage, { now = new Date().toISOString(), retryAfterMs = null } = {}) {
        const previous = this.readQueue();
        const next = structuredClone(previous);
        const job = next.jobs.find(item => item.id === jobId);
        if (!job) {
            throw new LeslieMomentsActivityStoreError('NOT_FOUND', 'The requested Leslie moments activity job was not found.');
        }
        if (job.status === 'completed' || job.status === 'cancelled') {
            return job;
        }
        job.attempts = Number(job.attempts ?? 0) + 1;
        const requestedDelay = Number(retryAfterMs);
        const backoff = Number.isFinite(requestedDelay)
            ? Math.max(60_000, Math.min(requestedDelay, 30 * 60_000))
            : Math.min(30 * 60_000, 5 * 60_000 * (2 ** Math.max(0, job.attempts - 1)));
        job.status = 'pending';
        job.leaseUntil = null;
        job.dueAt = addMilliseconds(now, backoff);
        job.updatedAt = now;
        job.lastError = cleanOptionalText(errorMessage, 300) || 'Background interaction failed.';
        next.status.state = next.paused ? 'paused' : 'error';
        next.status.lastError = job.lastError;
        this.saveQueue(previous, next);
        return job;
    }

    setPaused(paused, { now = new Date().toISOString() } = {}) {
        const previous = this.readQueue();
        const next = structuredClone(previous);
        next.paused = Boolean(paused);
        next.status.state = next.paused ? 'paused' : 'running';
        next.status.lastHeartbeatAt = now;
        if (!next.paused) {
            next.status.lastError = null;
        }
        const saved = this.saveQueue(previous, next);
        return summarizeStatus(saved, now);
    }

    heartbeat(state, errorMessage = null, { now = new Date().toISOString() } = {}) {
        if (!HEARTBEAT_STATES.includes(state)) {
            throw new LeslieMomentsActivityStoreError('INVALID_INPUT', 'Unsupported Leslie moments background state.');
        }
        const previous = this.readQueue();
        const normalizedError = errorMessage ? cleanOptionalText(errorMessage, 300) : null;
        const lastHeartbeatTime = previous.status.lastHeartbeatAt ? new Date(previous.status.lastHeartbeatAt).getTime() : 0;
        const heartbeatIsFresh = Number.isFinite(lastHeartbeatTime) && new Date(now).getTime() - lastHeartbeatTime < 5 * 60_000;
        const nextState = previous.paused ? 'paused' : state;
        const nextError = normalizedError || (state === 'error' ? previous.status.lastError : null);
        if (heartbeatIsFresh && previous.status.state === nextState && previous.status.lastError === nextError) {
            return summarizeStatus(previous, now);
        }
        const next = structuredClone(previous);
        next.status.state = nextState;
        next.status.lastHeartbeatAt = now;
        next.status.lastError = nextError;
        const saved = this.saveQueue(previous, next, { snapshot: false });
        return summarizeStatus(saved, now);
    }

    getStatus({ now = new Date().toISOString() } = {}) {
        return summarizeStatus(this.readQueue(), now);
    }
}
