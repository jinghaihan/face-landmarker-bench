import type { BenchmarkEngine } from './engine'
import type { DetectResult } from './types'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import { FACE_MESH_ASSET_URL } from './constants'
import { inspectRenderer } from './metrics'
import '@mediapipe/face_mesh'

export async function createFaceMeshEngine(): Promise<BenchmarkEngine> {
  const startedAt = performance.now()
  const detector = await faceLandmarksDetection.createDetector(
    faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
    {
      runtime: 'mediapipe',
      solutionPath: new URL(FACE_MESH_ASSET_URL, location.href).href,
      refineLandmarks: true,
      maxFaces: 2,
    },
  )
  const initMs = performance.now() - startedAt

  return {
    initMs,
    renderer: inspectRenderer(document.createElement('canvas')),
    async detect(bitmap): Promise<DetectResult> {
      detector.reset?.()
      const width = bitmap.width
      const height = bitmap.height
      const detectStartedAt = performance.now()
      const faces = await detector.estimateFaces(bitmap, {
        flipHorizontal: false,
        staticImageMode: true,
      })
      const inferenceMs = performance.now() - detectStartedAt
      bitmap.close()
      const landmarks = faces.map(face => face.keypoints.map(point => ({
        x: point.x / width,
        y: point.y / height,
        z: (point.z || 0) / width,
      })))
      return {
        inferenceMs,
        faceCount: landmarks.length,
        pointCounts: landmarks.map(points => points.length),
        landmarks,
      }
    },
    async close() {
      detector.dispose()
    },
  }
}
