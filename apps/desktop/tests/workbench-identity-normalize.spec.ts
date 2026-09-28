// Task 1.2 — D11 normalization pipeline matrix (projects-identity/normalize).
//
// docs/decisions/project-storage-and-knowledge.md §5.5: pipeline =
// resolve → realpath.native (junction/symlink/subst/8.3, true casing) →
// strip \\?\ prefixes → forward slashes → win32 upper-case fold (application
// single source, never SQLite NOCASE). Hard Rules: bare drive letters and
// relative paths are rejected at the entry (zero fs access); realpath
// failure degrades to the string-folded fallback + identityVerified=false
// and never throws. The v3 migration backfill (store/migrate.ts, task 1.1)
// imports the same single source — its semantics are pinned here too via
// backfillStoredIdentity.
//
// String-level cases (fold/prefix/UNC) are pure; realpath behaviors
// (junction/8.3/canonical casing) drive the real fs via tmpdir fixtures.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backfillStoredIdentity,
  canonicalizePath,
  normalizeEntry,
  toComparableKey,
  toDisplayPath,
} from '../src/main/workbench/projects-identity/normalize.ts'

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

function scratchDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-identity-${label}-`))
  scratches.push(dir)
  return dir
}

/** Windows 8.3 short name via cmd (null when generation is disabled / non-win). */
function shortNameFor(path: string): string | null {
  if (!IS_WIN) return null
  try {
    // windowsVerbatimArguments: cmd's parser must see the FOR syntax raw —
    // node's default MSVCRT-style quoting breaks it.
    const out = execFileSync('cmd.exe', ['/d', '/c', `for %I in ("${path}") do @echo %~sI`], {
      encoding: 'utf8',
      windowsVerbatimArguments: true,
    })
    const line = (out.trim().split(/\r?\n/).pop() ?? '').trim()
    return line === '' ? null : line
  } catch {
    return null
  }
}

describe('normalizeEntry — D11 入口拒绝(裸盘符/相对,零 fs 访问)', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(normalizeEntry('')).toMatchObject({ ok: false, reason: 'empty' })
    expect(normalizeEntry('   ')).toMatchObject({ ok: false, reason: 'empty' })
  })

  it.skipIf(!IS_WIN)('rejects bare drive letters and drive roots', () => {
    expect(normalizeEntry('Z:')).toMatchObject({ ok: false, reason: 'bare-drive-or-root' })
    expect(normalizeEntry('z:')).toMatchObject({ ok: false, reason: 'bare-drive-or-root' })
    expect(normalizeEntry('Z:\\')).toMatchObject({ ok: false, reason: 'bare-drive-or-root' })
    expect(normalizeEntry('C:/')).toMatchObject({ ok: false, reason: 'bare-drive-or-root' })
  })

  it.skipIf(!IS_WIN)('rejects the UNC share root but accepts a subpath under it', () => {
    expect(normalizeEntry('\\\\srv\\share')).toMatchObject({ ok: false, reason: 'bare-drive-or-root' })
    expect(normalizeEntry('\\\\srv\\share\\repo')).toMatchObject({ ok: true })
  })

  it.skipIf(IS_WIN)('rejects the POSIX root but accepts a subpath', () => {
    expect(normalizeEntry('/')).toMatchObject({ ok: false, reason: 'bare-drive-or-root' })
    expect(normalizeEntry('/usr/local')).toMatchObject({ ok: true })
  })

  it('rejects relative paths', () => {
    expect(normalizeEntry('foo')).toMatchObject({ ok: false, reason: 'relative' })
    expect(normalizeEntry('./x')).toMatchObject({ ok: false, reason: 'relative' })
    expect(normalizeEntry('..')).toMatchObject({ ok: false, reason: 'relative' })
    expect(normalizeEntry('a/b/c')).toMatchObject({ ok: false, reason: 'relative' })
    expect(normalizeEntry('~')).toMatchObject({ ok: false, reason: 'relative' })
  })

  it.skipIf(!IS_WIN)('accepts an absolute path and resolves it deterministically', () => {
    const result = normalizeEntry('C:\\Users\\proj\\')
    expect(result).toEqual({ ok: true, absolute: 'C:\\Users\\proj' })
  })
})

describe('toComparableKey / toDisplayPath — 剥前缀 → 正斜杠 → 平台折叠(应用层单源)', () => {
  it.skipIf(!IS_WIN)('win32 upper-case fold with forward slashes and trailing trim', () => {
    expect(toComparableKey('C:\\Foo\\Bar')).toBe('C:/FOO/BAR')
    expect(toComparableKey('C:/foo/bar/')).toBe('C:/FOO/BAR')
    expect(toComparableKey('c:\\a\\b')).toBe(toComparableKey('C:/A/B'))
  })

  it.skipIf(!IS_WIN)('preserves drive-root and POSIX-root forms', () => {
    expect(toComparableKey('C:\\')).toBe('C:/')
    expect(toComparableKey('C://')).toBe('C:/')
  })

  it.skipIf(!IS_WIN)('strips \\?\ device prefixes (local and UNC)', () => {
    expect(toComparableKey('\\\\?\\C:\\Foo')).toBe('C:/FOO')
    expect(toComparableKey('\\\\?\\UNC\\srv\\share\\repo')).toBe('//SRV/SHARE/REPO')
  })

  it.skipIf(!IS_WIN)('folds plain UNC input to the same key as the prefixed form', () => {
    expect(toComparableKey('\\\\srv\\share\\repo')).toBe('//SRV/SHARE/REPO')
  })

  it.skipIf(!IS_WIN)('toDisplayPath keeps true casing (no fold)', () => {
    expect(toDisplayPath('\\\\?\\C:\\Foo')).toBe('C:/Foo')
    expect(toDisplayPath('C:\\Foo\\')).toBe('C:/Foo')
    expect(toDisplayPath('c:\\foo')).toBe('c:/foo')
  })

  it.skipIf(IS_WIN)('posix keys pass through unchanged', () => {
    expect(toComparableKey('/srv/repo')).toBe('/srv/repo')
    expect(toComparableKey('/srv/repo/')).toBe('/srv/repo')
    expect(toComparableKey('/')).toBe('/')
  })
})

describe('canonicalizePath — realpath.native 管线(真实 fs fixture)', () => {
  it('canonicalizes a real directory with true casing and a folded key', () => {
    const root = scratchDir('canon')
    const project = join(root, 'AlphaProject')
    mkdirSync(project)
    const canonical = canonicalizePath(project)
    expect(canonical.identityVerified).toBe(true)
    expect(canonical.canonicalPath).toBe(realpathSync.native(project).replaceAll('\\', '/'))
    expect(canonical.pathKey).toBe(toComparableKey(realpathSync.native(project)))
  })

  it.skipIf(!IS_WIN)('unwraps a junction to the target canonical form', () => {
    const root = scratchDir('junction')
    const target = join(root, 'RealTarget')
    mkdirSync(target)
    const link = join(root, 'LinkToTarget')
    symlinkSync(target, link, 'junction')
    const viaJunction = canonicalizePath(link)
    const viaTarget = canonicalizePath(target)
    expect(viaJunction.canonicalPath).toBe(viaTarget.canonicalPath)
    expect(viaJunction.pathKey).toBe(viaTarget.pathKey)
    expect(viaJunction.identityVerified).toBe(true)
  })

  it.skipIf(!IS_WIN)('resolves 8.3 short names back to the long canonical form', (ctx) => {
    const root = scratchDir('short')
    const long = join(root, 'VeryLongDirectoryName123456')
    mkdirSync(long)
    const short = shortNameFor(long)
    if (short === null || short.toLowerCase() === long.toLowerCase()) {
      ctx.skip(true, '8.3 name generation unavailable on this volume')
      return
    }
    const viaShort = canonicalizePath(short)
    const viaLong = canonicalizePath(long)
    expect(viaShort.canonicalPath).toBe(viaLong.canonicalPath)
    expect(viaShort.pathKey).toBe(viaLong.pathKey)
  })

  it('falls back to the string-folded key + identityVerified=false when realpath fails', () => {
    const root = scratchDir('fallback')
    const missing = join(root, 'definitely-missing-xyz')
    const canonical = canonicalizePath(missing)
    expect(canonical.canonicalPath).toBeNull()
    expect(canonical.identityVerified).toBe(false)
    expect(canonical.pathKey).toBe(toComparableKey(missing))
  })
})

describe('backfillStoredIdentity — v3 迁移回填单源收编(best-effort,never throws)', () => {
  it('returns the folded key + (dev,ino) + verified=1 for a live directory', () => {
    const root = scratchDir('backfill')
    const project = join(root, 'LiveRepo')
    mkdirSync(project)
    const backfill = backfillStoredIdentity(project)
    expect(backfill).toEqual({
      codeRootKey: toComparableKey(realpathSync.native(project)),
      identityDev: backfill.identityDev,
      identityIno: backfill.identityIno,
      identityVerified: 1,
    })
    expect(typeof backfill.identityDev).toBe('string')
    expect(typeof backfill.identityIno).toBe('string')
  })

  it('falls back to the string key + null physical identity + verified=0 on fs failure', () => {
    const root = scratchDir('backfill-miss')
    const missing = join(root, 'gone-project')
    expect(backfillStoredIdentity(missing)).toEqual({
      codeRootKey: toComparableKey(missing),
      identityDev: null,
      identityIno: null,
      identityVerified: 0,
    })
  })
})
