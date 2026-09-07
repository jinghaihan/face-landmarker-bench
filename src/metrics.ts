import type { Distribution, RendererInfo } from './types'

const round = (value: number): number => Math.round(value * 100) / 100

export function summarize(values: number[]): Distribution {
  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (value: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] ?? 0
  return {
    count: values.length,
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)),
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    p99Ms: round(percentile(0.99)),
    minMs: round(sorted[0] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
  }
}

export function inspectRenderer(canvas: HTMLCanvasElement | OffscreenCanvas): RendererInfo {
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null
  if (!gl)
    return { webgl2: false, software: true }
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const vendor = String(debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR))
  const renderer = String(debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  const software = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(`${vendor} ${renderer}`)
  return { webgl2: true, vendor, renderer, software }
}
