import type { BaseIssue, BaseSchema } from 'valibot'

import type {
  LeslieBridgeCancelChatResponse,
  LeslieBridgeChatModel,
  LeslieBridgeChatRequest,
  LeslieBridgeChatStreamFrame,
  LeslieBridgeModel,
  LeslieBridgeSpeechRequest,
  LeslieBridgeSpeechResponse,
  LeslieBridgeStatus,
  LeslieBridgeTranscriptionRequest,
  LeslieBridgeTranscriptionResponse,
  LeslieBridgeVoice,
  LeslieCompanionState,
} from '../../../../shared/eventa/leslie-bridge'

import { Buffer } from 'node:buffer'
import { env } from 'node:process'

import { errorMessageFrom } from '@moeru/std'
import { array, boolean, literal, nullable, number, object, optional, parse, string } from 'valibot'

const protocolSchema = object({
  name: string(),
  version: string(),
})

const healthSchema = object({
  status: literal('ok'),
  service: string(),
  protocol: protocolSchema,
})

const capabilitiesSchema = object({
  service: string(),
  protocol: protocolSchema,
  capabilities: object({
    chat: object({
      available: boolean(),
      authoritativeStore: string(),
      binding: string(),
      protocol: string(),
    }),
    speech: object({
      available: boolean(),
      model: string(),
      responseFormats: array(string()),
    }),
    transcription: object({
      available: boolean(),
      model: string(),
      provider: string(),
      responseFormats: array(string()),
    }),
  }),
})

const transcriptionResponseSchema = object({
  text: string(),
})

const companionStateSchema = object({
  binding: nullable(object({
    characterId: string(),
    characterName: string(),
    chatId: string(),
    personaName: string(),
  })),
  characters: array(object({
    avatar: string(),
    id: string(),
    name: string(),
  })),
  connected: boolean(),
  generating: boolean(),
  voice: object({
    available: boolean(),
    languageMode: optional(string(), 'auto'),
    resourceId: optional(string(), ''),
    speakerId: optional(string(), ''),
    speed: optional(number(), 0),
  }),
})

type Schema<T> = BaseSchema<unknown, T, BaseIssue<unknown>>
type BridgeEnvironment = Record<string, string | undefined>
type Fetch = typeof globalThis.fetch

interface BridgeConfig {
  baseUrl: string
  error?: string
  token?: string
}

export interface CreateLeslieBridgeClientOptions {
  environment?: BridgeEnvironment
  fetch?: Fetch
}

const BRIDGE_PATH = '/api/leslie/bridge/v1/'
const DEFAULT_BASE_URL = `http://127.0.0.1:8000${BRIDGE_PATH}`
const CHAT_REQUEST_TIMEOUT_MS = 10 * 60_000
const MAX_CHAT_REQUEST_BYTES = 2 * 1024 * 1024
const MAX_CHAT_RESPONSE_BYTES = 32 * 1024 * 1024
const MAX_AUDIO_BYTES = 32 * 1024 * 1024
const MAX_TRANSCRIPTION_BYTES = 32 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000
const TRANSCRIPTION_REQUEST_TIMEOUT_MS = 10 * 60_000
const TOKEN_MAX_BYTES = 512
const TOKEN_MIN_BYTES = 32

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]')
    return true

  const octets = hostname.split('.')
  return octets.length === 4
    && octets[0] === '127'
    && octets.every(octet => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)
}

