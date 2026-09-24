// tests/e2e/stubs/migration-faults — 迁移注错缝,test 半身(任务 6.4,SC2
// 「失败重试」腿).
//
// The 6.2 stub-switch family grows its migration member: this half owns a
// control file the HOST half re-reads on every startMigration
// (apps/desktop/src/main/workbench/migration/faults-stub.ts, env seam
// DSH_FORGE_MIGRATION_FAULTS). The retry journey is file-driven end to end:
// write a fault → the run fails and rolls back wholesale → clear() → the
// retry (same dialog, same service) resolves no faults and succeeds.
//
// Repository hygiene: the control file lives in the journey-owned stub dir
// (caller's temp root); the host child only ever READS it.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The host half's env name (kept in lockstep with faults-stub.ts). */
export const MIGRATION_FAULTS_ENV = 'DSH_FORGE_MIGRATION_FAULTS'

const CONTROL_FILE = 'migration-fault-control.json'

/** The migration fault stub (write/clear the control the host re-reads). */
export interface MigrationFaultStub {
  readonly dir: string
  /** The env pair riding into the Electron launch env. */
  readonly env: { readonly DSH_FORGE_MIGRATION_FAULTS: string }
  /** Fail the archive rename of one feature (its index.json stays put). */
  failArchiveForSlug(slug: string): void
  /** Fail the archive rename of the FIRST feature encountered. */
  failArchiveAny(): void
  /** Fail the ingest after N rows (mid-transaction failure). */
  failIngestAfterRows(rows: number): void
  /** Clear every fault (the retry leg — next startMigration runs clean). */
  clear(): void
  /** The control content as the host currently resolves it (debug face). */
  read(): unknown
}

/** Create the migration fault stub home inside the journey stub dir. */
export function createMigrationFaultStub(dir: string): MigrationFaultStub {
  const controlPath = join(dir, CONTROL_FILE)
  const write = (control: Record<string, unknown>): void => {
    writeFileSync(controlPath, `${JSON.stringify(control, null, 2)}\n`)
  }
  return {
    dir,
    env: { [MIGRATION_FAULTS_ENV]: controlPath },
    failArchiveForSlug: (slug) => { write({ failArchiveForSlug: slug }) },
    failArchiveAny: () => { write({ failArchiveForSlug: true }) },
    failIngestAfterRows: (rows) => { write({ failIngestAfterRows: rows }) },
    clear: () => { write({}) },
    read: (): unknown => {
      try {
        return JSON.parse(readFileSync(controlPath, 'utf8')) as unknown
      } catch {
        return undefined
      }
    },
  }
}
