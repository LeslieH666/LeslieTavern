import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { watch } from 'vue'

interface ProviderActions {
  ensureProvider: (providerId: string, definitionId: string, config: Record<string, unknown>) => unknown
  markProviderAdded: (providerId: string) => void
  setProviderStatus: (providerId: string, status: 'configured') => void
}

interface ChatSelection {
  activeModel: string
  activeProvider: string
}

interface SpeechSelection {
  activeSpeechModel: string
  activeSpeechProvider: string
  activeSpeechVoiceId: string
}

interface HearingSelection {
  activeTranscriptionModel: string
  activeTranscriptionProvider: string
}

interface DisplayModelSelection {
  stageModelSelected: string
}

const CHAT_PROVIDER = 'leslie-tavern-chat'
const CHAT_MODEL = 'leslie-current-chat'
const SPEECH_PROVIDER = 'leslie-tavern'
const SPEECH_MODEL = 'leslie-volcengine-tts'
const SPEECH_VOICE = 'leslie-bound-character'
const TRANSCRIPTION_MODEL = 'leslie-local-whisper'
const DEFAULT_DISPLAY_MODEL = 'preset-live2d-1'

/** Restore AIRI's bundled Hiyori model when companion display selection is empty. */
export function applyLeslieCompanionDisplayDefault(display: DisplayModelSelection): void {
  if (!display.stageModelSelected.trim())
    display.stageModelSelected = DEFAULT_DISPLAY_MODEL
}

function hasLeslieCompanionDefaults(
  chat: ChatSelection,
  speech: SpeechSelection,
  hearing: HearingSelection,
): boolean {
  return chat.activeProvider === CHAT_PROVIDER
    && chat.activeModel === CHAT_MODEL
    && speech.activeSpeechProvider === SPEECH_PROVIDER
    && speech.activeSpeechModel === SPEECH_MODEL
    && speech.activeSpeechVoiceId === SPEECH_VOICE
    && hearing.activeTranscriptionProvider === SPEECH_PROVIDER
    && hearing.activeTranscriptionModel === TRANSCRIPTION_MODEL
}

/** Make the Leslie companion path ready without showing provider selectors. */
export function applyLeslieCompanionDefaults(
  providers: ProviderActions,
  chat: ChatSelection,
  speech: SpeechSelection,
  hearing: HearingSelection,
): void {
  providers.ensureProvider(CHAT_PROVIDER, CHAT_PROVIDER, {})
  providers.ensureProvider(SPEECH_PROVIDER, SPEECH_PROVIDER, {})
  providers.markProviderAdded(CHAT_PROVIDER)
  providers.markProviderAdded(SPEECH_PROVIDER)
  providers.setProviderStatus(CHAT_PROVIDER, 'configured')
  providers.setProviderStatus(SPEECH_PROVIDER, 'configured')

  chat.activeProvider = CHAT_PROVIDER
  chat.activeModel = CHAT_MODEL
  speech.activeSpeechProvider = SPEECH_PROVIDER
  speech.activeSpeechModel = SPEECH_MODEL
  speech.activeSpeechVoiceId = SPEECH_VOICE
  hearing.activeTranscriptionProvider = SPEECH_PROVIDER
  hearing.activeTranscriptionModel = TRANSCRIPTION_MODEL
}

/**
 * Keep the dedicated Leslie companion route authoritative. Generic AIRI card
 * initialization and provider validation may run later and restore a card's
 * old `speech-noop` selection; in companion mode that would silently disable
 * every Volcengine request.
 */
export function enforceLeslieCompanionDefaults(
  providers: ProviderActions,
  chat: ChatSelection,
  speech: SpeechSelection,
  hearing: HearingSelection,
): { apply: () => void, stop: () => void } {
  let applying = false
  const apply = () => {
    if (applying || hasLeslieCompanionDefaults(chat, speech, hearing))
      return

    applying = true
    try {
      applyLeslieCompanionDefaults(providers, chat, speech, hearing)
    }
    finally {
      applying = false
    }
  }

  apply()
  const stop = watch(
    () => [
      chat.activeProvider,
      chat.activeModel,
      speech.activeSpeechProvider,
      speech.activeSpeechModel,
      speech.activeSpeechVoiceId,
      hearing.activeTranscriptionProvider,
      hearing.activeTranscriptionModel,
    ],
    apply,
    { flush: 'sync' },
  )

  return { apply, stop }
}

/** Apply the dedicated Leslie companion configuration and return a safe reapply hook. */
export function useLeslieCompanionDefaults(): () => void {
  const providers = useProviderConfigStore()
  const chat = useConsciousnessStore()
  const speech = useSpeechStore()
  const hearing = useHearingStore()

  const enforcement = enforceLeslieCompanionDefaults(providers, chat, speech, hearing)
  const apply = () => {
    enforcement.apply()
    void speech.loadVoicesForProvider(SPEECH_PROVIDER, SPEECH_MODEL)
  }
  void speech.loadVoicesForProvider(SPEECH_PROVIDER, SPEECH_MODEL)
  return apply
}