function readBridgeConfig(environment: BridgeEnvironment): BridgeConfig {
  const baseUrlInput = environment.LESLIE_BRIDGE_BASE_URL?.trim() || DEFAULT_BASE_URL
  const token = environment.LESLIE_BRIDGE_TOKEN?.trim()

  let url: URL
  try {
    url = new URL(baseUrlInput)
  }
  catch {
    return { baseUrl: baseUrlInput, error: 'LESLIE_BRIDGE_BASE_URL must be an absolute URL.' }
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { baseUrl: baseUrlInput, error: 'LESLIE_BRIDGE_BASE_URL must use HTTP or HTTPS.' }
  }
  if (!isLoopbackHostname(url.hostname)) {
    return { baseUrl: baseUrlInput, error: 'LESLIE_BRIDGE_BASE_URL must use a loopback host.' }
  }
  if (url.username || url.password || url.search || url.hash) {
    return { baseUrl: baseUrlInput, error: 'LESLIE_BRIDGE_BASE_URL must not contain credentials, a query, or a fragment.' }
  }

  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  if (url.pathname !== BRIDGE_PATH) {
    return { baseUrl: baseUrlInput, error: `LESLIE_BRIDGE_BASE_URL must end with ${BRIDGE_PATH}.` }
  }

  const tokenBytes = new TextEncoder().encode(token ?? '').byteLength
  if (tokenBytes < TOKEN_MIN_BYTES || tokenBytes > TOKEN_MAX_BYTES) {
    return {
      baseUrl: url.toString(),
      error: `LESLIE_BRIDGE_TOKEN must contain between ${TOKEN_MIN_BYTES} and ${TOKEN_MAX_BYTES} UTF-8 bytes.`,
    }
  }

  return { baseUrl: url.toString(), token }
}

function parsePayload<T>(schema: Schema<T>, payload: unknown): T {
  return parse(schema, payload)
}

/**
 * Creates the Electron-owned client for the local Leslie Bridge.
 *
 * The client stores the bearer token in this closure. Public results never contain the token.
 */
