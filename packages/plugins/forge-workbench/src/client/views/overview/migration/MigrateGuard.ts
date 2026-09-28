/**
 * The UF3 migration ENTRY guard (task 1.6, ui-design 在跑编排守卫): while a
 * project has running orchestrations (待启动/执行中/待审批 — kernel-side the
 * `dispatch.ended_at IS NULL` count, Interface 4 ①), its 「迁移」 entry
 * renders disabled with the guard tooltip; when the orchestrations settle,
 * the event push re-reads the guard and the entry recovers BY ITSELF — the
 * ≤500ms main-side event batching plus the immediate re-read keeps the
 * recovery well inside the ui-design ≤5s 数据时效 budget, with no manual
 * refresh path anywhere.
 *
 * Scope discipline (ui-design 裁决, 1.7 Hard Rule): the guard exists ONLY on
 * the overview-card path — the register-wizard path never sets it (an
 * unmigrated project has no orchestration surface to race). `enabled: false`
 * therefore short-circuits to never-blocked and reads nothing.
 *
 * The face seam is {@link MigrationFace} (contract.ts): `loadGuard` carries
 * the running-orchestration judgment (the real dispatch verb face lands with
 * the 3.x dispatch domain; the build stage runs the mock twin), and
 * `subscribeEvents` is the SAME single-subscriber channel the progress dialog
 * step-rows ride — one subscription per face, no second push channel.
 *
 * Revalidation trigger: any pushed batch carrying at least one event for THIS
 * project (every current WorkbenchEvent type is project-scoped). The 3.x
 * `dispatch_updated` event will flow through the identical leg — the guard
 * recovers the day that vocabulary lands, without this module changing.
 */
import { useEffect, useState } from 'react'
import type { WorkbenchEvent } from '../../../ipc-types'
import type { MigrationFace } from '../../../contract'
import type { WorkbenchKey } from '../../../locale/en'

/** Inputs of {@link useMigrationGuard}. */
export interface UseMigrationGuardInput {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The guarded project. */
  readonly projectId: string
  /** The migration family's face (loadGuard + subscribeEvents legs). */
  readonly face: MigrationFace
  /**
   * False on the wizard path (its 判定 never guards) — no reads, no
   * subscription, never blocked.
   */
  readonly enabled: boolean
}

/** The guard's projection for the entry control. */
export interface MigrationGuardView {
  /** True while running orchestrations block migration (the entry's disabled). */
  readonly blocked: boolean
  /** The guard tooltip copy while blocked ('' otherwise — no tooltip). */
  readonly tooltip: string
}

/**
 * The entry-guard hook. Stale-read safe: every re-read carries a token and
 * only the latest token's answer lands (an older load resolving after a newer
 * event-triggered one cannot resurrect a lifted guard).
 */
export function useMigrationGuard(input: UseMigrationGuardInput): MigrationGuardView {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!input.enabled) return
    let token = 0
    let unsubscribed = false
    const read = (): void => {
      const mine = ++token
      void input.face.loadGuard(input.projectId).then((snapshot) => {
        if (unsubscribed || mine !== token) return
        setBlocked(snapshot.blocked)
      }).catch(() => {
        // A failed guard read never blocks the entry (the kernel's own
        // ERR_MIGRATION_GUARD rejection remains the hard gate) and never
        // unblocks one either — keep the last known projection.
      })
    }
    read()
    const unsubscribe = input.face.subscribeEvents((events) => {
      if (!events.some(event => isProjectScoped(event, input.projectId))) return
      read()
    })
    return () => {
      unsubscribed = true
      unsubscribe()
    }
  }, [input.enabled, input.face, input.projectId])

  return {
    blocked: input.enabled && blocked,
    tooltip: input.enabled && blocked ? input.t('migration.entry.guardTooltip') : '',
  }
}

/** Does the event belong to the project? (project_list_changed is registry-scoped — no projectId.) */
function isProjectScoped(event: WorkbenchEvent, projectId: string): boolean {
  return 'projectId' in event && event.projectId === projectId
}
