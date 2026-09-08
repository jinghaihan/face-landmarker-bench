import type { CaseResult, LandmarkComparison, LandmarkPoint, ModeResult } from './types'

function percentile(values: number[], ratio: number): number | undefined {
  if (!values.length)
    return undefined
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

function mean(values: number[]): number | undefined {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined
}

function round(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 100_000) / 100_000
}

function centroid(points: LandmarkPoint[]): LandmarkPoint {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + point.z,
  }), { x: 0, y: 0, z: 0 })
  const divisor = points.length || 1
  return { x: total.x / divisor, y: total.y / divisor, z: total.z / divisor }
}

function matchFaces(baseline: LandmarkPoint[][], candidate: LandmarkPoint[][]): Array<[LandmarkPoint[], LandmarkPoint[]]> {
  const remaining = candidate.map((points, index) => ({ points, index, center: centroid(points) }))
  return baseline.flatMap((points) => {
    if (!remaining.length)
      return []
    const center = centroid(points)
    let best = 0
    let bestDistance = Number.POSITIVE_INFINITY
    remaining.forEach((item, index) => {
      const distance = Math.hypot(item.center.x - center.x, item.center.y - center.y)
      if (distance < bestDistance) {
        best = index
        bestDistance = distance
      }
    })
    const [matched] = remaining.splice(best, 1)
    return [[points, matched.points]]
  })
}

export function compareCase(mode: ModeResult['id'], baseline: CaseResult, candidate: CaseResult): LandmarkComparison {
  const baselineFaces = baseline.landmarkSample || []
  const candidateFaces = candidate.landmarkSample || []
  const pairs = matchFaces(baselineFaces, candidateFaces)
  const distances2d: number[] = []
  const distancesZ: number[] = []
  const diagonal = Math.hypot(candidate.width, candidate.height)

  for (const [baselinePoints, candidatePoints] of pairs) {
    const count = Math.min(baselinePoints.length, candidatePoints.length)
    for (let index = 0; index < count; index++) {
      const reference = baselinePoints[index]
      const current = candidatePoints[index]
      const dx = (current.x - reference.x) * candidate.width
      const dy = (current.y - reference.y) * candidate.height
      distances2d.push(Math.hypot(dx, dy) / diagonal * 100)
      distancesZ.push(Math.abs(current.z - reference.z) * 100)
    }
  }

  return {
    mode,
    scenario: candidate.scenario,
    label: candidate.label,
    baselineFaces: baselineFaces.length,
    taskVisionFaces: candidateFaces.length,
    baselinePointCounts: baselineFaces.map(points => points.length),
    taskVisionPointCounts: candidateFaces.map(points => points.length),
    matchedFaces: pairs.length,
    comparedPoints: distances2d.length,
    topologyMatches: baselineFaces.length === candidateFaces.length
      && pairs.every(([left, right]) => left.length === right.length),
    mean2dPercent: round(mean(distances2d)),
    p95_2dPercent: round(percentile(distances2d, 0.95)),
    max2dPercent: round(distances2d.length ? Math.max(...distances2d) : undefined),
    meanAbsZPercent: round(mean(distancesZ)),
  }
}
