import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { diffLocks, formatDiffReport } from '../../../scripts/sync-upstream.mjs'
import { materializeProjection, verifyUpstreamSources, verifyVendoredTree } from '../../../scripts/vendor-project.mjs'

function lockFixture(overrides: Record<string, unknown> = {}) {
  return {
    pinnedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    desktopHostVersion: '0.1.6-alpha.2',
    packages: [
      { name: '@deepseek-ai/dsh-desktop-host', version: '0.1.6-alpha.2', dir: 'apps/desktop-host', fileCount: 1 },
      { name: '@deepseek-ai/dsh', version: '0.1.6-alpha.2', dir: 'apps/cli', fileCount: 1 },
    ],
    registryDependencies: ['a-dep@1.0.0', 'removed-dep@2.0.0'],
    vendoredFiles: [
      { path: 'apps/desktop-host/src/index.ts', sha256: 'aaa' },
      { path: 'apps/cli/src/main.ts', sha256: 'bbb' },
    ],
    ...overrides,
  }
}

describe('sync-upstream --mode diff (upgrade drill)', () => {
  it('reports version bumps, file adds/removes/changes and registry drift readably', () => {
    const oldLock = lockFixture()
    const newLock = lockFixture({
      pinnedSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      desktopHostVersion: '0.1.7-alpha.0',
      packages: [
        { name: '@deepseek-ai/dsh-desktop-host', version: '0.1.7-alpha.0', dir: 'apps/desktop-host', fileCount: 2 },
        { name: '@deepseek-ai/new-pkg', version: '1.0.0', dir: 'packages/new', fileCount: 1 },
      ],
      registryDependencies: ['a-dep@1.1.0', 'added-dep@3.0.0'],
      vendoredFiles: [
        { path: 'apps/desktop-host/src/index.ts', sha256: 'zzz' }, // changed
        { path: 'apps/desktop-host/src/new.ts', sha256: 'ccc' }, // added
        // apps/cli/src/main.ts removed
      ],
    })

    const report = diffLocks(oldLock, newLock)
    expect(report.from.pinnedSha.slice(0, 8)).toBe('aaaaaaaa')
    expect(report.to.pinnedSha.slice(0, 8)).toBe('bbbbbbbb')
    expect(report.desktopHostVersionChanged).toBe(true)
    expect(report.packageChanges).toContainEqual({ name: '@deepseek-ai/dsh-desktop-host', change: 'version', from: '0.1.6-alpha.2', to: '0.1.7-alpha.0' })
    expect(report.packageChanges).toContainEqual({ name: '@deepseek-ai/dsh', change: 'removed', from: '0.1.6-alpha.2', to: undefined })
    expect(report.packageChanges).toContainEqual({ name: '@deepseek-ai/new-pkg', change: 'added', from: undefined, to: '1.0.0' })
    expect(report.registryDependencyChanges.added).toEqual(['a-dep@1.1.0', 'added-dep@3.0.0'])
    expect(report.registryDependencyChanges.removed).toEqual(['a-dep@1.0.0', 'removed-dep@2.0.0'])
    expect(report.changedFiles).toEqual(['apps/desktop-host/src/index.ts'])
    expect(report.addedFiles).toEqual(['apps/desktop-host/src/new.ts'])
    expect(report.removedFiles).toEqual(['apps/cli/src/main.ts'])

    const text = formatDiffReport(report)
    expect(text).toContain('upgrade diff: aaaaaaaa -> bbbbbbbb')
    expect(text).toContain('~ apps/desktop-host/src/index.ts')
    expect(text).toContain('+ apps/desktop-host/src/new.ts')
    expect(text).toContain('- apps/cli/src/main.ts')
    expect(text).toContain('0.1.6-alpha.2 -> 0.1.7-alpha.0')
  })

  it('identical locks produce an empty diff', () => {
    const report = diffLocks(lockFixture(), lockFixture())
    expect(report.packageChanges).toEqual([])
    expect(report.addedFiles).toEqual([])
    expect(report.changedFiles).toEqual([])
    expect(report.removedFiles).toEqual([])
    expect(report.registryDependencyChanges).toEqual({ added: [], removed: [] })
  })
})

describe('vendor-project projection invariants', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-vendor-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('materializes exactly the locked set, digest-verified, and re-verifies the tree', () => {
    const upstream = join(tmp, 'upstream')
    const target = join(tmp, 'vendored')
    const content = 'export const x = 1\n'
    mkdirSync(join(upstream, 'apps/desktop-host/src'), { recursive: true })
    writeFileSync(join(upstream, 'apps/desktop-host/src/index.ts'), content)

    const digest = sha256Of(content)
    void digest

    const lock = {
      pinnedSha: 'cccccccccccccccccccccccccccccccccccccccc',
      desktopHostVersion: '0.1.6-alpha.2',
      packages: [{ name: '@deepseek-ai/dsh-desktop-host', version: '0.1.6-alpha.2', dir: 'apps/desktop-host', fileCount: 1 }],
      registryDependencies: [],
      vendoredFiles: [{ path: 'apps/desktop-host/src/index.ts', sha256: sha256Of(content) }],
    }

    expect(verifyUpstreamSources(lock, upstream).ok).toBe(true)
    const result = materializeProjection(lock, upstream, target)
    expect(result).toEqual({ projected: 1, pinnedSha: lock.pinnedSha })
    expect(verifyVendoredTree(lock, target).ok).toBe(true)

    // tamper -> detection
    writeFileSync(join(target, 'apps/desktop-host/src/index.ts'), 'tampered\n')
    const tampered = verifyVendoredTree(lock, target)
    expect(tampered.ok).toBe(false)
    expect(tampered.problems.join('\n')).toContain('sha256 mismatch')

    // extra untracked file -> detection (dotfile metadata is exempt)
    writeFileSync(join(target, 'apps/desktop-host/src/rogue.ts'), 'rogue\n')
    expect(verifyVendoredTree(lock, target).ok).toBe(false)

    // upstream drift -> detection before projection
    writeFileSync(join(upstream, 'apps/desktop-host/src/index.ts'), 'drifted\n')
    const drifted = verifyUpstreamSources(lock, upstream)
    expect(drifted.ok).toBe(false)
    expect(drifted.problems.join('\n')).toContain('sha256 mismatch')
  })
})

function sha256Of(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
