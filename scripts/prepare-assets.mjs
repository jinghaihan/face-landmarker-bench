import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const runtimeRoot = resolve(root, 'public/runtime-assets')

const downloads = [
  {
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    destination: resolve(runtimeRoot, 'models/face_landmarker.task'),
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
  {
    url: 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg',
    destination: resolve(runtimeRoot, 'fixtures/portrait.jpg'),
    sha256: 'a6f11efaa834706db23f275b6115058fa87fc7f14362681e6abe14e82749de3e',
  },
  {
    url: 'https://storage.googleapis.com/mediapipe-assets/portrait_rotated.jpg',
    destination: resolve(runtimeRoot, 'fixtures/portrait_rotated.jpg'),
    sha256: 'f91ca0e4f827b06e9ac037cf58d95f1f3ffbe34238119b7d47eda35456007f33',
  },
]

const hash = buffer => createHash('sha256').update(buffer).digest('hex')

for (const asset of downloads) {
  let buffer
  try {
    buffer = await readFile(asset.destination)
  }
  catch {
    const response = await fetch(asset.url)
    if (!response.ok)
      throw new Error(`Failed to download ${asset.url}: HTTP ${response.status}`)
    buffer = Buffer.from(await response.arrayBuffer())
  }
  const actual = hash(buffer)
  if (actual !== asset.sha256)
    throw new Error(`SHA-256 mismatch for ${asset.url}: expected ${asset.sha256}, got ${actual}`)
  await mkdir(dirname(asset.destination), { recursive: true })
  await writeFile(asset.destination, buffer)
  console.log(`verified ${asset.destination.replace(`${root}/`, '')} ${actual}`)
}

await mkdir(resolve(runtimeRoot, 'wasm'), { recursive: true })
await cp(resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm'), resolve(runtimeRoot, 'wasm'), { recursive: true })
console.log('copied @mediapipe/tasks-vision@1.0.1 wasm')
