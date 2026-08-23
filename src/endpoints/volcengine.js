import fetch from 'node-fetch';
import { Router } from 'express';

import { readSecret, SECRET_KEYS } from './secrets.js';
import {
    buildVolcenginePayload,
    normalizeVolcengineRequest,
    parseVolcengineStreamLine,
    parseVolcengineUpstreamError,
    VolcengineRequestError,
    VOLCENGINE_TTS_TIMEOUT_MS,
} from '../leslie-tts/volcengine.js';
import {
    parseVolcengineVoiceCatalog,
    readVolcengineVoiceDocument,
    VOLCENGINE_VOICE_DOC_API,
    VOLCENGINE_VOICE_DOC_TIMEOUT_MS,
} from '../leslie-tts/volcengine-voices.js';

export const router = Router();

const VOICE_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
let voiceCatalogCache = null;

export async function handleListVolcengineVoices(_req, res) {
    try {
        if (voiceCatalogCache?.expiresAt > Date.now()) {
            res.set('Cache-Control', 'private, max-age=3600');
            return res.json(voiceCatalogCache.payload);
        }

        const response = await fetch(VOLCENGINE_VOICE_DOC_API, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(VOLCENGINE_VOICE_DOC_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`Volcengine docs returned HTTP ${response.status}`);

        const document = readVolcengineVoiceDocument(await response.json());
        const voices = parseVolcengineVoiceCatalog(document.markdown);
        if (voices.length === 0) throw new Error('No public TTS voices were found in the Volcengine docs.');

        const payload = {
            voices,
            source: 'volcengine-official-docs',
            updated_at: document.updatedAt,
        };
        voiceCatalogCache = { expiresAt: Date.now() + VOICE_CATALOG_TTL_MS, payload };
        res.set('Cache-Control', 'private, max-age=3600');
        return res.json(payload);
    } catch (error) {
        console.warn('Unable to refresh Volcengine voice catalog', error?.message || error);
        if (voiceCatalogCache?.payload) return res.json(voiceCatalogCache.payload);
        return res.status(502).send('暂时无法读取火山引擎官方音色目录，请稍后重试。');
    }
}

router.get('/voices', handleListVolcengineVoices);


export async function handleGenerateVolcengineVoice(req, res) {
    try {
        const appId = readSecret(req.user.directories, SECRET_KEYS.VOLCENGINE_APP_ID);
        const accessKey = readSecret(req.user.directories, SECRET_KEYS.VOLCENGINE_ACCESS_KEY);

        if (!appId || !accessKey) {
            console.warn('Volcengine TTS request rejected: credentials are not configured');
            return res.status(403).send('请先保存火山引擎 App ID 和 Access Key。');
        }

        const request = normalizeVolcengineRequest(req.body);
        const startedAt = performance.now();

        const response = await fetch(request.endpoint, {
            method: 'POST',
            headers: {
                'X-Api-App-Id': appId,
                'X-Api-Access-Key': accessKey,
                'X-Api-Resource-Id': request.resourceId,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildVolcenginePayload(request)),
            signal: AbortSignal.timeout(VOLCENGINE_TTS_TIMEOUT_MS),
        });

        const logId = response.headers.get('X-Tt-Logid') || '';
        if (logId) {
            res.set('X-Tt-Logid', logId);
        }

        if (!response.ok) {
            const upstream = parseVolcengineUpstreamError({
                apiStatusCode: response.headers.get('X-Api-Status-Code'),
                apiMessage: response.headers.get('X-Api-Message'),
                body: await response.text(),
            });
            console.warn('Volcengine TTS upstream request failed', {
                httpStatus: response.status,
                code: upstream.code,
                message: upstream.message,
                logId,
                resourceId: request.resourceId,
                speaker: request.speaker,
            });
            const reason = [upstream.code, upstream.message].filter(Boolean).join(' · ');
            const reasonText = reason ? `：${reason}` : '';
            const logText = logId ? `（日志 ID：${logId}）` : '';
            return res.status(502).send(`火山引擎语音服务请求失败（HTTP ${response.status}）${reasonText}${logText}`);
        }

        const decoder = new TextDecoder();
        const audioChunks = [];
        let buffer = '';
        if (!response.body) {
            throw new VolcengineRequestError('火山引擎没有返回语音数据。', 502);
        }

        for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                const audioChunk = parseVolcengineStreamLine(line);
                if (audioChunk) audioChunks.push(audioChunk);
            }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
            const audioChunk = parseVolcengineStreamLine(buffer);
            if (audioChunk) audioChunks.push(audioChunk);
        }

        if (audioChunks.length === 0) {
            throw new VolcengineRequestError('火山引擎没有返回可播放的语音。', 502);
        }

        const finalAudioData = Buffer.concat(audioChunks);
        if (finalAudioData.length === 0) {
            throw new VolcengineRequestError('火山引擎返回了空的语音文件。', 502);
        }

        res.set('Content-Type', 'audio/mpeg');
        res.set('Cache-Control', 'no-store');
        console.info('Volcengine TTS generated audio', {
            bytes: finalAudioData.length,
            durationMs: Math.round(performance.now() - startedAt),
            resourceId: request.resourceId,
            speaker: request.speaker,
        });
        res.status(200).send(finalAudioData);
    } catch (error) {
        if (error instanceof VolcengineRequestError) {
            return res.status(error.status).send(error.message);
        }
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            console.warn('Volcengine TTS request timed out');
            return res.status(504).send('火山引擎语音生成超时，请稍后重试。');
        }

        console.error('Volcengine TTS request failed', error);
        return res.status(502).send('语音生成失败，请检查火山引擎配置后重试。');
    }
}

router.post('/generate-voice', handleGenerateVolcengineVoice);
