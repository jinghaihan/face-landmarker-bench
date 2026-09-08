import type { Delegate, DetectResult, ExecutionLocation, RendererInfo, RunningMode } from './types'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { WASM_URL } from './constants'
import { inspectRenderer } from './metrics'

export interface BenchmarkEngine {
  initMs: number
  renderer: RendererInfo
  detect: (bitmap: ImageBitmap, timestamp: number) => Promise<DetectResult>
  close: () => Promise<void>
}

export async function createMainEngine(
  delegate: Delegate,
  runningMode: RunningMode,
  model: ArrayBuffer,
): Promise<BenchmarkEngine> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
  const taskCanvas = document.createElement('canvas')
  const renderer = inspectRenderer(document.createElement('canvas'))
  const startedAt = performance.now()
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate },
    canvas: taskCanvas,
    runningMode,
    numFaces: 2,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  const initMs = performance.now() - startedAt
  return {
    initMs,
    renderer,
    async detect(bitmap, timestamp) {
      const detectStartedAt = performance.now()
      const output = runningMode === 'VIDEO' ? landmarker.detectForVideo(bitmap, timestamp) : landmarker.detect(bitmap)
      const result: DetectResult = {
        inferenceMs: performance.now() - detectStartedAt,
        faceCount: output.faceLandmarks.length,
        pointCounts: output.faceLandmarks.map(landmarks => landmarks.length),
        landmarks: output.faceLandmarks.map(landmarks => landmarks.map(point => ({ x: point.x, y: point.y, z: point.z }))),
      }
      bitmap.close()
      return result
    },
    async close() {
      landmarker.close()
    },
  }
}

interface WorkerResponse {
  id: number
  ok: boolean
  result?: DetectResult
  initMs?: number
  renderer?: RendererInfo
  error?: string
}

export async function createWorkerEngine(
  delegate: Delegate,
  runningMode: RunningMode,
  model: ArrayBuffer,
): Promise<BenchmarkEngine> {
  const worker = new Worker(new URL('./face-worker.ts', import.meta.url))
  let sequence = 0
  const pending = new Map<number, { resolve: (value: WorkerResponse) => void, reject: (error: Error) => void }>()
  const request = (message: object, transfer: Transferable[] = []): Promise<WorkerResponse> => {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ ...message, id }, transfer)
    })
  }
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const handler = pending.get(data.id)
    if (!handler)
      return
    pending.delete(data.id)
    data.ok ? handler.resolve(data) : handler.reject(new Error(data.error || 'Worker operation failed'))
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Worker crashed')
    pending.forEach(({ reject }) => reject(error))
    pending.clear()
  }

  try {
    const modelCopy = model.slice(0)
    const initialized = await request(
      { type: 'init', delegate, runningMode, model: modelCopy, wasmUrl: new URL(WASM_URL, location.href).href },
      [modelCopy],
    )
    return {
      initMs: initialized.initMs || 0,
      renderer: initialized.renderer || { webgl2: false, software: true },
      async detect(bitmap, timestamp) {
        const response = await request({ type: 'detect', bitmap, timestamp }, [bitmap])
        if (!response.result)
          throw new Error('Worker returned no detection result')
        return response.result
      },
      async close() {
        try {
          await request({ type: 'close' })
        }
        finally {
          worker.terminate()
        }
      },
    }
  }
  catch (error) {
    worker.terminate()
    throw error
  }
}

export function createEngine(location: ExecutionLocation, delegate: Delegate, runningMode: RunningMode, model: ArrayBuffer): Promise<BenchmarkEngine> {
  return location === 'worker'
    ? createWorkerEngine(delegate, runningMode, model)
    : createMainEngine(delegate, runningMode, model)
}
