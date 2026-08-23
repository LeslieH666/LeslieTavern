import localforage from 'localforage'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from './display-models'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  },
}))

/**
 * @example
 * describe('display models store', () => {})
 */
describe('display models store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(localforage.iterate).mockReset()
    vi.mocked(localforage.iterate).mockResolvedValue(undefined)
  })

  /**
   * @example
   * it('resolves newly imported display models from memory before IndexedDB', async () => {})
   */
  it('resolves newly imported display models from memory before IndexedDB', async () => {
    const store = useDisplayModelsStore()
    const model = {
      id: 'display-model-pending-idb-write',
      format: DisplayModelFormat.Live2dZip,
      type: 'file' as const,
      file: new File(['model'], 'model.zip'),
      name: 'model.zip',
      importedAt: 1,
    }

    store.displayModels = [model]

    const resolved = await store.getDisplayModel(model.id)

    expect(resolved).toEqual(model)
  })

  it('falls back to built-in models when IndexedDB hydration stalls', async () => {
    vi.useFakeTimers()
    vi.mocked(localforage.iterate).mockImplementationOnce(() => new Promise(() => {}))
    const store = useDisplayModelsStore()

    const loading = store.loadDisplayModelsFromIndexedDB()
    await vi.advanceTimersByTimeAsync(5_000)
    await loading

    expect(store.displayModelsFromIndexedDBLoading).toBe(false)
    expect(store.displayModels.some(model => model.id === 'preset-live2d-1')).toBe(true)
  })
})
