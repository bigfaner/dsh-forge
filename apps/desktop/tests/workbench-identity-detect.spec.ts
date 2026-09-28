// Task 1.2 — C7 evidence detection + DetectReport assembly
// (projects-identity/detect). Evidence semantics (D1 + §5.4 侦测实现纪律 +
// tech-design Interface 1 / T4):
//   gitRoot      — top-level `<root>/.git` fixed-prefix bounded probe only
//                  (directory OR worktree file both count); no glob, no
//                  walking up, no content reads (OneDrive hydration).
//   forgeTreeHit — one readdir of `<root>/docs/features` + bounded
//                  manifest.md existence per direct directory entry; a
//                  bare docs/ without forge structure does NOT count.
//   childRepos   — direct subdirectories with `.git`; chips only when ≥2
//                  (parent-dir mis-pick signal).
// DetectReport = Interface 1 type verbatim; the registered fast lane rides
// the three-tier identity match (identity-match.ts). Real-fs tmpdir fixtures.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { probeProjectPath, type RegisteredProjectIdentity } from '../src/main/workbench/projects-identity/detect.ts'
import { toComparableKey } from '../src/main/workbench/projects-identity/normalize.ts'

const IS_WIN = process.platform === 'win32'

const scratches: string[] = []
afterEach(() => {
  while (scratches.length > 0) {
    try {
      rmSync(scratches.pop() as string, { recursive: true, force: true })
    } catch {
      // best-effort scratch cleanup only
    }
  }
})