export function createLeslieBridgeClient(options: CreateLeslieBridgeClientOptions = {}) {
  const config = readBridgeConfig(options.environment ?? env)
  const fetch = options.fetch ?? globalThis.fetch
  const lifecycleController = new AbortController()
  const chatControllers = new Map<string, AbortController>()

  function requireToken(): string {
    if (!config.token)
      throw new Error(config.error ?? 'Set LESLIE_BRIDGE_TOKEN before AIRI starts.')
    return config.token
  }

  async function requestRaw(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    if (lifecycleController.signal.aborted)
      throw new Error('Leslie Bridge client is closed.')

    return fetch(new URL(path, config.baseUrl), {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${requireToken()}`,
        ...init?.headers,
      },
      signal: AbortSignal.any([
        lifecycleController.signal,
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(timeoutMs),
      ]),
    })
  }

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const response = await requestRaw(path, init)
    if (!response.ok)
      throw new Error(`Leslie Bridge request failed with HTTP ${response.status}.`)
    return response
  }

  async function requestJson<T>(path: string, schema: Schema<T>): Promise<T> {
    const response = await request(path)
    return parsePayload(schema, await response.json())
  }

  async function getCompanionState(): Promise<LeslieCompanionState> {
    return requestJson('companion/state', companionStateSchema)
  }

  async function getStatus(): Promise<LeslieBridgeStatus> {
    if (!config.token) {
      return {
        baseUrl: config.baseUrl,
        binding: null,
        chatAvailable: false,
        companionConnected: false,
        configured: false,
        error: config.error,
        speechAvailable: false,
        state: 'disabled',
        transcriptionAvailable: false,
      }
    }

    try {
      const [health, capabilities, companion] = await Promise.all([
        requestJson('health', healthSchema),
        requestJson('capabilities', capabilitiesSchema),
        getCompanionState(),
      ])
      const compatible = health.protocol.name === 'leslie-bridge'
        && health.protocol.version === '1'
        && health.service === 'leslie-tavern'
        && capabilities.service === health.service
        && capabilities.protocol.name === health.protocol.name
        && capabilities.protocol.version === health.protocol.version
        && capabilities.capabilities.chat.authoritativeStore === 'leslie-tavern'
        && capabilities.capabilities.chat.binding === 'active-leslie-character'
        && capabilities.capabilities.chat.protocol === 'openai-chat-completions'
        && capabilities.capabilities.speech.model === 'leslie-volcengine-tts'
        && capabilities.capabilities.speech.responseFormats.includes('mp3')
        && capabilities.capabilities.transcription.available
        && capabilities.capabilities.transcription.model === 'leslie-local-whisper'
        && capabilities.capabilities.transcription.provider === 'leslie-local-transformers'
        && capabilities.capabilities.transcription.responseFormats.includes('json')

      return {
        baseUrl: config.baseUrl,
        binding: companion.binding,
        chatAvailable: capabilities.capabilities.chat.available,
        companionConnected: companion.connected,
        configured: true,
        error: compatible ? undefined : 'The Leslie Bridge version 1 speech contract is required.',
        protocolVersion: health.protocol.version,
        speechAvailable: capabilities.capabilities.speech.available,
        state: compatible ? 'ready' : 'incompatible',
        transcriptionAvailable: capabilities.capabilities.transcription.available,
      }
    }
    catch (error) {
      return {
        baseUrl: config.baseUrl,
        binding: null,
        chatAvailable: false,
        companionConnected: false,
        configured: true,
        error: error instanceof TypeError
          ? errorMessageFrom(error) ?? 'Leslie Bridge is not available.'
          : 'Leslie Bridge is not available or returned an invalid response.',
        speechAvailable: false,
        state: 'unavailable',
        transcriptionAvailable: false,
      }
    }
  }

  async function listModels(): Promise<LeslieBridgeModel[]> {
    return [
      {
        deprecated: false,
        description: 'The voice assigned to the active LeslieTavern character.',
        id: 'leslie-volcengine-tts',
        name: 'leslie-volcengine-tts',
        provider: 'leslie-tavern',
      },
      {
        deprecated: false,
        description: 'LeslieTavern local speech recognition.',
        id: 'leslie-local-whisper',
        name: 'leslie-local-whisper',
        provider: 'leslie-tavern',
      },
    ]
  }

  async function listChatModels(): Promise<LeslieBridgeChatModel[]> {
    return [{
      deprecated: false,
      description: 'The active LeslieTavern character, chat, memory, and model.',
      id: 'leslie-current-chat',
      name: 'Current Leslie character',
      provider: 'leslie-tavern-chat',
    }]
  }

  async function* streamChat(payload: LeslieBridgeChatRequest): AsyncGenerator<LeslieBridgeChatStreamFrame> {
    if (!/^[\w.:-]{8,128}$/u.test(payload.requestId))
      throw new Error('The Leslie Bridge chat request ID is not valid.')

    const bodyBytes = new TextEncoder().encode(payload.body).byteLength
    if (bodyBytes === 0 || bodyBytes > MAX_CHAT_REQUEST_BYTES)
      throw new Error('The Leslie Bridge chat request body is too large or empty.')

    let body: unknown
    try {
      body = JSON.parse(payload.body)
    }
    catch {
      throw new Error('The Leslie Bridge chat request body is not valid JSON.')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('The Leslie Bridge chat request body must be a JSON object.')

    const controller = new AbortController()
    if (chatControllers.has(payload.requestId))
      throw new Error('The Leslie Bridge chat request ID is already active.')
    chatControllers.set(payload.requestId, controller)

    try {
      const response = await requestRaw('chat/completions', {
        body: payload.body,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      }, CHAT_REQUEST_TIMEOUT_MS)
      const contentType = response.headers.get('Content-Type')?.split(';')[0].trim() || 'application/octet-stream'
      if (!['application/json', 'text/event-stream'].includes(contentType))
        throw new Error('Leslie Bridge returned an unsupported chat response format.')

      yield {
        contentType,
        status: response.status,
        statusText: response.statusText,
        type: 'start',
      }

      if (!response.body)
        return

      let responseBytes = 0
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          responseBytes += value.byteLength
          if (responseBytes > MAX_CHAT_RESPONSE_BYTES)
            throw new Error('Leslie Bridge returned a chat response that is too large.')
          yield { data: value, type: 'data' }
        }
      }
      finally {
        reader.releaseLock()
      }
    }
    finally {
      chatControllers.delete(payload.requestId)
    }
  }

  function cancelChat(requestId: string): LeslieBridgeCancelChatResponse {
    const controller = chatControllers.get(requestId)
    if (!controller)
      return { canceled: false }
    controller.abort('AIRI canceled the Leslie Bridge chat request.')
    return { canceled: true }
  }

  async function listVoices(): Promise<LeslieBridgeVoice[]> {
    return [{
      compatibleModels: ['leslie-volcengine-tts'],
      id: 'leslie-bound-character',
      languages: [{ code: 'und', title: 'LeslieTavern' }],
      name: 'Current Leslie character',
      provider: 'leslie-tavern',
    }]
  }

  async function createSpeech(payload: LeslieBridgeSpeechRequest): Promise<LeslieBridgeSpeechResponse> {
    const input = payload.input.trim()
    if (!input || input.length > 10_000)
      throw new Error('Speech input must contain between 1 and 10000 characters.')
    const startedAt = performance.now()
    console.info('AIRI Leslie companion speech request started.', { characters: input.length })
    try {
      const response = await request('companion/audio/speech', {
        body: JSON.stringify({
          input,
          model: 'leslie-volcengine-tts',
          response_format: 'mp3',
        }),
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      const contentType = response.headers.get('Content-Type')?.split(';')[0].trim()
      if (contentType !== 'audio/mpeg')
        throw new Error('Leslie Bridge returned an unsupported speech format.')

      const contentLength = Number(response.headers.get('Content-Length') ?? 0)
      if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES)
        throw new Error('Leslie Bridge returned a speech file that is too large.')

      const audio = new Uint8Array(await response.arrayBuffer())
      if (audio.byteLength === 0)
        throw new Error('Leslie Bridge returned an empty speech file.')
      if (audio.byteLength > MAX_AUDIO_BYTES)
        throw new Error('Leslie Bridge returned a speech file that is too large.')

      console.info('AIRI Leslie companion speech request completed.', {
        bytes: audio.byteLength,
        durationMs: Math.round(performance.now() - startedAt),
      })
      return { audio, contentType: 'audio/mpeg' }
    }
    catch (error) {
      console.warn('AIRI Leslie companion speech request failed.', {
        durationMs: Math.round(performance.now() - startedAt),
        error: errorMessageFrom(error) ?? 'Unknown speech error.',
      })
      throw error
    }
  }

  async function createTranscription(payload: LeslieBridgeTranscriptionRequest): Promise<LeslieBridgeTranscriptionResponse> {
    if (payload.model !== 'leslie-local-whisper')
      throw new Error('Use the leslie-local-whisper transcription model.')
    if (!['audio/wav', 'audio/x-wav'].includes(payload.contentType.toLowerCase()))
      throw new Error('The Leslie Bridge transcription input must be WAV audio.')
    if (payload.audio.byteLength === 0 || payload.audio.byteLength > MAX_TRANSCRIPTION_BYTES)
      throw new Error('The Leslie Bridge transcription input is empty or too large.')
    const language = payload.language?.trim() ?? ''
    if (language.length > 32)
      throw new Error('The Leslie Bridge transcription language is too long.')

    const response = await requestRaw('companion/audio/transcriptions', {
      body: JSON.stringify({
        audio: Buffer.from(payload.audio).toString('base64'),
        content_type: payload.contentType.toLowerCase(),
        language,
        model: 'leslie-local-whisper',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }, TRANSCRIPTION_REQUEST_TIMEOUT_MS)
    if (!response.ok)
      throw new Error(`Leslie Bridge request failed with HTTP ${response.status}.`)
    return parsePayload(transcriptionResponseSchema, await response.json())
  }

  function dispose(): void {
    lifecycleController.abort('AIRI closed the Leslie Bridge client.')
    chatControllers.clear()
  }

  return {
    cancelChat,
    createSpeech,
    createTranscription,
    dispose,
    getCompanionState,
    getStatus,
    listChatModels,
    listModels,
    listVoices,
    streamChat,
  }
}

export type LeslieBridgeClient = ReturnType<typeof createLeslieBridgeClient>
