import type { Delegate, DetectResult, RendererInfo, RunningMode } from './types'
/// <reference lib="webworker" />
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { inspectRenderer } from './metrics'

type Request
  = | { id: number, type: 'init', delegate: Delegate, runningMode: RunningMode, model: ArrayBuffer, wasmUrl: string }
    | { id: number, type: 'detect', bitmap: ImageBitmap, timestamp: number }
    | { id: number, type: 'close' }

type Response
  = | { id: number, ok: true, result?: DetectResult, initMs?: number, renderer?: RendererInfo }
    | { id: number, ok: false, error: string }

let landmarker: FaceLandmarker | undefined
let runningMode: RunningMode = 'IMAGE'

const respond = (message: Response): void => globalThis.postMessage(message)

globalThis.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === 'init') {
      runningMode = data.runningMode
      const fileset = await FilesetResolver.forVisionTasks(data.wasmUrl)
      const canvas = new OffscreenCanvas(1, 1)
      const renderer = inspectRenderer(new OffscreenCanvas(1, 1))
      const startedAt = performance.now()
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(data.model), delegate: data.delegate },
        canvas,
        runningMode,
        numFaces: 2,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      respond({ id: data.id, ok: true, initMs: performance.now() - startedAt, renderer })
      return
    }

    if (data.type === 'close') {
      landmarker?.close()
      landmarker = undefined
      respond({ id: data.id, ok: true })
      return
    }

    if (!landmarker)
      throw new Error('Worker engine is not initialized')
    const startedAt = performance.now()
    const output = runningMode === 'VIDEO'
      ? landmarker.detectForVideo(data.bitmap, data.timestamp)
      : landmarker.detect(data.bitmap)
    const result: DetectResult = {
      inferenceMs: performance.now() - startedAt,
      faceCount: output.faceLandmarks.length,
      pointCounts: output.faceLandmarks.map(landmarks => landmarks.length),
    }
    data.bitmap.close()
    respond({ id: data.id, ok: true, result })
  }
  catch (error) {
    if (data.type === 'detect')
      data.bitmap.close()
    respond({ id: data.id, ok: false, error: error instanceof Error ? error.stack || error.message : String(error) })
  }
}
