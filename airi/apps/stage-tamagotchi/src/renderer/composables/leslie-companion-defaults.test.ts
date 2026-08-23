import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { applyLeslieCompanionDefaults, applyLeslieCompanionDisplayDefault, enforceLeslieCompanionDefaults } from './leslie-companion-defaults'

describe('applyLeslieCompanionDisplayDefault', () => {
  it('restores the bundled Live2D model when no display model is selected', () => {
    const display = { stageModelSelected: '' }

    applyLeslieCompanionDisplayDefault(display)

    expect(display.stageModelSelected).toBe('preset-live2d-1')
  })

  it('preserves a selected custom display model', () => {
    const display = { stageModelSelected: 'display-model-custom' }

    applyLeslieCompanionDisplayDefault(display)

    expect(display.stageModelSelected).toBe('display-model-custom')
  })
})

describe('applyLeslieCompanionDefaults', () => {
  it('configures chat, hearing, and speech without asking the user to select providers', () => {
    const providers = {
      ensureProvider: vi.fn(),
      markProviderAdded: vi.fn(),
      setProviderStatus: vi.fn(),
    }
    const chat = { activeModel: 'old-model', activeProvider: 'old-provider' }
    const speech = {
      activeSpeechModel: 'old-speech-model',
      activeSpeechProvider: 'old-speech-provider',
      activeSpeechVoiceId: 'old-voice',
    }
    const hearing = {
      activeTranscriptionModel: 'old-transcription-model',
      activeTranscriptionProvider: 'old-transcription-provider',
    }

    applyLeslieCompanionDefaults(providers, chat, speech, hearing)

    expect(providers.ensureProvider.mock.calls).toEqual([
      ['leslie-tavern-chat', 'leslie-tavern-chat', {}],
      ['leslie-tavern', 'leslie-tavern', {}],
    ])
    expect(providers.markProviderAdded.mock.calls).toEqual([
      ['leslie-tavern-chat'],
      ['leslie-tavern'],
    ])
    expect(providers.setProviderStatus.mock.calls).toEqual([
      ['leslie-tavern-chat', 'configured'],
      ['leslie-tavern', 'configured'],
    ])
    expect(chat).toEqual({
      activeModel: 'leslie-current-chat',
      activeProvider: 'leslie-tavern-chat',
    })
    expect(speech).toEqual({
      activeSpeechModel: 'leslie-volcengine-tts',
      activeSpeechProvider: 'leslie-tavern',
      activeSpeechVoiceId: 'leslie-bound-character',
    })
    expect(hearing).toEqual({
      activeTranscriptionModel: 'leslie-local-whisper',
      activeTranscriptionProvider: 'leslie-tavern',
    })
  })

  it('restores Leslie speech after a later AIRI card initialization selects speech-noop', () => {
    const providers = {
      ensureProvider: vi.fn(),
      markProviderAdded: vi.fn(),
      setProviderStatus: vi.fn(),
    }
    const chat = reactive({ activeModel: '', activeProvider: '' })
    const speech = reactive({
      activeSpeechModel: '',
      activeSpeechProvider: 'speech-noop',
      activeSpeechVoiceId: '',
    })
    const hearing = reactive({
      activeTranscriptionModel: '',
      activeTranscriptionProvider: '',
    })
    const enforcement = enforceLeslieCompanionDefaults(providers, chat, speech, hearing)

    speech.activeSpeechProvider = 'speech-noop'
    speech.activeSpeechModel = ''
    speech.activeSpeechVoiceId = ''

    expect(speech).toMatchObject({
      activeSpeechModel: 'leslie-volcengine-tts',
      activeSpeechProvider: 'leslie-tavern',
      activeSpeechVoiceId: 'leslie-bound-character',
    })
    expect(providers.setProviderStatus).toHaveBeenLastCalledWith('leslie-tavern', 'configured')
    enforcement.stop()
  })
})
