import { defineConfig } from 'vite'

export default defineConfig({
  worker: {
    // tasks-vision 1.0.1 relies on a classic-worker compatible loader.
    format: 'iife',
  },
  build: {
    target: 'es2022',
  },
})
