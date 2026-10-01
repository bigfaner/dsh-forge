// tests/e2e/stubs/projection-faults — 投影通道注错缝,test 半身(任务 3.7,
// SC3 降级腿).
//
// The migration-faults stub family grows its projection member: this half
// owns a control file the HOST half re-reads on every relay-presence probe
// (apps/desktop/src/main/workbench/projection/faults-stub.ts, env seam
// DSH_FORGE_PROJECTION_FAULTS). The degrade/recover journey is file-driven
// end to end: write {channel:'unavailable'} → the projection push channel is
// down (registration degrades to ERR_PROJECTION_CHANNEL_UNAVAILABLE with the
// plan preserved) → clear() → the next [重试投影] re-pushes against a live
// channel and converges.
//
// Repository hygiene: the control file lives in the journey-owned stub dir
// (caller's temp root); the host child only ever READS it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The host half's env name (kept in lockstep with projection/faults-stub.ts). */
export const PROJECTION_FAULTS_ENV = 'DSH_FORGE_PROJECTION_FAULTS'

const CONTROL_FILE = 'projection-fault-control.json'

/** The projection channel fault stub (write/clear the control the host re-reads). */
export interface ProjectionFaultStub {
  readonly dir: string
  /** The env pair riding into the Electron launch env. */
  readonly env: { readonly DSH_FORGE_PROJECTION_FAULTS: string }
  /** Drop the projection push channel (presence probe answers absent). */
  failChannel(): void
  /** Restore the channel (the recovery leg — the next probe sees it live). */
  clear(): void
  /** The control content as the host currently resolves it (debug face). */
  read(): unknown
}

/** Create the projection fault stub home inside the journey stub dir. */
export function createProjectionFaultStub(dir: string): ProjectionFaultStub {
  mkdirSync(dir, { recursive: true })
  const controlPath = join(dir, CONTROL_FILE)
  const write = (control: Record<string, unknown>): void => {
    writeFileSync(controlPath, `${JSON.stringify(control, null, 2)}\n`)
  }
  write({}) // boot leg starts channel-live; the journey faults it mid-run
  return {
    dir,
    env: { [PROJECTION_FAULTS_ENV]: controlPath },
    failChannel: () => { write({ channel: 'unavailable' }) },
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
