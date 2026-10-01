// workbench/projects-identity/detect — C7 evidence detection + DetectReport
// assembly (task 1.2). Produces Interface 1's DetectReport for the 1.3
// probeProjectPath verb and the C7 confirmation card.
//
// Evidence semantics (D1 + §5.4 侦测实现纪律 + tech-design §Security T4):
//   gitRoot      — top-level `<root>/.git` fixed-prefix bounded probe only
//                  (a directory OR a worktree FILE both count); no glob, no
//                  walking up (node_modules/vendor false hits), never reads
//                  file contents (OneDrive hydration).
//   forgeTreeHit — ONE readdir of `<root>/docs/features` + bounded
//                  manifest.md existence checks on direct directory entries;
//                  a bare docs/ without forge structure does NOT count (D1).
//   childRepos   — direct subdirectories carrying `.git`; the chips list is
//                  emitted only when ≥2 (parent-dir mis-pick signal, §5.4).
//
// Hard Rules: fixed-prefix bounded probing only (no glob, no content reads);
// bare drive / relative inputs are rejected at the normalization entry and
// never touch the fs; everything runs in the main process over paths passed
// through the existing secure IPC channel (no shell surface). Path facts
// (exists/isDir/readable) degrade quietly — a network drive that answers
// stat but fails realpath still reports identity from stat with
// identityVerified=false (normalize.ts fallback), never throwing.

import { accessSync, constants, readdirSync, statSync } from 'node:fs'
import { canonicalizePath, normalizeEntry, toDisplayPath } from './normalize.ts'
import { matchProjectIdentity, type RegisteredProjectIdentity } from './identity-match.ts'

/** Fixed probe vocabulary (T4: 固定前缀,禁 glob). */
const DOT_GIT = '.git'
const FEATURES_DIR = 'docs/features'
const MANIFEST_FILE = 'manifest.md'

/**
 * Bounded-probe caps: at most 16 feature entries probed for a manifest, at
 * most 256 direct children probed for `.git`. Both caps keep a pathological
 * directory from turning detection into a scan; every probe is a fixed
 * one-level prefix stat (no glob, no content read).
 */
const FORGE_TREE_ENTRY_PROBE_LIMIT = 16
const CHILD_ENTRY_PROBE_LIMIT = 256

/** Interface 1 DetectReport (verbatim field set). */
export interface DetectReport {
  readonly input: string
  /** realpath.native canonical; null when realpath failed (string fallback via pathKey). */
  readonly canonicalPath: string | null
  /** win32-folded comparison key; null only when the entry itself was rejected. */
  readonly pathKey: string | null
  readonly identity: { readonly dev: string; readonly ino: string } | null
  readonly exists: boolean
  readonly isDir: boolean
  readonly readable: boolean
  /** pathKey or (dev,ino) hit → fast lane { projectId, displayName }. */
  readonly registered: { readonly projectId: string; readonly displayName: string } | null
  /** Set when the probed root itself carries a top-level `.git`. */
  readonly gitRoot: string | null
  /** `<root>/docs/features` + direct manifest.md existence (D1 tree signal). */
  readonly forgeTreeHit: boolean
  /** Direct child repos; chips only when ≥2. */
  readonly childRepos: ReadonlyArray<{ readonly name: string; readonly path: string }>
}

/** Entry-rejected report: zero fs facts, null identity columns. */
function rejectedReport(input: string): DetectReport {
  return {
    input,
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
  }
}

/** Fixed-prefix existence probe (stat follows links; both dir and file count). */
function pathExists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

/** gitRoot: only the probed root's own top-level `.git` (有界,禁上溯). */
function detectGitRoot(base: string): string | null {
  return pathExists(`${base}/${DOT_GIT}`) ? base : null
}

/** forgeTreeHit: one readdir + bounded manifest.md existence per feature dir. */
function detectForgeTreeHit(base: string): boolean {
  const featuresDir = `${base}/${FEATURES_DIR}`
  let entries
  try {
    entries = readdirSync(featuresDir, { withFileTypes: true })
  } catch {
    return false
  }
  const cap = Math.min(entries.length, FORGE_TREE_ENTRY_PROBE_LIMIT)
  for (let index = 0; index < cap; index += 1) {
    const entry = entries[index]
    // Directory junctions/symlinks to feature dirs count as directories; a
    // plain file entry (stray.md) is skipped without a wasted stat.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (pathExists(`${featuresDir}/${entry.name}/${MANIFEST_FILE}`)) return true
  }
  return false
}

/** childRepos: direct children carrying `.git`; chips list only when ≥2. */
function detectChildRepos(base: string): Array<{ name: string; path: string }> {
  let entries
  try {
    entries = readdirSync(base, { withFileTypes: true })
  } catch {
    return []
  }
  const cap = Math.min(entries.length, CHILD_ENTRY_PROBE_LIMIT)
  const hits: Array<{ name: string; path: string }> = []
  for (let index = 0; index < cap; index += 1) {
    const entry = entries[index]
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (pathExists(`${base}/${entry.name}/${DOT_GIT}`)) {
      hits.push({ name: entry.name, path: `${base}/${entry.name}` })
    }
  }
  return hits.length >= 2 ? hits : []
}

/**
 * Interface 1 probeProjectPath core: normalize → stat facts → three-tier
 * registered fast lane → evidence detection. Never throws for path-level
 * failures (offline drives, missing paths, rejected entries degrade into the
 * report shape); the `registered` list comes read-only from the projects
 * table v3 identity columns — this domain does not write the database.
 */
export function probeProjectPath(input: { readonly path: string }, registered: readonly RegisteredProjectIdentity[]): DetectReport {
  const entry = normalizeEntry(input.path)
  if (!entry.ok) return rejectedReport(input.path)

  const canonical = canonicalizePath(entry.absolute)

  // Path facts from one stat of the resolved input (follows junctions, so
  // the identity is the physical one even in fallback mode).
  let exists = false
  let isDir = false
  let readable = false
  let identity: { dev: string; ino: string } | null = null
  try {
    const stats = statSync(entry.absolute)
    exists = true
    isDir = stats.isDirectory()
    identity = { dev: String(stats.dev), ino: String(stats.ino) }
    if (isDir) {
      try {
        accessSync(entry.absolute, constants.R_OK)
        readable = true
      } catch {
        readable = false
      }
    }
  } catch {
    exists = false
  }

  const match = matchProjectIdentity(
    { canonicalPath: canonical.canonicalPath, pathKey: canonical.pathKey, identity, identityVerified: canonical.identityVerified },
    registered,
  )

  // Evidence probing only for directories (bounded fixed prefixes; a
  // non-directory has no top-level .git / docs tree to probe).
  const base = canonical.canonicalPath ?? toDisplayPath(entry.absolute)
  const gitRoot = isDir ? detectGitRoot(base) : null
  const forgeTreeHit = isDir && detectForgeTreeHit(base)
  const childRepos = isDir ? detectChildRepos(base) : []

  return {
    input: input.path,
    canonicalPath: canonical.canonicalPath,
    pathKey: canonical.pathKey,
    identity,
    exists,
    isDir,
    readable,
    registered: match.matched ? { projectId: match.project.projectId, displayName: match.project.displayName } : null,
    gitRoot,
    forgeTreeHit,
    childRepos,
  }
}
