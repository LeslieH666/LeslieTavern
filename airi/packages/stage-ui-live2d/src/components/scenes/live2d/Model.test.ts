// @vitest-environment jsdom
import type { Application } from '@pixi/app'

import { flushPromises, mount } from '@vue/test-utils'
import { Live2DFactory } from 'pixi-live2d-display/cubism4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Model from './Model.vue'

const VALID_MODEL_URL = 'https://example.test/models/hiyori/model3.json'

const storeHarness = vi.hoisted(() => ({
  // Captured shouldUpdateView listeners so a test can re-trigger loadModel()
  // after the pixi stage becomes ready, mirroring the real canvas recreation
  // flow.
  shouldUpdateViewCallbacks: [] as Array<() => void>,
}))

vi.mock('pixi-live2d-display/cubism4', () => {
  class MockLive2DModel {
    internalModel = {
      coreModel: { setParameterValueById: vi.fn() },
      motionManager: {
        definitions: {},
        groups: {},
        motionGroups: {},
        update: vi.fn(),
        on: vi.fn(),
        stopAllMotions: vi.fn(),
        expressionManager: undefined,
      },
      settings: undefined,
      eyeBlink: undefined,
    }

    width = 400
    height = 600
    anchor = { set: vi.fn() }
    scale = { set: vi.fn(), x: 1, y: 1 }
    x = 0
    y = 0
    filters: unknown[] = []
    motion = vi.fn(async () => {})
    focus = vi.fn()
    on = vi.fn()
    destroy = vi.fn()
  }

  return {
    Live2DModel: MockLive2DModel,
    Live2DFactory: {
      setupLive2DModel: vi.fn(async () => {}),
    },
    MotionPriority: { FORCE: 10 },
  }
})

vi.mock('pixi-filters', () => ({
  DropShadowFilter: class {
    color = 0
    constructor(_options?: unknown) {}
  },
}))

vi.mock('@proj-airi/ui', () => ({
  useTheme: () => ({ isDark: { value: false } }),
}))

vi.mock('@proj-airi/stage-shared/beat-sync', () => ({
  listenBeatSyncBeatSignal: vi.fn(() => () => {}),
}))

vi.mock('animejs', () => ({
  animate: vi.fn(),
}))

vi.mock('../../../composables/live2d', () => ({
  createBeatSyncController: vi.fn(() => ({ scheduleBeat: vi.fn() })),
  useExpressionController: vi.fn(() => ({
    dispose: vi.fn(),
    initialise: vi.fn(async () => {}),
  })),
  useLive2DMotionManagerUpdate: vi.fn(() => ({
    register: vi.fn(),
    hookUpdate: vi.fn(() => true),
  })),
  useMotionUpdatePluginAutoEyeBlink: vi.fn(),
  useMotionUpdatePluginBeatSync: vi.fn(),
  useMotionUpdatePluginExpression: vi.fn(),
  useMotionUpdatePluginIdleDisable: vi.fn(),
  useMotionUpdatePluginIdleFocus: vi.fn(),
  useMotionUpdatePluginLipSync: vi.fn(),
}))

vi.mock('../../../composables/live2d/fit-model', () => ({
  useFitModel: vi.fn(() => ({ value: { scale: 1, x: 0, y: 0 } })),
}))

vi.mock('../../../stores', async () => {
  const { ref } = await import('vue')

  return {
    useL2dViewControl: () => ({
      position: ref({ x: 0, y: 0 }),
      scale: ref(1),
    }),
    useLive2dParams: () => ({
      currentMotion: ref({ group: 'Idle', index: 0 }),
      availableMotions: ref([]),
      motionMap: ref({}),
      modelParameters: ref({
        angleX: 0,
        angleY: 0,
        angleZ: 0,
        leftEyeOpen: 1,
        rightEyeOpen: 1,
        leftEyeSmile: 0,
        rightEyeSmile: 0,
        leftEyebrowLR: 0,
        rightEyebrowLR: 0,
        leftEyebrowY: 0,
        rightEyebrowY: 0,
        leftEyebrowAngle: 0,
        rightEyebrowAngle: 0,
        leftEyebrowForm: 0,
        rightEyebrowForm: 0,
        mouthOpen: 0,
        mouthForm: 0,
        cheek: 0,
        bodyAngleX: 0,
        bodyAngleY: 0,
        bodyAngleZ: 0,
        breath: 0,
      }),
      onShouldUpdateView: (callback: () => void) => {
        storeHarness.shouldUpdateViewCallbacks.push(callback)
        return () => {}
      },
    }),
  }
})

