import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { normalizeMomentIdentity } from './schema.js';

export const MOMENTS_ACTIVITY_SCHEMA_VERSION = 1;
export const MOMENTS_QUEUE_SCHEMA_VERSION = 1;

const ACTIONS = Object.freeze(['read', 'like', 'comment', 'like_and_comment']);
const HEARTBEAT_STATES = Object.freeze(['starting', 'running', 'busy', 'busy_foreground', 'waiting_model', 'paused', 'error']);
const MAX_MODEL_RUNS_PER_HOUR = 8;
const LEASE_DURATION_MS = 5 * 60_000;

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
                    normalizeMomentIdentity(item.actor, ['character', 'group']);
                } catch (error) {
                    throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', `A Leslie moments ${field} actor is invalid. ${error.message}`);
                }
                if (field === 'comments' && (!String(item.content ?? '').trim() || String(item.content).length > 500)) {
                    throw new LeslieMomentsActivityStoreError('CORRUPT_DATA', 'A Leslie moments comment is invalid.');
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
            || !String(job.postId ?? '').trim()
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
    }

    readActivity() {
        return fs.existsSync(this.activityPath)
            ? validateActivity(readJson(this.activityPath, 'activity'))
            : createInitialActivity();
    }

    readQueue() {
        return fs.existsSync(this.queuePath)
            ? validateQueue(readJson(this.queuePath, 'activity queue'))
            : createInitialQueue();
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
                postId: post.id,
                postRevision: Number(post.revision ?? 1),
                actor,
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
            .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))[0];
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
            post: postsById.get(savedJob.postId),
            status: summarizeStatus(saved, now),
        };
    }

    completeJob(jobId, value, { now = new Date().toISOString() } = {}) {
        let action = cleanOptionalText(value?.action, 40);
        if (!ACTIONS.includes(action)) {
            throw new LeslieMomentsActivityStoreError('INVALID_INPUT', 'Unsupported Leslie moments interaction action.');
        }
        const comment = cleanOptionalText(value?.comment, 500);
        if ((action === 'comment' || action === 'like_and_comment') && !comment) {
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

        const previousActivity = this.readActivity();
        const nextActivity = structuredClone(previousActivity);
        const postActivity = getPostActivity(nextActivity, job.postId);
        const currentCommentCount = postActivity.comments.filter(item => Number(item.postRevision) === Number(job.postRevision)).length;
        if (currentCommentCount >= 2 && action === 'comment') {
            action = 'read';
        } else if (currentCommentCount >= 2 && action === 'like_and_comment') {
            action = 'like';
        }
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
                postActivity.likes.push({
                    id: randomUUID(),
                    jobId: job.id,
                    actor: job.actor,
                    postRevision: job.postRevision,
                    createdAt: now,
                    source: 'ai',
                });
            }
            if (action === 'comment' || action === 'like_and_comment') {
                postActivity.comments.push({
                    id: randomUUID(),
                    jobId: job.id,
                    actor: job.actor,
                    postRevision: job.postRevision,
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
