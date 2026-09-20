// Semver parsing and comparison (pure, no dependencies, no Electron).
// Implements the comparison rules of semver.org 2.0.0 including
// prereleases: 0.2.0-rc.1 < 0.2.0, 1.0.0-alpha < 1.0.0-alpha.1 <
// 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1.

export interface ParsedSemver {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly string[]
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/

/**
 * Parse a semver string, tolerating the GitHub Releases `v` prefix
 * (`v0.2.0-rc.1` → `0.2.0-rc.1`). Returns undefined for non-semver input.
 */
export function parseSemver(input: string): ParsedSemver | undefined {
  const raw = input.trim()
  const stripped = raw.startsWith('v') || raw.startsWith('V') ? raw.slice(1) : raw
  const match = SEMVER_RE.exec(stripped)
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] === undefined ? { prerelease: [] } : { prerelease: match[4].split('.') }),
  }
}

function isNumericIdentifier(id: string): boolean {
  return /^(0|[1-9]\d*)$/.test(id)
}

function comparePrereleaseIdentifiers(a: string, b: string): number {
  const aNum = isNumericIdentifier(a)
  const bNum = isNumericIdentifier(b)
  // Numeric identifiers always have lower precedence than alphanumeric.
  if (aNum && bNum) return Number(a) - Number(b)
  if (aNum) return -1
  if (bNum) return 1
  // Alphanumeric: ASCII sort order.
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Compare two semver strings (either may carry a `v` prefix).
 * Returns < 0 when a < b, 0 when equal, > 0 when a > b.
 * Prerelease semantics: any prerelease sorts below the plain release.
 * Throws on non-semver input (callers validate with parseSemver first).
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (pa === undefined) throw new Error(`not a semver string: ${a}`)
  if (pb === undefined) throw new Error(`not a semver string: ${b}`)

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] - pb[key]
  }

  const preA = pa.prerelease
  const preB = pb.prerelease
  // A plain release outranks any prerelease of the same x.y.z.
  if (preA.length === 0 && preB.length === 0) return 0
  if (preA.length === 0) return 1
  if (preB.length === 0) return -1
  const len = Math.min(preA.length, preB.length)
  for (let i = 0; i < len; i++) {
    const ord = comparePrereleaseIdentifiers(preA[i], preB[i])
    if (ord !== 0) return ord
  }
  // All shared identifiers equal: the larger identifier set sorts higher.
  return preA.length - preB.length
}
