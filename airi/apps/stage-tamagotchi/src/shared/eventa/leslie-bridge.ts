import { defineInvokeEventa } from '@moeru/eventa'

export type LeslieBridgeConnectionState = 'disabled' | 'incompatible' | 'ready' | 'unavailable'

/** Connection state that the Electron main process can disclose to a renderer. */
export interface LeslieBridgeStatus {
  baseUrl: string
  binding: LeslieCompanionBinding | null
  chatAvailable: boolean
  companionConnected: boolean
  configured: boolean
  error?: string
  protocolVersion?: string
  speechAvailable: boolean
  state: LeslieBridgeConnectionState
  transcriptionAvailable: boolean
}

export interface LeslieCompanionBinding {
  characterId: string
  characterName: string
  chatId: string
  personaName: string
}

export interface LeslieCompanionCharacter {
  avatar: string
  id: string
  name: string
}

export interface LeslieCompanionVoice {
  available: boolean
  languageMode: string
  resourceId: string
  speakerId: string
  speed: number
}

/** Read-only state owned by the visible LeslieTavern page. */
export interface LeslieCompanionState {
  binding: LeslieCompanionBinding | null
  characters: LeslieCompanionCharacter[]
  connected: boolean
  generating: boolean
  voice: LeslieCompanionVoice
}

export interface LeslieBridgeModel {
  deprecated: boolean
  description: string
  id: string
  name: string
  provider: 'leslie-tavern'
}

export interface LeslieBridgeChatModel {
  deprecated: boolean
  description: string
  id: string
  name: string
  provider: 'leslie-tavern-chat'
}

export interface LeslieBridgeChatRequest {
  body: string
  requestId: string
}

export type LeslieBridgeChatStreamFrame = {
  contentType: string
  status: number
  statusText: string
  type: 'start'
} | {
  data: Uint8Array
  type: 'data'
}

export interface LeslieBridgeCancelChatRequest {
  requestId: string
}

export interface LeslieBridgeCancelChatResponse {
  canceled: boolean
}

export interface LeslieBridgeVoice {
  compatibleModels: string[]
  id: string
  languages: Array<{
    code: string
    title: string
  }>
  name: string
  provider: 'leslie-tavern'
}

export interface LeslieBridgeSpeechRequest {
  input: string
  model: string
  speed?: number
  voice: string
}

/** Audio bytes cross Eventa without the Bridge bearer token. */
export interface LeslieBridgeSpeechResponse {
  audio: Uint8Array
  contentType: 'audio/mpeg'
}

export interface LeslieBridgeTranscriptionRequest {
  audio: Uint8Array
  contentType: string
  language?: string
  model: string
}

export interface LeslieBridgeTranscriptionResponse {
  text: string
}

export const electronLeslieBridgeGetStatus = defineInvokeEventa<LeslieBridgeStatus>(
  'eventa:invoke:electron:leslie-bridge:get-status',
)

export const electronLeslieBridgeGetCompanionState = defineInvokeEventa<LeslieCompanionState>(
  'eventa:invoke:electron:leslie-bridge:get-companion-state',
)

export const electronLeslieBridgeListModels = defineInvokeEventa<LeslieBridgeModel[]>(
  'eventa:invoke:electron:leslie-bridge:list-models',
)

export const electronLeslieBridgeListChatModels = defineInvokeEventa<LeslieBridgeChatModel[]>(
  'eventa:invoke:electron:leslie-bridge:list-chat-models',
)

export const electronLeslieBridgeStreamChat = defineInvokeEventa<LeslieBridgeChatStreamFrame, LeslieBridgeChatRequest>(
  'eventa:invoke:electron:leslie-bridge:stream-chat',
)

export const electronLeslieBridgeCancelChat = defineInvokeEventa<LeslieBridgeCancelChatResponse, LeslieBridgeCancelChatRequest>(
  'eventa:invoke:electron:leslie-bridge:cancel-chat',
)

export const electronLeslieBridgeListVoices = defineInvokeEventa<LeslieBridgeVoice[]>(
  'eventa:invoke:electron:leslie-bridge:list-voices',
)

export const electronLeslieBridgeCreateSpeech = defineInvokeEventa<LeslieBridgeSpeechResponse, LeslieBridgeSpeechRequest>(
  'eventa:invoke:electron:leslie-bridge:create-speech',
)

export const electronLeslieBridgeCreateTranscription = defineInvokeEventa<LeslieBridgeTranscriptionResponse, LeslieBridgeTranscriptionRequest>(
  'eventa:invoke:electron:leslie-bridge:create-transcription',
)
