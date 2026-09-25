// workbench/migration/faults-stub — 迁移注错缝,host 半身(任务 6.4,SC2
// 「失败重试」腿的注错开关)。
//
// Env-seam family precedent (session-channel-stub.ts): the e2e process is
// NOT the migration process, so the only injection point inside the Electron
// main is an env var the test sets at launch — `DSH_FORGE_MIGRATION_FAULTS`
// carries a CONTROL FILE PATH. The control file is re-read on EVERY
// startMigration (never snapshotted at boot): the SC2 retry journey writes a
// fault, watches the wholesale rollback land, then CLEARS the control and
// retries — a launch-time snapshot would make the retry either unfailable or
// unfixable. Unset / absent / malformed control → no faults (production
// bytes untouched; the seam defaults off in every shipped boot).
//
// Control shape (JSON, the pipeline's MigrationFaults subset):
//   { "failIngestAfterRows"?: number,   // 摄入第 N 行后抛错(「摄入中」失败)
//     "failArchiveForSlug"?: string|true } // 归档(任一/指定)feature 时抛错
//
// Field discipline: wrong-typed fields are dropped silently — a malformed
// control must never fault a run the test meant to succeed, and must never
// crash the kernel (an e2e stub file is untrusted input).

import { readFileSync } from 'node:fs'
import type { MigrationFaults } from './pipeline.ts'

/** Env name carrying the control-file path (unset/empty → seam off). */
export const MIGRATION_FAULTS_ENV = 'DSH_FORGE_MIGRATION_FAULTS'

/**
 * Read + validate ONE control file into a {@link MigrationFaults} (undefined =
 * no faults). Exported for the unit lane; e2e legs go through the env
 * resolver below.
 */
export function readMigrationFaultsFile(controlPath: string): MigrationFaults | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(controlPath, 'utf8'))
  } catch {
    return undefined // absent / unreadable / malformed → seam inert
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined

  const source = parsed as Record<string, unknown>
  const faults: MigrationFaults = {}
  const rows = source.failIngestAfterRows
  if (typeof rows === 'number' && Number.isInteger(rows) && rows >= 0) faults.failIngestAfterRows = rows
  const slug = source.failArchiveForSlug
  if (slug === true || (typeof slug === 'string' && slug !== '')) faults.failArchiveForSlug = slug
  return faults.failIngestAfterRows === undefined && faults.failArchiveForSlug === undefined
    ? undefined
    : faults
}

/**
 * The env-bound resolver (the shape `MigrationPipelineDeps.faults` accepts as
 * a per-run function): resolves the control path ONCE from the env bag, then
 * re-reads that file on every call. Returns undefined whenever the seam is
 * off or the control yields nothing.
 */
export function createMigrationFaultsResolver(
  env: Record<string, string | undefined> = process.env,
): () => MigrationFaults | undefined {
  const controlPath = env[MIGRATION_FAULTS_ENV]?.trim()
  if (controlPath === undefined || controlPath === '') return () => undefined
  return () => {
    try {
      return readMigrationFaultsFile(controlPath)
    } catch {
      return undefined // unreadable beyond malformed → inert, never fatal
    }
  }
}
