// workbench/projects-identity/normalize — D11 path normalization pipeline
// (task 1.2): the application-layer single source of the platform folding
// comparison key (win32 upper-case fold — never SQLite NOCASE, which is
// ASCII-only and semantically wrong) and of canonicalization, shared by the
// C7 detection verb, the three-tier identity match, the v3 migration
// backfill and (via 1.3) registration/re-validation.
//
// Pipeline (docs/decisions/project-storage-and-knowledge.md §5.5):
//   resolve → realpath.native (unwraps junction/symlink/subst/8.3, restores
//   true casing) → strip \\?\ device prefixes → forward slashes → fold.
//
// Hard Rules (task 1.2):
//   - bare drive letters ('Z:') / filesystem roots and relative paths are
//     rejected at the normalization entry, before any fs access;
//   - realpath failure (network drive offline, path removed) degrades to the
//     string-folded fallback key + identityVerified=false — never throws to
//     the verb layer (UNC/网络盘降级路径).
//
// Single source note (1.1 record 收编): the v3 migration backfill shipped a
// local best-effort copy of this pipeline inside store/migrate.ts; since
// task 1.2 the canonical implementation lives here and migrate.ts imports
// it. This module is a pure fs/path leaf (no store/repos/registry imports),
// so the registry→repos→store layering direction is preserved.

import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, parse, resolve } from 'node:path'

/** Entry rejection reasons (Hard Rule: 裸盘符/相对路径入口即拒,零 fs 访问). */
export type PathEntryRejection = 'empty' | 'relative' | 'bare-drive-or-root'

export type NormalizeEntryResult =
  | { readonly ok: true; readonly absolute: string }
  | { readonly ok: false; readonly reason: PathEntryRejection; readonly message: string }

const BARE_DRIVE = /^[A-Za-z]:$/

/** True when `absolute` is a filesystem root form (drive root / UNC share root / POSIX root). */
function isRootForm(absolute: string): boolean {
  const root = parse(absolute).root
  return absolute === root || absolute === root.replace(/[\\/]+$/, '')
}

/**
 * Normalization entry: validate + resolve an input path without touching the
 * filesystem. Bare drive letters and relative paths are rejected outright
 * (D11 §5.5); everything else resolves to a deterministic absolute path for
 * the canonicalization pipeline.
 */
export function normalizeEntry(input: string): NormalizeEntryResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, reason: 'empty', message: 'path input is empty' }
  }
  const trimmed = input.trim()
  if (BARE_DRIVE.test(trimmed)) {
    return { ok: false, reason: 'bare-drive-or-root', message: `bare drive letter ${trimmed} is not a project code root` }
  }
  if (!isAbsolute(trimmed)) {
    return { ok: false, reason: 'relative', message: `relative path ${trimmed} is not a project code root` }
  }
  const absolute = resolve(trimmed)
  if (isRootForm(absolute)) {
    return { ok: false, reason: 'bare-drive-or-root', message: `filesystem root ${absolute} is not a project code root` }
  }
  return { ok: true, absolute }
}

/** Strip realpath.native device prefixes: `\\?\C:\…` → `C:\…`, `\\?\UNC\srv\…` → `//srv/…`. */
function stripDevicePrefix(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `//${path.slice(8)}`
  if (path.startsWith('\\\\?\\')) return path.slice(4)
  return path
}

function toForwardSlashes(path: string): string {
  return stripDevicePrefix(path).replaceAll('\\', '/')
}

/** Trim trailing slashes; drive/POSIX root forms collapse to their canonical single-slash form. */
function trimTrailingSlashes(slashed: string): string {
  const trimmed = slashed.replace(/\/+$/, '')
  if (trimmed === '') return '/'
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}/`
  return trimmed
}

/**
 * Display-canonical form of a path: device prefix stripped, forward slashes,
 * true casing preserved. This is what `projects.code_root` stores and what
 * the UI shows — it never participates in comparison (§5.5 tier 1).
 */
export function toDisplayPath(path: string): string {
  return trimTrailingSlashes(toForwardSlashes(path))
}

/**
 * Platform folding comparison key (§5.5 tier 2): strip device prefixes →
 * forward slashes → trim trailing → win32 upper-case fold. Byte-compatible
 * with the keys the v3 migration backfill already wrote (single source —
 * store/migrate.ts imports this since task 1.2).
 */
export function toComparableKey(path: string): string {
  const slashed = trimTrailingSlashes(toForwardSlashes(path))
  return process.platform === 'win32' ? slashed.toUpperCase() : slashed
}

/** Canonicalization outcome; `canonicalPath` is null when realpath failed. */
export interface CanonicalPathResult {
  /** realpath-native canonical (true casing, junction/8.3 unwrapped), forward slashes; null on failure. */
  readonly canonicalPath: string | null
  /** Folded key — string-folded fallback when realpath failed (never null here). */
  readonly pathKey: string
  /** False exactly when realpath.native failed (the key is then a string fallback). */
  readonly identityVerified: boolean
}

/**
 * Canonicalize an already-validated absolute path (normalizeEntry output):
 * realpath.native → display form + folded key. Failure (network drive
 * offline / removed path) degrades to the string-folded fallback +
 * identityVerified=false instead of throwing (UNC/网络盘 realpath 失败走
 * 降级路径,不得抛出到动词层).
 */
export function canonicalizePath(absolute: string): CanonicalPathResult {
  try {
    const real = realpathSync.native(absolute)
    return { canonicalPath: toDisplayPath(real), pathKey: toComparableKey(real), identityVerified: true }
  } catch {
    return { canonicalPath: null, pathKey: toComparableKey(absolute), identityVerified: false }
  }
}

/** v3 migration backfill identity (projects.code_root_key / identity_* columns). */
export interface StoredIdentityBackfill {
  readonly codeRootKey: string
  readonly identityDev: string | null
  readonly identityIno: string | null
  readonly identityVerified: 0 | 1
}

/**
 * Best-effort stored-identity backfill for the v3 migration (never throws):
 * realpath.native + stat success → folded key + (dev,ino) + verified=1;
 * failure → string-folded key + null physical identity + verified=0 (does
 * not block the migration). Semantics are pinned by the 1.1 backfill cases
 * in workbench-store.spec.ts and the matrix in workbench-identity-normalize.
 */
export function backfillStoredIdentity(codeRoot: string): StoredIdentityBackfill {
  try {
    const real = realpathSync.native(codeRoot)
    const stats = statSync(real)
    return {
      codeRootKey: toComparableKey(real),
      identityDev: String(stats.dev),
      identityIno: String(stats.ino),
      identityVerified: 1,
    }
  } catch {
    return { codeRootKey: toComparableKey(codeRoot), identityDev: null, identityIno: null, identityVerified: 0 }
  }
}
