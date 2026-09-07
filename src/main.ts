import type { BenchmarkReport } from './types'
import { runBenchmark } from './benchmark'
import './style.css'

declare global {
  interface Window {
    __benchmarkResult?: BenchmarkReport
    __benchmarkError?: string
  }
}

const suite = document.querySelector<HTMLSelectElement>('#suite')!
const warmups = document.querySelector<HTMLInputElement>('#warmups')!
const iterations = document.querySelector<HTMLInputElement>('#iterations')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const status = document.querySelector<HTMLElement>('#status')!
const summary = document.querySelector<HTMLElement>('#summary')!
const raw = document.querySelector<HTMLElement>('#raw')!

const params = new URLSearchParams(location.search)
suite.value = params.get('suite') || 'smoke'
warmups.value = params.get('warmups') || '3'
iterations.value = params.get('iterations') || '15'

function render(report: BenchmarkReport): void {
  const rows = report.modes.flatMap(mode => mode.cases.map(testCase => `
    <tr>
      <td>${mode.id}</td><td>${testCase.label}</td><td>${testCase.runningMode}</td>
      <td>${testCase.inference.p50Ms.toFixed(2)}</td><td>${testCase.inference.p95Ms.toFixed(2)}</td>
      <td>${testCase.endToEnd.p95Ms.toFixed(2)}</td><td>${[...new Set(testCase.observedFaces)].join(', ')}</td>
      <td>${testCase.pointCounts.join(', ') || '—'}</td>
    </tr>`)).join('')
  summary.innerHTML = `
    <div class="renderer"><strong>Renderer</strong> ${report.environment.renderer.renderer || 'Unavailable'}
      ${report.environment.renderer.software ? '<span class="warning">software</span>' : '<span class="ok">hardware</span>'}
    </div>
    <div class="table-wrap"><table><thead><tr><th>Mode</th><th>Scenario</th><th>API</th><th>P50 infer</th><th>P95 infer</th><th>P95 E2E</th><th>Faces</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div>`
  raw.textContent = JSON.stringify(report, null, 2)
}

async function execute(): Promise<void> {
  runButton.disabled = true
  window.__benchmarkResult = undefined
  window.__benchmarkError = undefined
  try {
    const report = await runBenchmark({
      suite: suite.value,
      warmups: Number(warmups.value),
      iterations: Number(iterations.value),
      onProgress: (message) => { status.textContent = `Running ${message}` },
    })
    window.__benchmarkResult = report
    render(report)
    status.textContent = 'Complete'
  }
  catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    window.__benchmarkError = message
    status.textContent = `Failed: ${message}`
    throw error
  }
  finally {
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => void execute())
if (params.get('auto') === '1')
  void execute()
