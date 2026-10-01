/**
 * The 项目概览 tab's PURE derivation model (M4 task 2.3, layout §4.3/§4.4):
 * the 概要信息区's three derivations + the tasks pane's 执行中 grouping —
 * pure functions over the Interface 1 DTOs, no React, no IPC, fully fake-able
 * (the lineage/derive.ts discipline: the unit matrix lives beside the model,
 * the components consume it and never re-derive).
 *
 *   workspaceRootOf     — 工作区 = the code root's PARENT directory. The v3
 *                         Project DTO carries only `codeRoot` (任务 1.3), so
 *                         the workspace row is a DISPLAY derivation over the
 *                         path string, never persisted, never probed.
 *   deriveActiveFeature — 活跃 feature = the most recently updated IN-PROGRESS
 *                         feature; a project with none falls back to the most
 *                         recently updated row (a PRD-stage project still
 *                         shows a live feature line, matching the wireframe's
 *                         活跃 m4 · 12/41 shape).
 *   countRunningSessions— 运行中会话数 = DISTINCT session ids carrying an
 *                         ACTIVE link (several tasks may share one session —
 *                         the lineage granularity note; sessions, not tasks).
 *   activeLinkOf        — the first ACTIVE link (新→旧 kernel order), the ⟞
 *                         直达会话 jump's target.
 *   deriveExecutingTasks— the 执行中分组 rows: BIZ-workbench-008's exact
 *                         matrix (status × active link) via the ONE judgment
 *                         authority (lineage/derive.judgeExecuting).
 */
import type { FeatureSummary, SessionLink } from '../../ipc-types'
import type { LineageTaskRef } from '../../lineage'
import { judgeExecuting } from '../../lineage/derive'

/**
 * One task row the overview reads (the C6 metadata source shape verbatim —
 * the SAME `{ task, links }` twin the metadata bar consumes, so one
 * bridge-side builder feeds both faces).
 */
export interface OverviewTaskSource {
  readonly task: LineageTaskRef
  readonly links: readonly SessionLink[]
}

/** 工作区 = codeRoot's parent directory ('' when the code root has none). */
export function workspaceRootOf(codeRoot: string): string {
  const trimmed = codeRoot.trim().replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut < 1) return ''
  const parent = trimmed.slice(0, cut)
  // "Z:\proj" → the drive root lost its separator with the last segment —
  // restore it so the workspace row still reads "Z:\".
  if (/:$/.test(parent)) return `${parent}${trimmed.slice(cut, cut + 1)}`
  return parent
}

/** 活跃 feature (the 概要信息区's status line + the tasks pane's header slug). */
export function deriveActiveFeature(
  features: readonly FeatureSummary[],
): FeatureSummary | undefined {
  if (features.length === 0) return undefined
  const inProgress = features.filter(feature => feature.status === 'in-progress')
  const pool = inProgress.length > 0 ? inProgress : features
  // Board order is the tie-break (a strict > keeps the earlier row) — the
  // pick is deterministic for equal timestamps.
  return pool.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
}

/** 运行中会话数: distinct ACTIVE-link session ids across the project's tasks. */
export function countRunningSessions(sources: readonly OverviewTaskSource[]): number {
  const sessions = new Set<string>()
  for (const source of sources) {
    for (const link of source.links) {
      if (link.status === 'active') sessions.add(link.sessionId)
    }
  }
  return sessions.size
}

/** The first ACTIVE link (新→旧 kernel order) — the ⟞ 直达会话 target. */
export function activeLinkOf(links: readonly SessionLink[]): SessionLink | undefined {
  return links.find(link => link.status === 'active')
}

/**
 * The 执行中分组 rows (layout §4.4③): tasks whose status × linkage hits the
 * BIZ-workbench-008 executing cell — the SAME judgeExecuting the C5 dock and
 * the C6 bar read (one judgment authority, never a second copy).
 */
export function deriveExecutingTasks(
  sources: readonly OverviewTaskSource[],
): readonly OverviewTaskSource[] {
  return sources.filter(source => judgeExecuting(source.task.status, source.links).executing)
}

/** The task-row fields the panes read (a LineageTaskRef re-export for seats). */
export type OverviewTaskRef = LineageTaskRef
