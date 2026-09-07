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
  runnerOs: report.environment.runnerOs || report.environment.platform,
  renderer: mode.renderer?.renderer || report.environment.renderer?.renderer || 'Unavailable',
  software: mode.renderer?.software ?? report.environment.renderer?.software ?? true,
  mode: mode.id,
  scenario: testCase.scenario,
  api: testCase.runningMode,
  count: testCase.inference.count,
  total: testCase.inference.totalMs ?? testCase.inference.meanMs * testCase.inference.count,
  samples: testCase.inference.samplesMs || [],
  p50: testCase.inference.p50Ms,
  p95: testCase.inference.p95Ms,
  p99: testCase.inference.p99Ms,
  max: testCase.inference.maxMs,
  over50: (testCase.inference.samplesMs || []).filter(value => value > 50).length,
  e2eP95: testCase.endToEnd.p95Ms,
  faces: [...new Set(testCase.observedFaces)].join(','),
  points: testCase.pointCounts.join(','),
}))))

const compatibility = reports.flatMap(report => report.modes.map(mode => ({
  environment: environmentName(report),
  mode: mode.id,
  measured: mode.cases.length > 0,
  error: mode.errors?.join(' | ') || '',
})))

function groupRows(items) {
  const groups = new Map()
  for (const item of items) {
    const key = `${item.environment}\u0000${item.scenario}\u0000${item.api}`
    const group = groups.get(key) || []
    group.push(item)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  if (!sorted.length)
    return undefined
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function geometricMean(values) {
  if (!values.length)
    return undefined
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}

function formatRelative(ratio) {
  if (ratio === undefined)
    return 'No comparable data'
  const change = Math.abs((ratio - 1) * 100).toFixed(1)
  if (Math.abs(ratio - 1) < 0.005)
    return 'About equal to main-cpu'
  return `${change}% ${ratio < 1 ? 'faster' : 'slower'} than main-cpu`
}

function formatSpeedup(value, target, reference) {
  if (value === undefined)
    return `No comparable ${target}/${reference} data`
  return value >= 1
    ? `${target} is ${value.toFixed(2)}× faster than ${reference}`
    : `${target} is ${(1 / value).toFixed(2)}× slower than ${reference}`
}

function formatDuration(milliseconds) {
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)}s` : `${milliseconds.toFixed(1)}ms`
}

function pairedSpeedups(groups, targetMode, referenceMode, metric, hardwareOnly = false) {
  return groups.flatMap((group) => {
    const target = group.find(row => row.mode === targetMode)
    const reference = group.find(row => row.mode === referenceMode)
    if (!target || !reference || !target[metric] || !reference[metric])
      return []
    const identifiedHardware = !target.software && /Apple M\d|NVIDIA|GeForce|AMD|Radeon|Intel(?:\(R\))?/i.test(target.renderer)
    if (hardwareOnly && !identifiedHardware)
      return []
    return [reference[metric] / target[metric]]
  })
}

const modes = ['worker-gpu', 'worker-cpu', 'main-gpu', 'main-cpu']
const comparisonGroups = groupRows(rows)
const winCounts = new Map(modes.map(mode => [mode, 0]))
for (const group of comparisonGroups) {
  const winner = group.reduce((best, current) => current.p50 < best.p50 ? current : best)
  winCounts.set(winner.mode, (winCounts.get(winner.mode) || 0) + 1)
}

const modeSummary = modes.map((mode) => {
  const relativeRatios = comparisonGroups.flatMap((group) => {
    const current = group.find(row => row.mode === mode)
    const baseline = group.find(row => row.mode === 'main-cpu')
    return current && baseline && current.p50 && baseline.p50 ? [current.p50 / baseline.p50] : []
  })
  return {
    mode,
    measured: new Set(compatibility.filter(item => item.mode === mode && item.measured).map(item => item.environment)).size,
    totalEnvironments: reports.length,
    wins: winCounts.get(mode) || 0,
    comparisons: relativeRatios.length,
    relative: geometricMean(relativeRatios),
    samples: rows.filter(row => row.mode === mode).reduce((sum, row) => sum + row.count, 0),
    total: rows.filter(row => row.mode === mode).reduce((sum, row) => sum + row.total, 0),
    over50: rows.filter(row => row.mode === mode).reduce((sum, row) => sum + row.samples.filter(value => value > 50).length, 0),
  }
})

const mainGpuPairs = pairedSpeedups(comparisonGroups, 'main-gpu', 'main-cpu', 'p50', true)
const workerGpuPairs = pairedSpeedups(comparisonGroups, 'worker-gpu', 'worker-cpu', 'p50', true)
const cpuWorkerPairs = pairedSpeedups(comparisonGroups, 'worker-cpu', 'main-cpu', 'e2eP95')
const gpuWorkerPairs = pairedSpeedups(comparisonGroups, 'worker-gpu', 'main-gpu', 'e2eP95')
const mainGpuSpeedup = median(mainGpuPairs)
const workerGpuSpeedup = median(workerGpuPairs)
const cpuWorkerE2e = median(cpuWorkerPairs)
const gpuWorkerE2e = median(gpuWorkerPairs)
const totalWins = modeSummary.reduce((sum, item) => sum + item.wins, 0)
const leader = [...modeSummary].sort((left, right) => right.wins - left.wins)[0]
const conclusionLines = [
  totalWins
    ? `**Overall P50 leader:** ${leader.mode} won ${leader.wins}/${totalWins} comparable environment/scenario groups.`
    : '**Overall P50 leader:** insufficient comparable measurements.',
  `**Verified hardware GPU:** ${formatSpeedup(mainGpuSpeedup, 'main-gpu', 'main-cpu')} (${mainGpuPairs.length} pairs); ${formatSpeedup(workerGpuSpeedup, 'worker-gpu', 'worker-cpu')} (${workerGpuPairs.length} pairs).`,
  `**Worker end-to-end P95:** ${formatSpeedup(cpuWorkerE2e, 'worker-cpu', 'main-cpu')} (${cpuWorkerPairs.length} pairs); ${formatSpeedup(gpuWorkerE2e, 'worker-gpu', 'main-gpu')} (${gpuWorkerPairs.length} pairs).`,
  `**Measured inference time:** ${modeSummary.map(item => `${item.mode} ${formatDuration(item.total)} across ${item.samples} samples (${item.over50} over 50ms)`).join('; ')}.`,
  '**Interpretation:** comparisons are paired within the same runner, browser, scenario, and API. Software or unidentified GPU renderers are excluded from GPU conclusions.',
]

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
  '## Conclusions',
  '',
  ...conclusionLines.map(line => `- ${line}`),
  '',
  '## Mode summary',
  '',
  '| Mode | Environments | P50 wins | Relative P50 | Total inference | >50ms |',
  '|---|---:|---:|---|---:|---:|',
  ...modeSummary.map(item => `| ${item.mode} | ${item.measured}/${item.totalEnvironments} | ${item.wins}/${totalWins} | ${formatRelative(item.relative)} (${item.comparisons} pairs) | ${formatDuration(item.total)} / ${item.samples} samples | ${item.over50} |`),
  '',
  '## Compatibility',
  '',
  '| Environment | Mode | Status |',
  '|---|---|---|',
  ...compatibility.map(item => `| ${markdownEscape(item.environment)} | ${item.mode} | ${item.measured ? '✅ measured' : '❌ unavailable'} |`),
  '',
  '## Performance',
  '',
  '| Environment | Renderer | Mode | Scenario | API | Total infer | P50 | P95 | P99 | Max | >50ms | P95 E2E | Faces | Points |',
  '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...rows.map(row => `| ${markdownEscape(row.environment)} | ${markdownEscape(row.renderer)}${row.software ? ' ⚠️ software' : ''} | ${row.mode} | ${row.scenario} | ${row.api} | ${formatDuration(row.total)} | ${row.p50}ms | ${row.p95}ms | ${row.p99}ms | ${row.max}ms | ${row.samples.length ? row.over50 : '—'} | ${row.e2eP95}ms | ${row.faces} | ${row.points || '—'} |`),
  '',
  '> GPU timings from software renderers such as SwiftShader or llvmpipe are compatibility data, not hardware GPU benchmarks.',
  '',
].join('\n')

const tableRows = rows.map(row => `<tr><td>${escapeHtml(row.environment)}</td><td>${escapeHtml(row.renderer)} ${row.software ? '<span class="warn">software</span>' : '<span class="ok">hardware</span>'}</td><td>${row.mode}</td><td>${row.scenario}</td><td>${row.api}</td><td>${formatDuration(row.total)}</td><td>${row.p50}</td><td>${row.p95}</td><td>${row.p99}</td><td>${row.max}</td><td>${row.samples.length ? row.over50 : '—'}</td><td>${row.e2eP95}</td><td>${row.faces}</td><td>${row.points || '—'}</td></tr>`).join('')
const conclusionHtml = conclusionLines.map(line => `<li>${line.replaceAll('**', '')}</li>`).join('')
const modeRows = modeSummary.map(item => `<tr><td>${item.mode}</td><td>${item.measured}/${item.totalEnvironments}</td><td>${item.wins}/${totalWins}</td><td>${formatRelative(item.relative)} (${item.comparisons} pairs)</td><td>${formatDuration(item.total)} / ${item.samples}</td><td>${item.over50}</td></tr>`).join('')
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Face Landmarker benchmark</title><style>body{margin:32px;font:14px system-ui;color:#e5e7eb;background:#090d16}h1{font-size:36px}h2{margin-top:32px}.meta{color:#94a3b8}.summary{padding:16px 24px;border:1px solid #263246;border-radius:12px;background:#111827;line-height:1.7}.wrap{overflow:auto;border:1px solid #263246;border-radius:12px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border-bottom:1px solid #1e293b;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:#111827;color:#93c5fd}.warn,.ok{padding:2px 6px;border-radius:99px;font-size:11px}.warn{color:#fbbf24;background:#422006}.ok{color:#86efac;background:#052e16}details{margin-top:24px}pre{overflow:auto;padding:16px;background:#020617}</style><h1>Face Landmarker benchmark</h1><p class="meta">Generated ${new Date().toISOString()} · ${reports.length} environments · ${rows.length} cases</p><h2>Conclusions</h2><ul class="summary">${conclusionHtml}</ul><h2>Mode summary</h2><div class="wrap"><table><thead><tr><th>Mode</th><th>Environments</th><th>P50 wins</th><th>Relative P50</th><th>Total inference / samples</th><th>&gt;50ms</th></tr></thead><tbody>${modeRows}</tbody></table></div><h2>Measurements</h2><div class="wrap"><table><thead><tr><th>Environment</th><th>Renderer</th><th>Mode</th><th>Scenario</th><th>API</th><th>Total infer</th><th>P50</th><th>P95</th><th>P99</th><th>Max</th><th>&gt;50ms</th><th>P95 E2E</th><th>Faces</th><th>Points</th></tr></thead><tbody>${tableRows}</tbody></table></div><details><summary>Raw aggregate JSON</summary><pre>${escapeHtml(JSON.stringify(reports, null, 2))}</pre></details>`

await mkdir(outputRoot, { recursive: true })
await writeFile(join(outputRoot, 'summary.md'), summary)
await writeFile(join(outputRoot, 'index.html'), html)
await writeFile(join(outputRoot, 'results.json'), `${JSON.stringify(reports, null, 2)}\n`)
console.log(`wrote report for ${reports.length} environments to ${outputRoot}`)
