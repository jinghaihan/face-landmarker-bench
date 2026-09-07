import type { RunningMode } from './types'

export interface Scenario {
  id: string
  label: string
  width: number
  height: number
  runningMode: RunningMode
  expectedFaces?: number
  render: (frame: number) => HTMLCanvasElement
}

interface Images {
  portrait: ImageBitmap
  rotated: ImageBitmap
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = canvas.getContext('2d')
  if (!value)
    throw new Error('2D canvas is unavailable')
  return value
}

function drawCover(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function portraitScenario(images: Images, width: number, height: number): Scenario {
  const canvas = createCanvas(width, height)
  return {
    id: `portrait-${width}x${height}`,
    label: `Portrait ${width}×${height}`,
    width,
    height,
    runningMode: 'IMAGE',
    expectedFaces: 1,
    render: () => {
      drawCover(context(canvas), images.portrait, 0, 0, width, height)
      return canvas
    },
  }
}

export async function createScenarios(suite: string): Promise<Scenario[]> {
  const load = async (url: string): Promise<ImageBitmap> => createImageBitmap(await fetch(url).then(response => response.blob()))
  const images: Images = {
    portrait: await load('/runtime-assets/fixtures/portrait.jpg'),
    rotated: await load('/runtime-assets/fixtures/portrait_rotated.jpg'),
  }
  const portrait = portraitScenario(images, 640, 360)
  const blankCanvas = createCanvas(640, 360)
  const blank: Scenario = {
    id: 'no-face-640x360',
    label: 'No face 640×360',
    width: 640,
    height: 360,
    runningMode: 'IMAGE',
    expectedFaces: 0,
    render: (frame) => {
      const ctx = context(blankCanvas)
      const gradient = ctx.createLinearGradient(0, 0, 640, 360)
      gradient.addColorStop(0, `hsl(${frame % 360} 30% 30%)`)
      gradient.addColorStop(1, '#111827')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 640, 360)
      return blankCanvas
    },
  }
  if (suite === 'smoke')
    return [portrait, blank]

  const rotatedCanvas = createCanvas(640, 360)
  const rotated: Scenario = {
    id: 'rotated-640x360',
    label: 'Rotated portrait',
    width: 640,
    height: 360,
    runningMode: 'IMAGE',
    render: () => {
      drawCover(context(rotatedCanvas), images.rotated, 0, 0, 640, 360)
      return rotatedCanvas
    },
  }

  const occludedCanvas = createCanvas(640, 360)
  const occluded: Scenario = {
    id: 'occluded-640x360',
    label: 'Occluded portrait',
    width: 640,
    height: 360,
    runningMode: 'IMAGE',
    render: () => {
      const ctx = context(occludedCanvas)
      drawCover(ctx, images.portrait, 0, 0, 640, 360)
      ctx.fillStyle = '#111827'
      ctx.fillRect(230, 205, 180, 95)
      return occludedCanvas
    },
  }

  const twoFaceCanvas = createCanvas(1280, 720)
  const twoFaces: Scenario = {
    id: 'two-faces-1280x720',
    label: 'Two faces composite',
    width: 1280,
    height: 720,
    runningMode: 'IMAGE',
    expectedFaces: 2,
    render: () => {
      const ctx = context(twoFaceCanvas)
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(0, 0, 1280, 720)
      drawCover(ctx, images.portrait, 20, 60, 600, 600)
      drawCover(ctx, images.portrait, 660, 60, 600, 600)
      return twoFaceCanvas
    },
  }

  const motionCanvas = createCanvas(640, 360)
  const motion: Scenario = {
    id: 'motion-video-640x360',
    label: 'Synthetic face motion',
    width: 640,
    height: 360,
    runningMode: 'VIDEO',
    expectedFaces: 1,
    render: (frame) => {
      const ctx = context(motionCanvas)
      ctx.fillStyle = '#d1d5db'
      ctx.fillRect(0, 0, 640, 360)
      const offset = Math.sin(frame / 4) * 55
      drawCover(ctx, images.portrait, offset, 0, 640, 360)
      return motionCanvas
    },
  }

  return [portraitScenario(images, 320, 180), portrait, portraitScenario(images, 1280, 720), blank, rotated, occluded, twoFaces, motion]
}
