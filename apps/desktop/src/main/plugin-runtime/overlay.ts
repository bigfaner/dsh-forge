// plugin-runtime/overlay — the runtime enable/disable overlay (task 3.1,
// tech-design §Interface 4 / T5).
//
// `<userData>/plugin-runtime.json` is the ONLY writable plugin-state surface:
// the product manifest (apps/desktop/resources/plugin-bundles.json) is a
// build-time artifact and is never written at runtime (Hard Rule). The overlay
// schema is exactly `{ "disabled": string[] }` and structurally excludes
// mandatory names — only third-party bundles may appear in it.
//
// Read discipline (defense in depth, load-side layer 2): parse-time
// validation runs against the manifest vocabulary —
//   - structurally malformed files (bad JSON, non-object root, unknown keys,
//     missing/non-array `disabled`) are isolated (`<name>.corrupt-<ts>`, the
//     ERR_WORKBENCH_DB backup precedent) and rebuilt as an empty overlay;
//     startup is never blocked by a corrupt runtime file;
//   - schema-valid but violating entries (mandatory names / unknown names /
//     non-strings) are stripped in memory + logged ERR_PLUGIN_RUNTIME_STATE —
//     the manifest state wins for those rows.
//
// Write discipline (single write path): every overlay write in the shell goes
// through {@link writePluginRuntimeOverlay} — the setPluginEnabled verb is the
// only caller, and the guard has already rejected mandatory names before it.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { shellLog } from '../log.ts'

/** Structured log minimal face (test injection). */
export type PluginRuntimeLog = Pick<typeof shellLog, 'warn'>

/**
 * The manifest vocabulary the overlay validates against (structural type —
 * host-profile's strict entries and the IPC face's rows both satisfy it).
 */
export interface OverlayBundleRef {
  readonly name: string
  readonly mandatory: boolean
}

/** Overlay read result: the violation-stripped disabled set + what was cut. */
export interface PluginRuntimeOverlay {
  readonly disabled: ReadonlySet<string>
  /** Stripped entries (mandatory / unknown names / non-string items), for logs. */
  readonly violations: readonly string[]
}

/** Overlay-shape failure (isolate + rebuild path) — log code, never thrown. */
function malformed(log: PluginRuntimeLog, overlayPath: string, reason: string): PluginRuntimeOverlay {
  const isolated = isolateAndRebuildOverlay(overlayPath)
  log.warn({
    code: 'ERR_PLUGIN_RUNTIME_STATE',
    message: 'plugin runtime overlay is malformed — original isolated and an empty overlay rebuilt (startup continues)',
    data: { overlayPath, reason, isolated },
  })
  return { disabled: new Set(), violations: [] }
}

/**
 * Isolate the current overlay next to itself (`<name>.corrupt-<ts>`) and
 * rebuild an empty one in its place. Best-effort isolation: an unruly rename
 * degrades to replace-in-place so the rebuilt empty overlay always lands.
 * @returns the isolation path, or a short note when the original was replaced.
 */
function isolateAndRebuildOverlay(overlayPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const isolatedPath = `${overlayPath}.corrupt-${stamp}`
  if (existsSync(overlayPath)) {
    try {
      renameSync(overlayPath, isolatedPath)
    } catch {
      try {
        unlinkSync(overlayPath) // isolation failed — recover by replacement
      } catch { /* nothing to recover from */ }
    }
  }
  writePluginRuntimeOverlay(overlayPath, [])
  return existsSync(isolatedPath) ? isolatedPath : `${overlayPath} (replaced in place)`
}

/** The single overlay writer: `{ "disabled": string[] }`, sorted, parent dirs on demand. */
export function writePluginRuntimeOverlay(overlayPath: string, disabled: Iterable<string>): void {
  mkdirSync(dirname(overlayPath), { recursive: true })
  writeFileSync(overlayPath, `${JSON.stringify({ disabled: [...disabled].sort() }, null, 2)}\n`)
}

/**
 * Read the runtime overlay (defensive read). Missing file = empty overlay =
 * everything enabled; every malformed shape recovers to the same empty state
 * without throwing (a runtime file must never block startup); violating
 * entries are stripped so mandatory bundles stay loadable no matter what the
 * file claims (T5).
 */
export function readPluginRuntimeOverlay(
  overlayPath: string,
  bundles: readonly OverlayBundleRef[],
  log: PluginRuntimeLog = shellLog,
): PluginRuntimeOverlay {
  if (!existsSync(overlayPath)) return { disabled: new Set(), violations: [] }
  let raw: string
  try {
    raw = readFileSync(overlayPath, 'utf8')
  } catch (error) {
    return malformed(log, overlayPath, `unreadable: ${String(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return malformed(log, overlayPath, `not valid JSON: ${String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return malformed(log, overlayPath, 'root is not a JSON object')
  }
  for (const key of Object.keys(parsed)) {
    if (key !== 'disabled') return malformed(log, overlayPath, `unknown key ${JSON.stringify(key)} (schema is only "disabled")`)
  }
  const disabled = (parsed as { disabled?: unknown }).disabled
  if (!Array.isArray(disabled)) {
    return malformed(log, overlayPath, '"disabled" is missing or not an array')
  }
  const known = new Map(bundles.map(bundle => [bundle.name, bundle.mandatory]))
  const kept = new Set<string>()
  const violations: string[] = []
  for (const entry of disabled) {
    if (typeof entry !== 'string') {
      violations.push(String(entry))
      continue
    }
    const mandatory = known.get(entry)
    if (mandatory === undefined || mandatory) {
      violations.push(entry)
      continue
    }
    kept.add(entry)
  }
  if (violations.length > 0) {
    log.warn({
      code: 'ERR_PLUGIN_RUNTIME_STATE',
      message: 'plugin runtime overlay carried mandatory or unknown entries — stripped (manifest state wins)',
      data: { overlayPath, violations: [...violations] },
    })
  }
  return { disabled: kept, violations }
}
