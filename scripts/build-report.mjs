import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

const inputRoot = resolve(process.env.BENCHMARK_RESULTS_DIR || 'benchmark-results')
const outputRoot = resolve(process.env.BENCHMARK_REPORT_DIR || 'report')

async function findJson(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? findJson(join(directory, entry.name))
    : Promise.resolve(entry.name.endsWith('.json') ? [join(directory, entry.name)] : [])))
  return nested.flat()
}

const files = await findJson(inputRoot)
if (!files.length)
  throw new Error(`No benchmark JSON files found in ${inputRoot}`)
const reports = await Promise.all(files.map(async (file) => {
  const report = JSON.parse(await readFile(file, 'utf8'))
  report.sourceFile = basename(file)
  return report
}))

function environmentName(report) {
  return [
    report.environment.runnerOs || report.environment.platform,
    report.environment.browserName || 'browser',
    report.environment.browserVersion || '',
  ].filter(Boolean).join(' / ')
}

const rows = reports.flatMap(report => report.modes.flatMap(mode => mode.cases.map(testCase => ({
  environment: environmentName(report),
  renderer: mode.renderer?.renderer || report.environment.renderer?.renderer || 'Unavailable',
  software: mode.renderer?.software ?? report.environment.renderer?.software ?? true,
  mode: mode.id,
  scenario: testCase.scenario,
  api: testCase.runningMode,
  p50: testCase.inference.p50Ms,
  p95: testCase.inference.p95Ms,
  e2eP95: testCase.endToEnd.p95Ms,
  faces: [...new Set(testCase.observedFaces)].join(','),
  points: testCase.pointCounts.join(','),
}))))

const compatibility = reports.flatMap(report => report.modes.map(mode => ({
  environment: environmentName(report),
  mode: mode.id,
  supported: mode.supported,
  error: mode.errors?.join(' | ') || '',
})))

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
const markdownEscape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')

const summary = [
  '# Face Landmarker benchmark',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Compatibility',
  '',
  '| Environment | Mode | Status |',
  '|---|---|---|',
  ...compatibility.map(item => `| ${markdownEscape(item.environment)} | ${item.mode} | ${item.supported ? '✅ supported' : '❌ unavailable'} |`),
  '',
  '## Performance',
  '',
  '| Environment | Renderer | Mode | Scenario | API | P50 infer | P95 infer | P95 E2E | Faces | Points |',
  '|---|---|---|---|---:|---:|---:|---:|---:|---:|',
  ...rows.map(row => `| ${markdownEscape(row.environment)} | ${markdownEscape(row.renderer)}${row.software ? ' ⚠️ software' : ''} | ${row.mode} | ${row.scenario} | ${row.api} | ${row.p50}ms | ${row.p95}ms | ${row.e2eP95}ms | ${row.faces} | ${row.points || '—'} |`),
  '',
  '> GPU timings from software renderers such as SwiftShader or llvmpipe are compatibility data, not hardware GPU benchmarks.',
  '',
].join('\n')

const tableRows = rows.map(row => `<tr><td>${escapeHtml(row.environment)}</td><td>${escapeHtml(row.renderer)} ${row.software ? '<span class="warn">software</span>' : '<span class="ok">hardware</span>'}</td><td>${row.mode}</td><td>${row.scenario}</td><td>${row.api}</td><td>${row.p50}</td><td>${row.p95}</td><td>${row.e2eP95}</td><td>${row.faces}</td><td>${row.points || '—'}</td></tr>`).join('')
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Face Landmarker benchmark</title><style>body{margin:32px;font:14px system-ui;color:#e5e7eb;background:#090d16}h1{font-size:36px}.meta{color:#94a3b8}.wrap{overflow:auto;border:1px solid #263246;border-radius:12px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border-bottom:1px solid #1e293b;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:#111827;color:#93c5fd}.warn,.ok{padding:2px 6px;border-radius:99px;font-size:11px}.warn{color:#fbbf24;background:#422006}.ok{color:#86efac;background:#052e16}details{margin-top:24px}pre{overflow:auto;padding:16px;background:#020617}</style><h1>Face Landmarker benchmark</h1><p class="meta">Generated ${new Date().toISOString()} · ${reports.length} environments · ${rows.length} cases</p><div class="wrap"><table><thead><tr><th>Environment</th><th>Renderer</th><th>Mode</th><th>Scenario</th><th>API</th><th>P50 infer</th><th>P95 infer</th><th>P95 E2E</th><th>Faces</th><th>Points</th></tr></thead><tbody>${tableRows}</tbody></table></div><details><summary>Raw aggregate JSON</summary><pre>${escapeHtml(JSON.stringify(reports, null, 2))}</pre></details>`

await mkdir(outputRoot, { recursive: true })
await writeFile(join(outputRoot, 'summary.md'), summary)
await writeFile(join(outputRoot, 'index.html'), html)
await writeFile(join(outputRoot, 'results.json'), `${JSON.stringify(reports, null, 2)}\n`)
console.log(`wrote report for ${reports.length} environments to ${outputRoot}`)
