import { describe, expect, it, vi } from 'vitest'

import { createLeslieBridgeClient } from './client'

const TOKEN = '0123456789abcdef0123456789abcdef'

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
}

function readyRoutes() {
  return {
    '/api/leslie/bridge/v1/health': () => jsonResponse({
      status: 'ok',
      service: 'leslie-tavern',
      protocol: { name: 'leslie-bridge', version: '1' },
    }),
    '/api/leslie/bridge/v1/capabilities': () => jsonResponse({
      service: 'leslie-tavern',
      protocol: { name: 'leslie-bridge', version: '1' },
      capabilities: {
        chat: {
          available: true,
          authoritativeStore: 'leslie-tavern',
          binding: 'active-leslie-character',
          protocol: 'openai-chat-completions',
        },
        speech: {
          available: true,
          model: 'leslie-volcengine-tts',
          responseFormats: ['mp3'],
        },
        transcription: {
          available: true,
          model: 'leslie-local-whisper',
          provider: 'leslie-local-transformers',
          responseFormats: ['json'],
        },
      },
    }),
    '/api/leslie/bridge/v1/companion/state': () => jsonResponse({
      connected: true,
      binding: {
        characterId: '3',
        characterName: 'Feixiao',
        chatId: 'chat-1',
        personaName: 'Leslie',
      },
      characters: [{ id: '3', name: 'Feixiao', avatar: 'Feixiao.png' }],
      generating: false,
      voice: {
        available: true,
        languageMode: 'auto',
        resourceId: 'seed-tts-2.0',
        speakerId: 'zh_female_xiaohe_uranus_bigtts',
        speed: 0,
      },
    }),
  }
}

function createRouteFetch(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const route = routes[new URL(String(input)).pathname]!
    return route(init)
  })
}

