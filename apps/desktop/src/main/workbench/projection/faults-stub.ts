// workbench/projection/faults-stub — 投影通道注错缝,host 半身(任务 3.7,
// SC3 降级腿「投影通道故障注入」的注错开关)。
//
// Env-seam family precedent (migration/faults-stub.ts): the e2e process is
// NOT the Electron main process, so the only injection point inside the main
// process is an env var the test sets at launch —
// `DSH_FORGE_PROJECTION_FAULTS` carries a CONTROL FILE PATH. The control file
// is re-read on EVERY presence probe (never snapshotted at boot): the SC3
// degrade journey writes the fault, watches registration degrade to
// ERR_PROJECTION_CHANNEL_UNAVAILABLE (plan preserved), then CLEARS the
// control and clicks [重试投影] — a launch-time snapshot would make the
// channel either unfailable or unrecoverable.
//
// 注错面 = 内核的 relay 在场探测(3.2 pushPlan 的通道可用性判定,生产装配
// = index.ts 的事件订阅登记):`channel: 'unavailable'` 使探测恒假 —— 投影
// push 不投递 → 重试一次后 degraded(期望在库,禁静默丢弃)。产品降级逻辑
// (状态机/错误映射/plan 保留)零改动;未设置/缺席/畸形控制 → 生产行为不变
// (the seam defaults off in every shipped boot)。
//
// Field discipline: wrong-typed fields are dropped silently — a malformed
// control must never fault a run the test meant to succeed, and must never
// crash the kernel (an e2e stub file is untrusted input).

import { readFileSync } from 'node:fs'

/** Env name carrying the control-file path (unset/empty → seam off). */
export const PROJECTION_FAULTS_ENV = 'DSH_FORGE_PROJECTION_FAULTS'

/** The fault vocabulary the presence probe understands (3.7: channel down). */
export interface ProjectionFaults {
  /** 投影通道不可用:relayPresence 探测恒假(push → 重试一次 → degraded)。 */
  readonly channel?: 'unavailable'
}

/**
 * Read + validate ONE control file into a {@link ProjectionFaults}
 * (undefined = no faults). Exported for the unit lane; e2e legs go through
 * the env resolver below.
 */
export function readProjectionFaultsFile(controlPath: string): ProjectionFaults | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(controlPath, 'utf8'))
  } catch {
    return undefined // absent / unreadable / malformed → seam inert
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined

  const source = parsed as Record<string, unknown>
  const faults: ProjectionFaults = {}
  if (source.channel === 'unavailable') faults.channel = 'unavailable'
  return faults.channel === undefined ? undefined : faults
}

/**
 * The env-bound resolver: resolves the control path ONCE from the env bag,
 * then re-reads that file on every call. Returns undefined whenever the seam
 * is off or the control yields nothing.
 */
export function createProjectionFaultsResolver(
  env: Record<string, string | undefined> = process.env,
): () => ProjectionFaults | undefined {
  const controlPath = env[PROJECTION_FAULTS_ENV]?.trim()
  if (controlPath === undefined || controlPath === '') return () => undefined
  return () => {
    try {
      return readProjectionFaultsFile(controlPath)
    } catch {
      return undefined // unreadable beyond malformed → inert, never fatal
    }
  }
}