function scratchRoot(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-detect-${label}-`))
  scratches.push(dir)
  return dir
}

function fixtureProject(): string {
  const root = scratchRoot('full')
  mkdirSync(join(root, '.git'), { recursive: true })
  mkdirSync(join(root, 'docs', 'features', 'alpha'), { recursive: true })
  writeFileSync(join(root, 'docs', 'features', 'alpha', 'manifest.md'), '# alpha\n')
  mkdirSync(join(root, 'src'), { recursive: true })
  return root
}

function canonicalOf(path: string): string {
  return realpathSync.native(path).replaceAll('\\', '/')
}

function registeredRow(root: string, overrides: Partial<RegisteredProjectIdentity> = {}): RegisteredProjectIdentity {
  return {
    projectId: 'p-1',
    displayName: 'Demo',
    codeRoot: canonicalOf(root),
    codeRootKey: toComparableKey(canonicalOf(root)),
    identityDev: null,
    identityIno: null,
    ...overrides,
  }
}

describe('probeProjectPath — DetectReport 全字段产出(AC4)', () => {
  it('returns the full report for a git + forge-tree project root', () => {
    const root = fixtureProject()
    const report = probeProjectPath({ path: root }, [])
    const canonical = canonicalOf(root)
    expect(report.input).toBe(root)
    expect(report.canonicalPath).toBe(canonical)
    expect(report.pathKey).toBe(toComparableKey(canonical))
    expect(report.identity).not.toBeNull()
    expect(typeof report.identity?.dev).toBe('string')
    expect(typeof report.identity?.ino).toBe('string')
    expect(report.exists).toBe(true)
    expect(report.isDir).toBe(true)
    expect(report.readable).toBe(true)
    expect(report.registered).toBeNull()
    expect(report.gitRoot).toBe(canonical)
    expect(report.forgeTreeHit).toBe(true)
    expect(report.childRepos).toEqual([])
  })

  it('returns the all-null report for entry-rejected input (bare drive / relative, no fs access)', () => {
    const root = fixtureProject()
    const bare = probeProjectPath({ path: 'Z:' }, [registeredRow(root)])
    expect(bare).toEqual({
      input: 'Z:',
      canonicalPath: null,
      pathKey: null,
      identity: null,
      exists: false,
      isDir: false,
      readable: false,
      registered: null,
      gitRoot: null,
      forgeTreeHit: false,
      childRepos: [],
    })
    const relative = probeProjectPath({ path: 'some/relative' }, [])
    expect(relative.pathKey).toBeNull()
    expect(relative.exists).toBe(false)
  })

  it('degrades without throwing for a non-existent path (realpath 失败 → 字符串回退)', () => {
    const root = scratchRoot('missing')
    const missing = join(root, 'nope')
    const report = probeProjectPath({ path: missing }, [])
    expect(report.exists).toBe(false)
    expect(report.isDir).toBe(false)
    expect(report.readable).toBe(false)
    expect(report.canonicalPath).toBeNull()
    expect(report.pathKey).toBe(toComparableKey(missing))
    expect(report.identity).toBeNull()
    expect(report.gitRoot).toBeNull()
    expect(report.forgeTreeHit).toBe(false)
    expect(report.childRepos).toEqual([])
  })

  it('probes a regular file without directory evidence', () => {
    const root = scratchRoot('file')
    const file = join(root, 'plain.txt')
    writeFileSync(file, 'x')
    const report = probeProjectPath({ path: file }, [])
    expect(report.exists).toBe(true)
    expect(report.isDir).toBe(false)
    expect(report.readable).toBe(false)
    expect(report.canonicalPath).toBe(canonicalOf(file))
    expect(report.identity).not.toBeNull()
    expect(report.gitRoot).toBeNull()
    expect(report.forgeTreeHit).toBe(false)
    expect(report.childRepos).toEqual([])
  })
})

describe('probeProjectPath — registered 快车道(三层比对消费)', () => {
  it('fills the fast lane from a pathKey-tier hit', () => {
    const root = fixtureProject()
    const report = probeProjectPath({ path: root }, [registeredRow(root, { projectId: 'p-fast', displayName: 'Fast' })])
    expect(report.registered).toEqual({ projectId: 'p-fast', displayName: 'Fast' })
  })

  it('fills the fast lane from a (dev,ino) physical arbitration hit (dangling stored key)', () => {
    const root = fixtureProject()
    const stats = statSync(root)
    const stale = registeredRow(root, { codeRootKey: 'X:/STALE/OLD', identityDev: String(stats.dev), identityIno: String(stats.ino) })
    const report = probeProjectPath({ path: root }, [stale])
    expect(report.registered).toEqual({ projectId: 'p-1', displayName: 'Demo' })
  })

  it('stays null for a disjoint registry', () => {
    const root = fixtureProject()
    const report = probeProjectPath(
      { path: root },
      [registeredRow(root, { codeRoot: 'C:/Other/Where', codeRootKey: 'C:/OTHER/WHERE', identityDev: '1', identityIno: '2' })],
    )
    expect(report.registered).toBeNull()
  })
})

describe('probeProjectPath — 证据侦测(AC3:固定前缀有界探测,禁 glob,不读正文)', () => {
  it('gitRoot: null without .git; set with a .git directory; set with a .git FILE (worktree form)', () => {
    const bare = scratchRoot('nogit')
    mkdirSync(join(bare, 'docs'), { recursive: true })
    expect(probeProjectPath({ path: bare }, []).gitRoot).toBeNull()

    const repo = scratchRoot('gitdir')
    mkdirSync(join(repo, '.git'), { recursive: true })
    expect(probeProjectPath({ path: repo }, []).gitRoot).toBe(canonicalOf(repo))

    const worktree = scratchRoot('gitfile')
    writeFileSync(join(worktree, '.git'), 'gitdir: ../elsewhere/.git\n')
    expect(probeProjectPath({ path: worktree }, []).gitRoot).toBe(canonicalOf(worktree))
  })

  it('forgeTreeHit: false with no docs, false for bare docs/features without a manifest', () => {
    const noDocs = scratchRoot('nodocs')
    mkdirSync(join(noDocs, '.git'), { recursive: true })
    const noDocsReport = probeProjectPath({ path: noDocs }, [])
    expect(noDocsReport.forgeTreeHit).toBe(false)

    const bareDocs = scratchRoot('baredocs')
    mkdirSync(join(bareDocs, 'docs', 'features', 'beta'), { recursive: true })
    const bareDocsReport = probeProjectPath({ path: bareDocs }, [])
    expect(bareDocsReport.forgeTreeHit).toBe(false)
  })

  it('forgeTreeHit: true when a direct feature directory carries manifest.md', () => {
    const root = scratchRoot('hit')
    mkdirSync(join(root, 'docs', 'features', 'demo-feature'), { recursive: true })
    writeFileSync(join(root, 'docs', 'features', 'demo-feature', 'manifest.md'), '# demo\n')
    expect(probeProjectPath({ path: root }, []).forgeTreeHit).toBe(true)
  })

  it('forgeTreeHit: a plain FILE under docs/features is not a feature directory', () => {
    const root = scratchRoot('file-entry')
    mkdirSync(join(root, 'docs', 'features'), { recursive: true })
    writeFileSync(join(root, 'docs', 'features', 'stray.md'), '# stray\n')
    expect(probeProjectPath({ path: root }, []).forgeTreeHit).toBe(false)
  })

  it('forgeTreeHit probing is bounded: a manifest beyond the entry cap is not seen', () => {
    // NTFS enumerates directories in name order; d20 sorts last, past the
    // 16-entry probe cap → no hit. d01 sorts first → hit.
    const capped = scratchRoot('capped')
    mkdirSync(join(capped, 'docs', 'features'), { recursive: true })
    for (let i = 1; i <= 20; i += 1) {
      mkdirSync(join(capped, 'docs', 'features', `d${String(i).padStart(2, '0')}`))
    }
    writeFileSync(join(capped, 'docs', 'features', 'd20', 'manifest.md'), '# late\n')
    expect(probeProjectPath({ path: capped }, []).forgeTreeHit).toBe(false)

    const early = scratchRoot('early')
    mkdirSync(join(early, 'docs', 'features'), { recursive: true })
    for (let i = 1; i <= 20; i += 1) {
      mkdirSync(join(early, 'docs', 'features', `d${String(i).padStart(2, '0')}`))
    }
    writeFileSync(join(early, 'docs', 'features', 'd01', 'manifest.md'), '# early\n')
    expect(probeProjectPath({ path: early }, []).forgeTreeHit).toBe(true)
  })

  it('childRepos: chips list only when ≥2 direct children carry .git', () => {
    const root = scratchRoot('children')
    mkdirSync(join(root, 'repo-a', '.git'), { recursive: true })
    mkdirSync(join(root, 'repo-b', '.git'), { recursive: true })
    mkdirSync(join(root, 'plain'), { recursive: true })
    const report = probeProjectPath({ path: root }, [])
    const base = canonicalOf(root)
    expect(report.childRepos).toEqual([
      { name: 'repo-a', path: `${base}/repo-a` },
      { name: 'repo-b', path: `${base}/repo-b` },
    ])

    const single = scratchRoot('single')
    mkdirSync(join(single, 'only-repo', '.git'), { recursive: true })
    expect(probeProjectPath({ path: single }, []).childRepos).toEqual([])

    const none = scratchRoot('none')
    mkdirSync(join(none, 'src'), { recursive: true })
    expect(probeProjectPath({ path: none }, []).childRepos).toEqual([])
  })

  it.skipIf(!IS_WIN)('childRepos: a child .git in worktree FILE form still counts', () => {
    const root = scratchRoot('file-git')
    mkdirSync(join(root, 'repo-a'))
    mkdirSync(join(root, 'repo-b'))
    writeFileSync(join(root, 'repo-a', '.git'), 'gitdir: ../main/.git/worktrees/a\n')
    writeFileSync(join(root, 'repo-b', '.git'), 'gitdir: ../main/.git/worktrees/b\n')
    const report = probeProjectPath({ path: root }, [])
    expect(report.childRepos.map(entry => entry.name).sort()).toEqual(['repo-a', 'repo-b'])
  })
})
