// reconcile 启动对账（plugin-project 1.10，design-key-flows §3 矩阵）：
// 逐行对账三对象——project_projects 实体行 / project_workspaces 关系行 / registry 行。
// 处置面：relink（ws_path 找回单向修引用）/ recreate（幂等重建再修引用）/ 孤儿降级保留
// （不自动清理——孤儿工作区只提示不删）。三层防御：单项降级 → 整体降级 → 记账失败吞掉，
// 永不抛断启动；全程异常经 emitDiag。
import { existsSync } from 'node:fs'
import type { ReconcileReport } from '@dsh-forge/lib-api/dto/project'
import type { DiagEventPayload } from '@dsh-forge/lib-diag'
import type { ProjectsRepo, WorkspacesRepo } from '../db/repositories/index.js'
import { diag } from './errors.js'
import type { ProjectRegistryPort } from './registry-adapter.js'
import type { WorkspaceRow } from '../db/row-types.js'

type DiagPayload = Omit<DiagEventPayload, 'process'>

export interface ReconcileDeps {
  readonly projects: ProjectsRepo
  readonly workspaces: WorkspacesRepo
  readonly registry: ProjectRegistryPort
  /** 盘上在场探测缝（缺省 = existsSync；测试注入桩） */
  readonly pathPresent?: (path: string) => boolean
  readonly onDiag?: ((payload: DiagPayload) => void) | undefined
}

const normKey = (p: string): string => p.replaceAll('/', '\\').toLowerCase()

/** 单行对账（关系行 × registry × 盘上）——抛错 = 单项降级（由逐项循环承接）。 */
async function reconcileRow(
  deps: ReconcileDeps,
  row: WorkspaceRow,
  projectTitle: string,
  report: ReconcileReport,
): Promise<void> {
  const { registry, workspaces } = deps
  const pathPresent = deps.pathPresent ?? ((p: string) => existsSync(p))
  if (row.memberRole === 'worktree') {
    // worktree 行半态：registry 缺席 → 行保留 degraded（禁删禁自动重挂）；盘上目录消失 →
    // 行保留 + warn（封存判定承接会话面，关系表不清理）
    const entry = await registry.get(row.workspaceId)
    if (entry === undefined) {
      diag(deps.onDiag, {
        level: 'info',
        event: 'project-reconcile-degraded',
        message: `worktree 行 registry 缺席——行保留 degraded（禁删禁自动重挂）：${row.wsPath}`,
        projectId: row.projectId,
        cwd: row.wsPath,
      })
      return
    }
    if (!pathPresent(row.wsPath)) {
      diag(deps.onDiag, {
        level: 'warn',
        event: 'project-reconcile-degraded',
        message: `worktree 行盘上目录消失——行保留不清理：${row.wsPath}`,
        projectId: row.projectId,
        cwd: row.wsPath,
      })
    }
    return
  }
  // main 行：registry 命中且 path 一致 → 通过
  const entry = await registry.get(row.workspaceId)
  if (entry !== undefined && entry.wsPath === row.wsPath) {
    if (!pathPresent(row.wsPath)) {
      diag(deps.onDiag, {
        level: 'warn',
        event: 'project-reconcile-degraded',
        message: `main 行 ws_path 目录消失——记账提示不删（孤儿工作区同语义）：${row.wsPath}`,
        projectId: row.projectId,
        cwd: row.wsPath,
      })
    }
    return
  }
  // workspace_id 悬空：ws_path 找回 → relink（UPDATE workspace_id，单向修应用侧）
  const found = await registry.resolveByPath(row.wsPath)
  if (found !== undefined) {
    if (row.id !== null) workspaces.updateWorkspaceRef(row.id, found.workspaceId)
    report.repaired.push({ projectId: row.projectId, workspaceId: found.workspaceId, action: 'relinked' })
    return
  }
  // 找不回 → recreate（registry.create 幂等重建）再修引用
  const recreated = await registry.create(row.wsPath, projectTitle)
  if (row.id !== null) workspaces.updateWorkspaceRef(row.id, recreated.workspaceId)
  report.repaired.push({ projectId: row.projectId, workspaceId: recreated.workspaceId, action: 'recreated' })
}

/**
 * 启动对账：两表全量（含归档）逐行 + registry 孤儿扫描；三层防御永不抛断启动。
 * 孤儿（registry 有实体而两表无行）只提示不删。
 */
export async function reconcileAtStartup(deps: ReconcileDeps): Promise<ReconcileReport> {
  const report: ReconcileReport = { repaired: [], orphans: [] }
  try {
    const known = new Set<string>()
    for (const project of deps.projects.list({ includeArchived: true })) {
      for (const row of deps.workspaces.listByProject(project.id)) {
        known.add(normKey(row.wsPath))
        try {
          await reconcileRow(deps, row, project.title, report)
        } catch (cause) {
          // 单项降级：该行放弃，其余行继续
          diag(deps.onDiag, {
            level: 'warn',
            event: 'project-reconcile-item-degraded',
            message: `对账单项降级（${row.memberRole} ${row.wsPath}）：${String(cause)}`,
            projectId: project.id,
          })
        }
      }
    }
    // registry 有实体而两表无行 → 孤儿工作区只提示不删
    for (const entry of await deps.registry.list()) {
      if (!known.has(normKey(entry.wsPath))) {
        report.orphans.push({ workspaceId: entry.workspaceId, wsPath: entry.wsPath })
      }
    }
  } catch (cause) {
    // 整体降级：对账失败不抛断启动
    diag(deps.onDiag, {
      level: 'error',
      event: 'project-reconcile-degraded',
      message: `启动对账整体降级（记账留痕，启动继续）：${String(cause)}`,
    })
  }
  return report
}
