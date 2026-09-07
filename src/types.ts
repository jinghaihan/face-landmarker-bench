export type Delegate = 'CPU' | 'GPU'
export type ExecutionLocation = 'main' | 'worker'
export type RunningMode = 'IMAGE' | 'VIDEO'
export type ModeId = 'main-cpu' | 'main-gpu' | 'worker-cpu' | 'worker-gpu'

export interface RendererInfo {
  webgl2: boolean
  vendor?: string
  renderer?: string
  software: boolean
}

export interface Distribution {
  count: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  minMs: number
  maxMs: number
}

export interface CaseResult {
  scenario: string
  label: string
  runningMode: RunningMode
  width: number
  height: number
  expectedFaces?: number
  observedFaces: number[]
  stableFaceCount: boolean
  pointCounts: number[]
  inference: Distribution
  endToEnd: Distribution
}

export interface ModeResult {
  id: ModeId
  location: ExecutionLocation
  delegate: Delegate
  supported: boolean
  renderer?: RendererInfo
  init: Partial<Record<RunningMode, number>>
  cases: CaseResult[]
  errors?: string[]
}

export interface BenchmarkReport {
  schemaVersion: 1
  createdAt: string
  sdkVersion: string
  model: { url: string, sha256: string }
  environment: {
    userAgent: string
    platform: string
    hardwareConcurrency: number
    runnerOs?: string
    browserName?: string
    browserVersion?: string
    renderer: RendererInfo
  }
  config: { suite: string, warmups: number, iterations: number }
  assetLoadMs: number
  modes: ModeResult[]
}

export interface DetectResult {
  inferenceMs: number
  faceCount: number
  pointCounts: number[]
}
