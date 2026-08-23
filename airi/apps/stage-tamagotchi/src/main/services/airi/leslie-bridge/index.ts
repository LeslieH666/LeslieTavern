import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler, defineStreamInvokeHandler } from '@moeru/eventa'

import {
  electronLeslieBridgeCancelChat,
  electronLeslieBridgeCreateSpeech,
  electronLeslieBridgeCreateTranscription,
  electronLeslieBridgeGetCompanionState,
  electronLeslieBridgeGetStatus,
  electronLeslieBridgeListChatModels,
  electronLeslieBridgeListModels,
  electronLeslieBridgeListVoices,
  electronLeslieBridgeStreamChat,
} from '../../../../shared/eventa/leslie-bridge'
import { createLeslieBridgeClient } from './client'

interface SetupLeslieBridgeOptions {
  context: ReturnType<typeof createContext>['context']
  environment?: Record<string, string | undefined>
  fetch?: typeof globalThis.fetch
}

/** Registers the renderer API and owns all pending Leslie Bridge requests. */
export function setupLeslieBridge(options: SetupLeslieBridgeOptions) {
  const client = createLeslieBridgeClient({
    environment: options.environment,
    fetch: options.fetch,
  })
  let companionConnected = false
  const getCompanionState = async () => {
    const state = await client.getCompanionState()
    if (state.connected !== companionConnected) {
      companionConnected = state.connected
      console.info(`AIRI Leslie companion connection: ${state.connected ? 'connected' : 'offline'}.`)
    }
    return state
  }
  const cleanups = [
    defineInvokeHandler(options.context, electronLeslieBridgeGetCompanionState, getCompanionState),
    defineInvokeHandler(options.context, electronLeslieBridgeGetStatus, () => client.getStatus()),
    defineInvokeHandler(options.context, electronLeslieBridgeListChatModels, () => client.listChatModels()),
    defineInvokeHandler(options.context, electronLeslieBridgeListModels, () => client.listModels()),
    defineInvokeHandler(options.context, electronLeslieBridgeListVoices, () => client.listVoices()),
    defineInvokeHandler(options.context, electronLeslieBridgeCreateSpeech, payload => client.createSpeech(payload)),
    defineInvokeHandler(options.context, electronLeslieBridgeCreateTranscription, payload => client.createTranscription(payload)),
    defineInvokeHandler(options.context, electronLeslieBridgeCancelChat, payload => client.cancelChat(payload.requestId)),
  ]
  defineStreamInvokeHandler(options.context, electronLeslieBridgeStreamChat, payload => client.streamChat(payload))
  cleanups.push(() => options.context.off(electronLeslieBridgeStreamChat.sendEvent))
  let disposed = false

  function dispose(): void {
    if (disposed)
      return
    disposed = true

    for (const cleanup of cleanups)
      cleanup()
    client.dispose()
  }

  return { dispose }
}
