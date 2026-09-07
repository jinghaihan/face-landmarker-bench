import type { BenchmarkReport } from '../src/types'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('runs the Face Landmarker benchmark', async ({ page, browserName, browser }) => {
  const suite = process.env.BENCHMARK_SUITE || 'smoke'
  const warmups = process.env.BENCHMARK_WARMUPS || (suite === 'smoke' ? '2' : '5')
  const iterations = process.env.BENCHMARK_ITERATIONS || (suite === 'smoke' ? '8' : '30')
  const output = resolve(process.env.BENCHMARK_OUTPUT || `benchmark-results/${process.platform}-${browserName}.json`)
  const browserVersion = browser.version()

  page.on('console', message => console.warn(`[browser:${message.type()}] ${message.text()}`))
  await page.goto(`/?auto=1&suite=${suite}&warmups=${warmups}&iterations=${iterations}`)
  await page.waitForFunction(() => window.__benchmarkResult || window.__benchmarkError, undefined, { timeout: 10 * 60 * 1000 })
  const error = await page.evaluate(() => window.__benchmarkError)
  expect(error, error).toBeFalsy()
  const report = await page.evaluate(() => window.__benchmarkResult) as BenchmarkReport
  report.environment.runnerOs = process.env.RUNNER_OS || process.platform
  report.environment.browserName = browserName
  report.environment.browserVersion = browserVersion

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)

  const mainCpu = report.modes.find(mode => mode.id === 'main-cpu')
  expect(mainCpu?.supported, mainCpu?.errors?.join('\n')).toBe(true)
  const portrait = mainCpu?.cases.find(item => item.scenario === 'portrait-640x360')
  expect(portrait?.observedFaces.every(count => count === 1)).toBe(true)
  expect(portrait?.pointCounts).toContain(478)
})
