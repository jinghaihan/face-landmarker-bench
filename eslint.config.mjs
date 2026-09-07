import { defineConfig } from '@octohash/eslint-config'

export default defineConfig({
  antislop: false,
  ignores: [
    'benchmark-results/**',
    'dist/**',
    'playwright-report/**',
    'public/runtime-assets/**',
    'report/**',
    'test-results/**',
  ],
})
