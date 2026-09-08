export type Delegate = 'CPU' | 'GPU'
export type ExecutionLocation = 'main' | 'worker'
export type RunningMode = 'IMAGE' | 'VIDEO'
export type ModeId = 'main-cpu' | 'main-gpu' | 'worker-cpu' | 'worker-gpu'

export interface LandmarkPoint {
  x: number
  y: number
  z: number
}

export interface RendererInfo {
  webgl2: boolean
  vendor?: string
  renderer?: string
  software: boolean
}

export interface Distribution {
  count: number
  totalMs: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  minMs: number
  maxMs: number
  samplesMs: number[]
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
  landmarkSample?: LandmarkPoint[][]
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

export interface FaceMeshBaselineResult {
  id: 'face-mesh'
  supported: boolean
  initMs?: number
  cases: CaseResult[]
  error?: string
}

export interface LandmarkComparison {
  mode: ModeId
  scenario: string
  label: string
  baselineFaces: number
  taskVisionFaces: number
  baselinePointCounts: number[]
  taskVisionPointCounts: number[]
  matchedFaces: number
  comparedPoints: number
  topologyMatches: boolean
  mean2dPercent?: number
  p95_2dPercent?: number
  max2dPercent?: number
  meanAbsZPercent?: number
}

export interface BenchmarkReport {
  schemaVersion: 3
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
  faceMeshBaseline: FaceMeshBaselineResult
  modes: ModeResult[]
  landmarkComparisons: LandmarkComparison[]
}

export interface DetectResult {
  inferenceMs: number
  faceCount: number
  pointCounts: number[]
  landmarks: LandmarkPoint[][]
}