describe('createLeslieBridgeClient', () => {
  it('keeps the client disabled without a strong token', async () => {
    const fetch = createRouteFetch({})
    const client = createLeslieBridgeClient({ environment: {}, fetch })

    await expect(client.getStatus()).resolves.toMatchObject({
      configured: false,
      state: 'disabled',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a Bridge URL that is not on a loopback host', async () => {
    const fetch = createRouteFetch({})
    const client = createLeslieBridgeClient({
      environment: {
        LESLIE_BRIDGE_BASE_URL: 'https://example.com/api/leslie/bridge/v1/',
        LESLIE_BRIDGE_TOKEN: TOKEN,
      },
      fetch,
    })

    await expect(client.getStatus()).resolves.toMatchObject({
      configured: false,
      error: 'LESLIE_BRIDGE_BASE_URL must use a loopback host.',
      state: 'disabled',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports protocol capabilities without disclosing the token', async () => {
    const fetch = createRouteFetch(readyRoutes())
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    const status = await client.getStatus()

    expect(status).toEqual({
      baseUrl: 'http://127.0.0.1:8000/api/leslie/bridge/v1/',
      binding: {
        characterId: '3',
        characterName: 'Feixiao',
        chatId: 'chat-1',
        personaName: 'Leslie',
      },
      chatAvailable: true,
      companionConnected: true,
      configured: true,
      error: undefined,
      protocolVersion: '1',
      speechAvailable: true,
      transcriptionAvailable: true,
      state: 'ready',
    })
    expect(JSON.stringify(status)).not.toContain(TOKEN)
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('rejects a Bridge that does not support the version 1 speech contract', async () => {
    const routes = readyRoutes()
    routes['/api/leslie/bridge/v1/capabilities'] = () => jsonResponse({
      service: 'leslie-tavern',
      protocol: { name: 'leslie-bridge', version: '1' },
      capabilities: {
        chat: {
          available: true,
          authoritativeStore: 'leslie-tavern',
          binding: 'active-leslie-character',
          protocol: 'openai-chat-completions',
        },
        speech: {
          available: true,
          model: 'another-model',
          responseFormats: ['wav'],
        },
        transcription: {
          available: true,
          model: 'leslie-local-whisper',
          provider: 'leslie-local-transformers',
          responseFormats: ['json'],
        },
      },
    })
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch: createRouteFetch(routes),
    })

    await expect(client.getStatus()).resolves.toMatchObject({
      error: 'The Leslie Bridge version 1 speech contract is required.',
      state: 'incompatible',
    })
  })

  it('exposes fixed Leslie speech models without loading a selectable catalog', async () => {
    const fetch = createRouteFetch({})
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    await expect(client.listModels()).resolves.toEqual([
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
    ])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('exposes one stable current-character chat model without loading Leslie model settings', async () => {
    const fetch = createRouteFetch({})
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    await expect(client.listChatModels()).resolves.toEqual([{
      deprecated: false,
      description: 'The active LeslieTavern character, chat, memory, and model.',
      id: 'leslie-current-chat',
      name: 'Current Leslie character',
      provider: 'leslie-tavern-chat',
    }])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('streams Leslie chat response bytes without exposing the bearer token', async () => {
    const encoder = new TextEncoder()
    let requestBody = ''
    const fetch = createRouteFetch({
      '/api/leslie/bridge/v1/chat/completions': (init) => {
        requestBody = String(init?.body)
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":['))
            controller.enqueue(encoder.encode(']}\n\n'))
            controller.close()
          },
        }), {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        })
      },
    })
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })
    const frames = []

    for await (const frame of client.streamChat({
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic request.' }], stream: true }),
      requestId: 'request-1234',
    })) {
      frames.push(frame)
    }

    expect(frames[0]).toMatchObject({
      contentType: 'text/event-stream',
      status: 200,
      type: 'start',
    })
    expect(frames.slice(1).map(frame => frame.type === 'data' ? new TextDecoder().decode(frame.data) : '').join('')).toBe('data: {"choices":[]}\n\n')
    expect(requestBody).toContain('Synthetic request.')
    expect(requestBody).not.toContain(TOKEN)
  })

  it('aborts an active Leslie chat request by its public request ID', async () => {
    let requestSignal: AbortSignal | null | undefined
    const fetch = createRouteFetch({
      '/api/leslie/bridge/v1/chat/completions': (init) => {
        requestSignal = init?.signal
        return new Response(new ReadableStream(), {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      },
    })
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })
    const stream = client.streamChat({
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic request.' }], stream: true }),
      requestId: 'request-5678',
    })

    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'start' } })
    expect(client.cancelChat('request-5678')).toEqual({ canceled: true })
    expect(requestSignal?.aborted).toBe(true)
    await stream.return(undefined)
    expect(client.cancelChat('request-5678')).toEqual({ canceled: false })
  })

  it('uses the active Leslie character voice instead of a selectable AIRI voice', async () => {
    let speechBody: unknown
    const fetch = createRouteFetch({
      '/api/leslie/bridge/v1/voices': () => jsonResponse({
        voices: [{
          lang: '中文 / English',
          model: '2.0',
          name: 'Xiaohe',
          resource_id: 'seed-tts-2.0',
          voice_id: 'zh_female_xiaohe_uranus_bigtts',
        }],
      }),
      '/api/leslie/bridge/v1/companion/audio/speech': (init) => {
        speechBody = JSON.parse(String(init?.body))
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'audio/mpeg' },
        })
      },
    })
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    await expect(client.listVoices()).resolves.toEqual([{
      compatibleModels: ['leslie-volcengine-tts'],
      id: 'leslie-bound-character',
      languages: [{ code: 'und', title: 'LeslieTavern' }],
      name: 'Current Leslie character',
      provider: 'leslie-tavern',
    }])
    await expect(client.createSpeech({
      input: 'Hello.',
      model: 'leslie-volcengine-tts',
      speed: 1.25,
      voice: 'leslie-bound-character',
    })).resolves.toEqual({
      audio: new Uint8Array([1, 2, 3]),
      contentType: 'audio/mpeg',
    })
    expect(speechBody).toEqual({
      input: 'Hello.',
      model: 'leslie-volcengine-tts',
      response_format: 'mp3',
    })
  })

  it('sends WAV input to Leslie local transcription without an external API key', async () => {
    let transcriptionBody: unknown
    const fetch = createRouteFetch({
      '/api/leslie/bridge/v1/companion/audio/transcriptions': (init) => {
        transcriptionBody = JSON.parse(String(init?.body))
        return jsonResponse({ text: '你好，飞霄。' })
      },
    })
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    await expect(client.createTranscription({
      audio: new Uint8Array([82, 73, 70, 70]),
      contentType: 'audio/wav',
      language: 'zh',
      model: 'leslie-local-whisper',
    })).resolves.toEqual({ text: '你好，飞霄。' })
    expect(transcriptionBody).toEqual({
      audio: 'UklGRg==',
      content_type: 'audio/wav',
      language: 'zh',
      model: 'leslie-local-whisper',
    })
  })

  it('does not include an HTTP response body in errors', async () => {
    const fetch = createRouteFetch({
      '/api/leslie/bridge/v1/companion/state': () => jsonResponse({ token: TOKEN }, { status: 401 }),
    })
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    await expect(client.getCompanionState()).rejects.toThrow('Leslie Bridge request failed with HTTP 401.')
  })

  it('aborts future requests after disposal', async () => {
    const fetch = createRouteFetch({})
    const client = createLeslieBridgeClient({
      environment: { LESLIE_BRIDGE_TOKEN: TOKEN },
      fetch,
    })

    client.dispose()

    await expect(client.getCompanionState()).rejects.toThrow('Leslie Bridge client is closed.')
    expect(fetch).not.toHaveBeenCalled()
  })
})
