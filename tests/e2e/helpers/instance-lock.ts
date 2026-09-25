// tests/e2e/helpers/instance-lock — 单实例锁纪律(任务 6.2 base;M1/M2 教训).
//
// M1 lesson (Hard Rule): an externally-held single-instance lock poisons a
// whole e2e run into ERR_SINGLE_INSTANCE — every leg MUST probe the machine
// for ACTIVE dsh-forge instances before launching and fail fast with the
// conflicting pids spelled out. The probe enumerates the OS process table
// and matches every launch form of the app:
//   ① the repo-run Electron main (any checkout/worktree: dev shells and
//     other e2e lanes) — command line carrying apps/<sep>desktop/<sep>dist/
//     <sep>main.cjs;
//   ② a packaged install — command line executing a dsh-forge*.exe;
//   ③ a live HOST CHILD of any checkout (the strongest signal in practice):
//     the vendored desktop host pins a FIXED port (19387) for its webserver
//     plugin, so ANY concurrently-running dsh-forge host — typically a dev
//     instance whose Electron parent is just `electron.exe .` (marker ①
//     blind) — makes every e2e launch die in crash-recovery with
//     EADDRINUSE, which surfaces far away as 连接已中断 / Desktop Host
//     unavailable. Matching the host-child command shape
//     (desktop-host-vendor/<sep>vendored/<sep>apps/<sep>desktop-host)
//     catches the port holder directly, whatever launched it.
// The isolated-userData seam (DSH_FORGE_USER_DATA) makes lock CONTENTION
// structurally impossible for our own launches; the probe guards the
// remaining faces (dev instances on the real userData, the fixed host port,
// and the M1 failure mode when a leg forgets the seam).

import { execSync } from 'node:child_process'

/** One process-table row (the probe's world model). */
export interface ProcessRow {
  readonly pid: number
  readonly command: string
}

/** The repo-run Electron main marker (both path-separator forms). */
export const REPO_MAIN_MARKER = /apps[\\/]desktop[\\/]dist[\\/]main\.cjs/i
/** The packaged-install marker (an executing dsh-forge*.exe). */
export const PACKAGED_EXE_MARKER = /(?:^|[\\/])dsh-forge(?:[-.][\w.-]+)?\.exe/i
/** A live vendored host child of ANY checkout — the fixed-port (19387) holder. */
export const HOST_CHILD_MARKER = /desktop-host-vendor[\\/]vendored[\\/]apps[\\/]desktop-host(?:[\\/ "]|$)/i

/** Does one process-table row look like a live dsh-forge app instance? */
export function isDshForgeInstance(row: ProcessRow): boolean {
  return REPO_MAIN_MARKER.test(row.command) || PACKAGED_EXE_MARKER.test(row.command) || HOST_CHILD_MARKER.test(row.command)
}

/** Enumerate the OS process table (pid + command line). */
export function listProcessRows(): ProcessRow[] {
  if (process.platform === 'win32') {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf8', timeout: 30_000 },
    )
    const parsed = JSON.parse(out.trim() === '' ? '[]' : out.trim()) as
      { ProcessId: number; CommandLine: string | null } | Array<{ ProcessId: number; CommandLine: string | null }>
    return (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({ pid: Number(row.ProcessId), command: row.CommandLine ?? '' }))
  }
  const out = execSync('ps -eo pid=,command=', { encoding: 'utf8', timeout: 30_000 })
  const rows: ProcessRow[] = []
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match !== null) rows.push({ pid: Number(match[1]), command: match[2] ?? '' })
  }
  return rows
}

/** Active dsh-forge instances on this machine (probe over given rows). */
export function findActiveDshForgeInstances(rows: readonly ProcessRow[] = listProcessRows(), excludePids: ReadonlySet<number> = new Set()): ProcessRow[] {
  return rows.filter(row => !excludePids.has(row.pid) && isDshForgeInstance(row))
}

/**
 * The Hard-Rule gate: fail fast when any active dsh-forge instance holds the
 * machine (M1 教训 — external lock holders turn whole runs into
 * ERR_SINGLE_INSTANCE). Every e2e leg calls this BEFORE its first launch.
 */
export function assertNoActiveDshForgeInstances(options?: {
  readonly rows?: readonly ProcessRow[]
  readonly excludePids?: ReadonlySet<number>
}): void {
  const conflicts = findActiveDshForgeInstances(options?.rows, options?.excludePids)
  if (conflicts.length === 0) return
  const listing = conflicts
    .map(row => `  pid ${String(row.pid)}: ${row.command.slice(0, 160)}`)
    .join('\n')
  throw new Error(
    `active dsh-forge instance(s) detected — close them before running e2e (single-instance lock + the host's fixed port 19387; M1 lesson):\n${listing}`,
  )
}
