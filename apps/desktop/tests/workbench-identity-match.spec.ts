// Task 1.2 — D11 three-tier identity match matrix (projects-identity/
// identity-match). Comparison cascade (task AC + §5.5):
//   canonical 命中 → pathKey 命中 → (dev,ino) 物理仲裁命中
// Any hit = 「同一项目」and produces the self-heal write-back payload (回写
// 经 1.3 注册动词,本域不直接写库). Dangling/NULL stored keys are tolerated
// (skipped in their tier; healed on any-tier hit). Pure function — no fs.

import { describe, expect, it } from 'vitest'
import { matchProjectIdentity, type RegisteredProjectIdentity } from '../src/main/workbench/projects-identity/identity-match.ts'

function row(overrides: Partial<RegisteredProjectIdentity> = {}): RegisteredProjectIdentity {
  return {
    projectId: 'p-1',
    displayName: 'Demo',
    codeRoot: 'C:/Real/Path',
    codeRootKey: 'C:/REAL/PATH',
    identityDev: '11',
    identityIno: '22',
    ...overrides,
  }
}

describe('matchProjectIdentity — canonical → pathKey → (dev,ino) 级联', () => {
  it('matches on exact canonical equality with no heal when the row is already fresh', () => {
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/Real/Path', pathKey: 'C:/REAL/PATH', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [row()],
    )
    expect(result).toEqual({ matched: true, tier: 'canonical', project: row(), heal: null })
  })

  it('canonical tier still wins when another row would only physical-match', () => {
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/Real/Path', pathKey: 'C:/REAL/PATH', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [row({ projectId: 'p-phys', codeRoot: 'C:/Other', codeRootKey: 'C:/OTHER', identityDev: '11', identityIno: '22' }), row()],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('canonical')
    expect(result.project.projectId).toBe('p-1')
  })

  it('falls to the pathKey tier on case drift and heals the stored canonical', () => {
    const stored = row({ codeRoot: 'C:/Real/Path' })
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/Real/PATH', pathKey: 'C:/REAL/PATH', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [stored],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('pathKey')
    expect(result.heal).toEqual({
      projectId: 'p-1',
      codeRoot: 'C:/Real/PATH',
      codeRootKey: 'C:/REAL/PATH',
      identityDev: '11',
      identityIno: '22',
      identityVerified: true,
    })
  })

  it('physical tier arbitrates a moved directory (dangling key, same dev/ino)', () => {
    const stored = row({ codeRoot: 'C:/Old/Home', codeRootKey: 'C:/OLD/HOME' })
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/New/Home', pathKey: 'C:/NEW/HOME', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [stored],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('physical')
    expect(result.heal).toMatchObject({ projectId: 'p-1', codeRoot: 'C:/New/Home', codeRootKey: 'C:/NEW/HOME' })
  })

  it('tolerates NULL stored keys: skips the pathKey tier and still arbitrates physically', () => {
    const stored = row({ codeRootKey: null, codeRoot: 'C:/Old/Home' })
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/New/Home', pathKey: 'C:/NEW/HOME', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [stored],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('physical')
    expect(result.heal).toMatchObject({ projectId: 'p-1', codeRootKey: 'C:/NEW/HOME', identityDev: '11', identityIno: '22' })
  })

  it('backfills a NULL physical identity via the pathKey tier hit', () => {
    const stored = row({ identityDev: null, identityIno: null })
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/Moved/Case', pathKey: 'C:/REAL/PATH', identity: { dev: '33', ino: '44' }, identityVerified: true },
      [stored],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('pathKey')
    expect(result.heal).toMatchObject({
      projectId: 'p-1',
      codeRoot: 'C:/Moved/Case',
      codeRootKey: 'C:/REAL/PATH',
      identityDev: '33',
      identityIno: '44',
    })
  })

  it('refreshes a stale stored identity on a canonical-tier hit (最新探测值仲裁回写)', () => {
    const stored = row({ identityDev: '99', identityIno: '88' })
    const result = matchProjectIdentity(
      { canonicalPath: 'C:/Real/Path', pathKey: 'C:/REAL/PATH', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [stored],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('canonical')
    expect(result.heal).toMatchObject({ identityDev: '11', identityIno: '22', codeRoot: 'C:/Real/Path' })
  })

  it('probe fell back (realpath failed): keeps the stored canonical, still backfills identity via the pathKey tier', () => {
    const stored = row({ codeRootKey: 'C:/OLD/HOME', identityDev: null, identityIno: null })
    const result = matchProjectIdentity(
      { canonicalPath: null, pathKey: 'C:/OLD/HOME', identity: { dev: '33', ino: '44' }, identityVerified: false },
      [stored],
    )
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('pathKey')
    // string fallback matched the dangling key: canonical stays stored, physical identity is backfilled, verified=0
    expect(result.heal).toEqual({
      projectId: 'p-1',
      codeRoot: 'C:/Real/Path',
      codeRootKey: 'C:/OLD/HOME',
      identityDev: '33',
      identityIno: '44',
      identityVerified: false,
    })
  })

  it('emits no heal when a fallback-string probe matches an already-fresh row', () => {
    const stored = row({ codeRootKey: 'C:/REAL/PATH' })
    const result = matchProjectIdentity(
      { canonicalPath: null, pathKey: 'C:/REAL/PATH', identity: null, identityVerified: false },
      [stored],
    )
    expect(result).toEqual({ matched: true, tier: 'pathKey', project: stored, heal: null })
  })

  it('skips the physical tier when either side lacks (dev,ino)', () => {
    const stored = row({ codeRoot: 'C:/Other', codeRootKey: 'C:/OTHER' })
    const noProbeIdentity = matchProjectIdentity(
      { canonicalPath: 'C:/New/Home', pathKey: 'C:/NEW/HOME', identity: null, identityVerified: true },
      [stored],
    )
    expect(noProbeIdentity).toEqual({ matched: false })

    const noRowIdentity = matchProjectIdentity(
      { canonicalPath: 'C:/New/Home', pathKey: 'C:/NEW/HOME', identity: { dev: '11', ino: '22' }, identityVerified: true },
      [row({ codeRoot: 'C:/Other', codeRootKey: 'C:/OTHER', identityDev: null, identityIno: null })],
    )
    expect(noRowIdentity).toEqual({ matched: false })
  })

  it('reports no match for empty registries or fully disjoint identities', () => {
    const probe = { canonicalPath: 'C:/New/Home', pathKey: 'C:/NEW/HOME', identity: { dev: '11', ino: '22' }, identityVerified: true }
    expect(matchProjectIdentity(probe, [])).toEqual({ matched: false })
    expect(
      matchProjectIdentity(probe, [row({ codeRoot: 'C:/Other', codeRootKey: 'C:/OTHER', identityDev: '55', identityIno: '66' })]),
    ).toEqual({ matched: false })
  })

  it('scans rows in order and the first tier hit wins', () => {
    const probe = { canonicalPath: 'C:/Real/Path', pathKey: 'C:/REAL/PATH', identity: { dev: '11', ino: '22' }, identityVerified: true }
    const result = matchProjectIdentity(probe, [
      row({ projectId: 'p-2', codeRoot: 'C:/Elsewhere', codeRootKey: 'C:/ELSEWHERE' }),
      row({ projectId: 'p-3', codeRoot: 'C:/Real/Path' }),
    ])
    expect(result.matched).toBe(true)
    if (!result.matched) return
    expect(result.tier).toBe('canonical')
    expect(result.project.projectId).toBe('p-3')
  })
})
