import type { Scenario } from './scenarios'
import type { BenchmarkReport, CaseResult, Delegate, ExecutionLocation, FaceMeshBaselineResult, ModeId, ModeResult, RunningMode } from './types'
import { MODEL_SHA256, MODEL_SOURCE_URL, MODEL_URL, SDK_VERSION } from './constants'
import { createEngine } from './engine'
import { createFaceMeshEngine } from './face-mesh-engine'
import { compareCase } from './landmark-comparison'
import { inspectRenderer, summarize } from './metrics'
import { createScenarios } from './scenarios'

const MODES: Array<{ id: ModeId, location: ExecutionLocation, delegate: Delegate }> = [
  { id: 'worker-gpu', location: 'worker', delegate: 'GPU' },
  { id: 'worker-cpu', location: 'worker', delegate: 'CPU' },
  { id: 'main-gpu', location: 'main', delegate: 'GPU' },
  { id: 'main-cpu', location: 'main', delegate: 'CPU' },
]

export interface BenchmarkConfig {
  suite: string
  warmups: number
  iterations: number
  onProgress?: (message: string) => void
}

async function runCase(
  scenario: Scenario,
  engine: Awaited<ReturnType<typeof createEngine>>,
  warmups: number,
  iterations: number,
): Promise<CaseResult> {
  let timestamp = performance.now()
  const execute = async (frame: number) => {
    const canvas = scenario.render(frame)
    const endToEndStartedAt = performance.now()
    const bitmap = await createImageBitmap(canvas)
    timestamp += 33.333
    const result = await engine.detect(bitmap, timestamp)
    return { ...result, endToEndMs: performance.now() - endToEndStartedAt }
  }
  for (let index = 0; index < warmups; index++) await execute(index)

  const inferenceTimes: number[] = []
  const endToEndTimes: number[] = []
  const observedFaces: number[] = []
  const pointCounts = new Set<number>()
  let landmarkSample: CaseResult['landmarkSample']
  for (let index = 0; index < iterations; index++) {
    const result = await execute(index + warmups)
    inferenceTimes.push(result.inferenceMs)
    endToEndTimes.push(result.endToEndMs)
    observedFaces.push(result.faceCount)
    result.pointCounts.forEach(count => pointCounts.add(count))
    landmarkSample ||= result.landmarks
  }
  return {
    scenario: scenario.id,
    label: scenario.label,
    runningMode: scenario.runningMode,
    width: scenario.width,
    height: scenario.height,
    expectedFaces: scenario.expectedFaces,
    observedFaces,
    stableFaceCount: new Set(observedFaces).size <= 1,
    pointCounts: [...pointCounts].sort((left, right) => left - right),
    landmarkSample,
    inference: summarize(inferenceTimes),
    endToEnd: summarize(endToEndTimes),
  }
}

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkReport> {
  const assetStartedAt = performance.now()
  const model = await fetch(MODEL_URL).then(async (response) => {
    if (!response.ok)
      throw new Error(`Model download failed: HTTP ${response.status}`)
    return response.arrayBuffer()
  })
  const assetLoadMs = performance.now() - assetStartedAt
  const scenarios = await createScenarios(config.suite)
  const modes: ModeResult[] = []
  const faceMeshBaseline: FaceMeshBaselineResult = {
    id: 'face-mesh',
    supported: false,
    cases: [],
  }

  config.onProgress?.('face-mesh · IMAGE baseline')
  let faceMeshEngine: Awaited<ReturnType<typeof createFaceMeshEngine>> | undefined
  try {
    faceMeshEngine = await createFaceMeshEngine()
    faceMeshBaseline.supported = true
    faceMeshBaseline.initMs = Math.round(faceMeshEngine.initMs * 100) / 100
    for (const scenario of scenarios.filter(item => item.compareLandmarks)) {
      config.onProgress?.(`face-mesh · ${scenario.label}`)
      faceMeshBaseline.cases.push(await runCase(scenario, faceMeshEngine, config.warmups, config.iterations))
    }
  }
  catch (error) {
    faceMeshBaseline.error = error instanceof Error ? error.stack || error.message : String(error)
  }
  finally {
    await faceMeshEngine?.close().catch(() => undefined)
  }

  for (const mode of MODES) {
    const modeResult: ModeResult = {
      ...mode,
      supported: false,
      init: {},
      cases: [],
      errors: [],
    }
    for (const runningMode of ['IMAGE', 'VIDEO'] as RunningMode[]) {
      const selected = scenarios.filter(scenario => scenario.runningMode === runningMode)
      if (!selected.length)
        continue
      config.onProgress?.(`${mode.id} · ${runningMode}`)
      let engine: Awaited<ReturnType<typeof createEngine>> | undefined
      try {
        engine = await createEngine(mode.location, mode.delegate, runningMode, model.slice(0))
        modeResult.supported = true
        modeResult.renderer = engine.renderer
        modeResult.init[runningMode] = Math.round(engine.initMs * 100) / 100
        for (const scenario of selected) {
          config.onProgress?.(`${mode.id} · ${scenario.label}`)
          modeResult.cases.push(await runCase(scenario, engine, config.warmups, config.iterations))
        }
      }
      catch (error) {
        modeResult.errors?.push(`${runningMode}: ${error instanceof Error ? error.stack || error.message : String(error)}`)
      }
      finally {
        await engine?.close().catch(() => undefined)
      }
    }
    if (!modeResult.errors?.length)
      delete modeResult.errors
    modes.push(modeResult)
  }

  const landmarkComparisons = modes.flatMap(mode => mode.cases.flatMap((testCase) => {
    const baseline = faceMeshBaseline.cases.find(item => item.scenario === testCase.scenario)
    return baseline ? [compareCase(mode.id, baseline, testCase)] : []
  }))

  return {
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    sdkVersion: SDK_VERSION,
    model: { url: MODEL_SOURCE_URL, sha256: MODEL_SHA256 },
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      renderer: inspectRenderer(document.createElement('canvas')),
    },
    config: { suite: config.suite, warmups: config.warmups, iterations: config.iterations },
    assetLoadMs: Math.round(assetLoadMs * 100) / 100,
    faceMeshBaseline,
    modes,
    landmarkComparisons,
  }
}