function mockApp(): Application {
  return {
    stage: {
      addChild: vi.fn(),
      removeChild: vi.fn(),
      scale: { set: vi.fn() },
    },
  } as unknown as Application
}

describe('model.vue mutex lifecycle', () => {
  // ROOT CAUSE:
  //
  // loadModel() acquired the mutex first, then had early-return paths (pixi-wait
  // timeout, empty modelSrc, unmount) that returned BEFORE the try/finally that
  // releases the mutex. On startup the model URL and the pixi stage are usually
  // still initializing, so the first loadModel() returned early with the lock
  // still held; the second loadModel() then blocked forever on
  // modelLoadMutex.acquire(), leaving the stage stuck on Loading with no
  // character and dead quick buttons.
  //
  // Before: the early returns reset state manually and returned without calling
  // modelLoadMutex.release().
  //
  // We fixed this by acquiring the mutex once and wrapping the whole guarded
  // body in ONE try whose finally always resets state and releases the mutex, so
  // an early return, error, or unmount releases the lock and the next load
  // proceeds. These tests prove that property for the two failing startup
  // orders: with the leak, the second loadModel() blocks on acquire() forever
  // and setupLive2DModel is never called, so the assertions below fail (the
  // short test timeout is a safety net).

  beforeEach(() => {
    // Clear call history of shared factory mocks (keeps implementations).
    vi.clearAllMocks()
    vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: '#ffffff' }))
  })

  afterEach(() => {
    storeHarness.shouldUpdateViewCallbacks.length = 0
    vi.unstubAllGlobals()
  })

  it('releases the lock when the model source is empty so a later URL reaches setupLive2DModel', async () => {
    const setupLive2DModel = vi.mocked(Live2DFactory.setupLive2DModel)
    const wrapper = mount(Model, {
      props: {
        modelSrc: undefined,
        app: mockApp(),
        width: 800,
        height: 600,
      },
    })

    // First immediate load: the pixi stage is ready but there is no model URL,
    // so loadModel() must bail out without leaking the mutex.
    await flushPromises()
    expect(setupLive2DModel).not.toHaveBeenCalled()

    // Second load with a valid URL must not block on the mutex the first load
    // leaked (it would hang here forever without the fix).
    await wrapper.setProps({ modelSrc: VALID_MODEL_URL })
    await flushPromises()

    expect(setupLive2DModel).toHaveBeenCalledTimes(1)
  }, 10_000)

  it('releases the lock after the pixi wait times out so a later reload proceeds', async () => {
    const setupLive2DModel = vi.mocked(Live2DFactory.setupLive2DModel)
    const wrapper = mount(Model, {
      props: {
        modelSrc: VALID_MODEL_URL,
        app: undefined,
        width: 800,
        height: 600,
      },
    })

    // First load waits 1500ms for the pixi stage, times out, and must release
    // the mutex on its way out.
    await new Promise(resolve => setTimeout(resolve, 1_600))
    expect(setupLive2DModel).not.toHaveBeenCalled()

    // The canvas is recreated: the stage becomes ready and the store broadcasts
    // shouldUpdateView, which is the real reload trigger.
    await wrapper.setProps({ app: mockApp() })
    storeHarness.shouldUpdateViewCallbacks.at(-1)?.()

    await flushPromises()
    expect(setupLive2DModel).toHaveBeenCalledTimes(1)
  }, 10_000)
})
