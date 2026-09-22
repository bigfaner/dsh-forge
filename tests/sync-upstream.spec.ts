import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseWorkspaceGlobs,
  indexWorkspace,
  resolveClosure,
  projectPackageFiles,
  computeLock,
  verifyLock,
  sha256,
} from '../scripts/sync-upstream.mjs'

const testsDir = dirname(fileURLToPath(import.meta.url))

// --- fixture workspace ------------------------------------------------------
// root-pkg -> ws-a (workspace:*), ws-b (workspace:*), reg (registry)
// ws-a -> ws-c (workspace:*) ; ws-a devDep ws-dev (must be EXCLUDED)
// ws-b -> nothing ; ws-c -> ws-a (cycle-safe) ; orphan never referenced

let root

function writePkg(dir, manifest, srcFiles = {}) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  for (const [name, content] of Object.entries(srcFiles)) {
    const p = join(dir, name)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'sync-upstream-test-'))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - packages/*',
    '',
  ].join('\n'))
  writePkg(join(root, 'packages/root-pkg'), {
    name: 'root-pkg', version: '1.0.0',
    dependencies: { 'ws-a': 'workspace:*', 'ws-b': 'workspace:^', reg: '^1.2.3' },
  }, { 'src/index.ts': 'export {}\n', 'tsconfig.json': '{}\n', 'tests/x.test.ts': 'should NOT be projected\n' })
  writePkg(join(root, 'packages/ws-a'), {
    name: 'ws-a', version: '0.1.0',
    dependencies: { 'ws-c': 'workspace:*' },
    devDependencies: { 'ws-dev': 'workspace:*' },
  }, { 'src/lib.ts': 'export const a = 1\n' })
  writePkg(join(root, 'packages/ws-b'), { name: 'ws-b', version: '0.2.0' }, { 'src/b.ts': 'export {}\n' })
  writePkg(join(root, 'packages/ws-c'), {
    name: 'ws-c', version: '0.3.0',
    dependencies: { 'ws-a': 'workspace:*' }, // cycle root->a->c->a must terminate
  }, { 'src/c.ts': 'export {}\n' })
  writePkg(join(root, 'packages/ws-dev'), { name: 'ws-dev', version: '9.9.9' }, { 'src/dev.ts': 'export {}\n' })
  writePkg(join(root, 'packages/orphan'), { name: 'orphan', version: '0.0.1' }, { 'src/o.ts': 'export {}\n' })
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

// --- workspace indexing -----------------------------------------------------

describe('parseWorkspaceGlobs', () => {
  it('extracts packages list from pnpm-workspace.yaml', () => {
    expect(parseWorkspaceGlobs(root)).toEqual(['packages/*'])
  })
})

describe('indexWorkspace', () => {
  it('indexes every package with a name', () => {
    const index = indexWorkspace(root)
    expect([...index.keys()].sort()).toEqual(['orphan', 'root-pkg', 'ws-a', 'ws-b', 'ws-c', 'ws-dev'])
  })
})

// --- closure resolution -------------------------------------------------------

describe('resolveClosure', () => {
  it('BFS over workspace dependencies, excludes devDeps and unreferenced packages', () => {
    const { order, registryDeps } = resolveClosure(indexWorkspace(root), 'root-pkg')
    expect(order[0]).toBe('root-pkg')
    expect([...order].sort()).toEqual(['root-pkg', 'ws-a', 'ws-b', 'ws-c'])
    expect(registryDeps).toEqual(['reg@^1.2.3'])
    expect(order).not.toContain('ws-dev')
    expect(order).not.toContain('orphan')
  })

  it('handles dependency cycles without infinite recursion', () => {
    const { order } = resolveClosure(indexWorkspace(root), 'root-pkg')
    expect(order.filter((n) => n === 'ws-a').length).toBe(1)
  })

  it('throws when root package is unknown', () => {
    expect(() => resolveClosure(indexWorkspace(root), 'nope')).toThrow(/not found/)
  })

  it('throws when a workspace spec points outside the index', () => {
    const index = indexWorkspace(root)
    index.get('root-pkg').manifest.dependencies = { ghost: 'workspace:*' }
    expect(() => resolveClosure(index, 'root-pkg')).toThrow(/ghost/)
  })
})

// --- projection ----------------------------------------------------------------

describe('projectPackageFiles', () => {
  it('projects package.json + tsconfig + src/** only', () => {
    const files = projectPackageFiles(join(root, 'packages/root-pkg')).map((f) => f.replace(/\\/g, '/').split('/').pop())
    expect(files.sort()).toEqual(['index.ts', 'package.json', 'tsconfig.json'])
  })
})

// --- lock computation / idempotency ----------------------------------------------

describe('computeLock (idempotent projection)', () => {
  it('produces byte-identical output on repeated runs regardless of mtimes', () => {
    const a = JSON.stringify(computeLock(root, 'deadbeef', 'root-pkg'))
    // bump mtimes to prove content-only determinism
    const f = join(root, 'packages/root-pkg/src/index.ts')
    utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000))
    const b = JSON.stringify(computeLock(root, 'deadbeef', 'root-pkg'))
    expect(b).toBe(a)
  })

  it('records pinned SHA, closure packages and sha256 per vendored file', () => {
    const lock = computeLock(root, 'deadbeef', 'root-pkg')
    expect(lock.pinnedSha).toBe('deadbeef')
    expect(lock.packages.map((p) => p.name).sort()).toEqual(['root-pkg', 'ws-a', 'ws-b', 'ws-c'])
    const lib = lock.vendoredFiles.find((f) => f.path === 'packages/ws-a/src/lib.ts')
    expect(lib.sha256).toBe(sha256(join(root, 'packages/ws-a/src/lib.ts')))
    expect(lib.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(lock.vendoredFiles.some((f) => f.path.includes('ws-dev'))).toBe(false)
    expect(lock.vendoredFiles.some((f) => f.path.endsWith('.test.ts'))).toBe(false)
  })
})

// --- integrity verification -------------------------------------------------------

describe('verifyLock', () => {
  it('passes on an untouched checkout', () => {
    const lock = computeLock(root, 'deadbeef', 'root-pkg')
    const report = verifyLock(lock, root, "root-pkg")
    expect(report.ok).toBe(true)
    expect(report.problems).toEqual([])
    expect(report.checked).toBe(lock.vendoredFiles.length)
  })

  it('fails with sha256 mismatch when a file is tampered', () => {
    const lock = computeLock(root, 'deadbeef', 'root-pkg')
    const target = join(root, 'packages/ws-a/src/lib.ts')
    const original = 'export const a = 1\n'
    writeFileSync(target, 'export const a = 2 // tampered\n')
    try {
      const report = verifyLock(lock, root, "root-pkg")
      expect(report.ok).toBe(false)
      expect(report.problems.some((p) => p.includes('sha256 mismatch') && p.includes('ws-a/src/lib.ts'))).toBe(true)
    } finally {
      writeFileSync(target, original)
    }
  })

  it('fails on missing and untracked files', () => {
    const lock = computeLock(root, 'deadbeef', 'root-pkg')
    const extra = join(root, 'packages/ws-b/src/new.ts')
    writeFileSync(extra, 'export {}\n')
    try {
      const report = verifyLock(lock, root, "root-pkg")
      expect(report.ok).toBe(false)
      expect(report.problems.some((p) => p.includes('untracked file') && p.includes('new.ts'))).toBe(true)
    } finally {
      rmSync(extra)
    }
    // deletion -> missing-from-checkout
    const b = join(root, 'packages/ws-b/src/b.ts')
    const backup = 'export {}\n'
    rmSync(b)
    try {
      const report = verifyLock(lock, root, "root-pkg")
      expect(report.ok).toBe(false)
      expect(report.problems.some((p) => p.includes('missing from upstream checkout') && p.includes('ws-b/src/b.ts'))).toBe(true)
    } finally {
      writeFileSync(b, backup)
    }
  })

  it('fails on closure membership drift', () => {
    const lock = computeLock(root, 'deadbeef', 'root-pkg')
    // simulate drift: drop a package + its files from the lock
    lock.packages = lock.packages.filter((p) => p.name !== 'ws-c')
    lock.vendoredFiles = lock.vendoredFiles.filter((f) => !f.path.includes('ws-c'))
    const report = verifyLock(lock, root, "root-pkg")
    expect(report.ok).toBe(false)
    expect(report.problems.some((p) => p.includes('closure membership drift'))).toBe(true)
    expect(report.problems.some((p) => p.includes('untracked file') && p.includes('ws-c'))).toBe(true)
  })
})
