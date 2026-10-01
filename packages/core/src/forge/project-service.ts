// forge 域 projects 服务（tech-design §Interface 1 全五法 + §交互一/§交互三；定位：业务）。
// registerProject 四步补偿链（2.2）：
// ① registry.list() 按 canonical path 预检（命中=挂接既有，attachedToExisting=true，不登记补偿）
// ② registry.create(wsPath)（dsh 幂等）→ ③ 事务写 projects 行
// ④ ③失败且属本次新建 → registry.delete(workspaceId) 补偿（保目录保日志，幂等）；
//    挂接既有时后任一步失败均不删既有工作区（ownership 保护）。
// 查询面 + 启动对账（2.3）：listProjects（archived 态随行=过滤口径）/ getProject / updateProject
// （patch 仅 name/archived）/ reconcileAtStartup（失配找回、找不回幂等重建、孤儿只提示不删；
// 全程异常降级 app_key_logs 永不抛断启动）。SQLite 写仅经 db/ 句柄（单写路径）；
// registry 调用只依赖 dsh 官方 ctx.workspaceRegistry 面。
import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  Project,
  ProjectPatch,
  ProjectService,
  ProjectSummary,
  ReconcileRepair,
  ReconcileReport,
  RegisterProjectInput,
  RegisterResult,
} from '@dsh-forge/contracts'
import { withTransaction } from '../db/index.js'
import { CompensationError, ProjectWriteError, WorkspaceCreateError } from './errors.js'
import { recordKeyLog } from './key-logs.js'
import type { WorkspaceLike, WorkspaceRegistryPort } from './registry.js'

export interface ProjectServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** dsh 官方面（ctx.workspaceRegistry；G1 pin 4 幂等/get 语义见 ./registry.ts） */
  registry: WorkspaceRegistryPort
}

/** Interface 1 服务面（2.3 并齐 contracts ProjectService 全五法） */
export function createProjectService(deps: ProjectServiceDeps): ProjectService {
  return {
    async registerProject(input: RegisterProjectInput): Promise<RegisterResult> {
      return registerProject(deps, input)
    },
    async listProjects(): Promise<ProjectSummary[]> {
      return listProjects(deps)
    },
    async getProject(id: string): Promise<Project | null> {
      return getProject(deps, id)
    },
    async updateProject(id: string, patch: ProjectPatch): Promise<Project> {
      return updateProject(deps, id, patch)
    },
    async reconcileAtStartup(): Promise<ReconcileReport> {
      return reconcileAtStartup(deps)
    },
  }
}

/** forge 目录是否位于工作区外（ER PROJECTS：仓外=1/true，由路径关系自动推导） */
export function isForgeDirExternal(wsPath: string, forgeDir: string): boolean {
  const rel = relative(wsPath, forgeDir)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

async function registerProject(deps: ProjectServiceDeps, input: RegisterProjectInput): Promise<RegisterResult> {
  const { db, registry } = deps

  // ① 预检：list() 按 canonical path 匹配（输入契约为 canonical 化后路径；命中=挂接，不登记补偿）
  const existing = registry.list().find((ws) => ws.path === input.workspaceDir)
  const attachedToExisting = existing !== undefined

  let workspace: WorkspaceLike
  if (existing) {
    workspace = existing
  } else {
    // ② registry.create（dsh 幂等：同 canonical path 返回既有实体）——失败即注册中止，无补偿需要
    try {
      workspace = await registry.create(input.workspaceDir)
    } catch (cause) {
      throw new WorkspaceCreateError(input.workspaceDir, cause)
    }
  }

  // ③ 事务写 projects 行（ws_path 以 registry 返回的 canonical path 为准——非用户拼写原样）
  const projectId = randomUUID()
  const now = new Date().toISOString()
  try {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO projects (
           id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        projectId,
        workspace.id,
        workspace.path,
        input.name,
        input.forgeDir,
        isForgeDirExternal(workspace.path, input.forgeDir) ? 1 : 0,
        input.knowledgeDir,
        now,
        now,
      )
    })
  } catch (writeCause) {
    // ④ 补偿——仅「本次新建」（①未命中，②由本流程创建）才登记；流程窗口内取消同径（见 §交互一）
    if (attachedToExisting) {
      throw new ProjectWriteError({ workspaceId: workspace.id, wsPath: workspace.path }, writeCause)
    }
    try {
      // 幂等：未知 id 返回 false（工作区已被清理）亦视为补偿完成——dsh 侧零孤儿达成
      await registry.delete(workspace.id)
    } catch (deleteCause) {
      // 补偿失败：app_key_logs 单事件单条记账（scope=compensation，处置结果并入 data_json）
      // + 抛 typed ERR_COMPENSATION——孤儿交启动对账提示，不自动删（SC12）
      recordKeyLog(db, {
        level: 'error',
        scope: 'compensation',
        message: `registry.delete 补偿失败：工作区 ${workspace.path}（${workspace.id}）留存为孤儿——启动对账将提示，不自动删`,
        data: {
          workspaceId: workspace.id,
          wsPath: workspace.path,
          projectId,
          writeError: writeCause instanceof Error ? writeCause.message : String(writeCause),
          deleteError: deleteCause instanceof Error ? deleteCause.message : String(deleteCause),
          disposition: '补偿失败——孤儿工作区交由启动对账提示（不自动删）',
        },
      })
      throw new CompensationError({ workspaceId: workspace.id, wsPath: workspace.path, projectId }, writeCause, deleteCause)
    }
    throw new ProjectWriteError(
      {
        workspaceId: workspace.id,
        wsPath: workspace.path,
        compensated: { workspaceId: workspace.id, reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
      },
      writeCause,
    )
  }

  return { projectId, workspaceId: workspace.id, attachedToExisting }
}

// ── 查询面（Interface 1：list/get/update——archived 过滤口径随行，patch 仅 name/archived） ──

/** projects 行（snake_case 存储形状 → DTO 映射唯一落点） */
interface ProjectRow {
  id: string
  workspace_id: string
  ws_path: string
  name: string
  forge_dir: string
  forge_dir_external: number
  knowledge_dir: string
  archived: number
  created_at: string
  updated_at: string
}

const SELECT_PROJECT = `SELECT id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at FROM projects`

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    wsPath: row.ws_path,
    name: row.name,
    forgeDir: row.forge_dir,
    forgeDirExternal: row.forge_dir_external === 1,
    knowledgeDir: row.knowledge_dir,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getRow(deps: ProjectServiceDeps, id: string): ProjectRow | undefined {
  return deps.db.prepare<unknown[], ProjectRow>(`${SELECT_PROJECT} WHERE id = ?`).get(id)
}

function listProjects(deps: ProjectServiceDeps): ProjectSummary[] {
  const rows = deps.db.prepare<unknown[], ProjectRow>(`${SELECT_PROJECT} ORDER BY created_at, id`).all()
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    wsPath: row.ws_path,
    archived: row.archived === 1, // 过滤口径：archived 态随摘要行供 UI 过滤
  }))
}

function getProject(deps: ProjectServiceDeps, id: string): Project | null {
  const row = getRow(deps, id)
  return row === undefined ? null : toProject(row)
}

function updateProject(deps: ProjectServiceDeps, id: string, patch: ProjectPatch): Project {
  const { db } = deps
  const row = getRow(deps, id)
  if (row === undefined) {
    // 非六码 typed error（Error Handling 表无 project-not-found 行）：RPC 边界 fail-loud 原样上抛
    throw new Error(`项目不存在：updateProject(${id})——id 未命中 projects 行`)
  }
  // patch 仅 name/archived（接口类型收窄 + 白名单建句双重执行；多余键忽略零写）
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    params.push(patch.name)
  }
  if (patch.archived !== undefined) {
    sets.push('archived = ?')
    params.push(patch.archived ? 1 : 0)
  }
  if (sets.length > 0) {
    const updatedAt = new Date().toISOString()
    withTransaction(db, () => {
      db.prepare(`UPDATE projects SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(
        ...params,
        updatedAt,
        id,
      )
    })
  }
  const after = getRow(deps, id)
  if (after === undefined) throw new Error(`updateProject(${id})：更新后行消失（不可达——单写者无并发删除）`)
  return toProject(after)
}

// ── 启动对账（tech-design §交互三：每次启动，永不抛断启动流程） ──

/** 对账逐项输入（读全部 projects 的最小列） */
interface ProjectRefRow {
  id: string
  workspace_id: string
  ws_path: string
}

async function reconcileAtStartup(deps: ProjectServiceDeps): Promise<ReconcileReport> {
  const report: ReconcileReport = { repaired: [], orphans: [] }
  // 三层防御：单项降级（跳过该项目）→ 孤儿面/整体降级 → 记账本身失败亦吞掉——绝不抛断启动（AC5）
  try {
    const rows = deps.db
      .prepare<unknown[], ProjectRefRow>(`SELECT id, workspace_id, ws_path FROM projects ORDER BY created_at, id`)
      .all()
    for (const row of rows) {
      try {
        await reconcileProjectRef(deps, row, report)
      } catch (cause) {
        recordKeyLog(deps.db, {
          level: 'error',
          scope: 'reconcile',
          message: `对账单项失败：项目 ${row.id}（${row.ws_path}）——已跳过，不阻断启动`,
          data: {
            projectId: row.id,
            workspaceId: row.workspace_id,
            wsPath: row.ws_path,
            error: errMessage(cause),
            disposition: '单项降级跳过——引用未修，启动继续（下次启动重试对账）',
          },
        })
      }
    }
    detectOrphanWorkspaces(deps, report)
  } catch (cause) {
    try {
      recordKeyLog(deps.db, {
        level: 'error',
        scope: 'reconcile',
        message: `启动对账整体失败（已降级，不阻断启动）：${errMessage(cause)}`,
        data: { error: errMessage(cause), disposition: '整体降级——本次对账中止，启动流程继续' },
      })
    } catch {
      // 库不可用时记账亦不可行：吞掉——启动优先于记账（AC5）
    }
  }
  return Promise.resolve(report)
}

async function reconcileProjectRef(
  deps: ProjectServiceDeps,
  row: ProjectRefRow,
  report: ReconcileReport,
): Promise<void> {
  const { db, registry } = deps
  // 校验：get(workspace_id) 的 path 与 ws_path 一致即通过（§交互三逐项路径）
  const current = registry.get(row.workspace_id)
  if (current !== undefined && current.path === row.ws_path) return
  // 失配：list() 按 ws_path 找回（对账钥匙 = ws_path，idx_projects_ws_path）
  const found = registry.list().find((ws) => ws.path === row.ws_path)
  let target: WorkspaceLike
  let action: ReconcileRepair['action']
  if (found !== undefined) {
    target = found
    action = 'relinked'
  } else {
    // 找不回：create(ws_path) 幂等重建（dsh 侧补实体）→ 修引用
    target = await registry.create(row.ws_path)
    action = 'recreated'
  }
  // 单向修引用：只改应用侧 workspace_id，绝不反向改 dsh 侧（Implementation Notes）
  withTransaction(db, () => {
    db.prepare(`UPDATE projects SET workspace_id = ?, updated_at = ? WHERE id = ?`).run(
      target.id,
      new Date().toISOString(),
      row.id,
    )
  })
  if (action === 'relinked') {
    // 记账口径（§交互三 + ER 记名域②）：失配找回 warn 单条、old→new 与处置结果入 data_json；
    // 幂等重建成功不记（成功路径一律不记）
    recordKeyLog(db, {
      level: 'warn',
      scope: 'reconcile',
      message: `ws_path 失配找回：项目 ${row.id} 引用 ${row.workspace_id} → ${target.id}（${row.ws_path}）——已单向修正应用侧引用，dsh 侧不动`,
      data: {
        projectId: row.id,
        wsPath: row.ws_path,
        oldWorkspaceId: row.workspace_id,
        workspaceId: target.id,
        action: 'relinked',
        disposition: '已单向修正应用侧 workspace_id 引用（dsh 侧不动）',
      },
    })
  }
  report.repaired.push({ projectId: row.id, workspaceId: target.id, action })
}

function detectOrphanWorkspaces(deps: ProjectServiceDeps, report: ReconcileReport): void {
  const { db, registry } = deps
  // 反查（修引用后口径）：dsh 全量 ↔ projects 现行 workspace_id——不在引用集即孤儿
  const known = new Set(
    db.prepare<unknown[], { workspace_id: string }>(`SELECT workspace_id FROM projects`).all().map((r) => r.workspace_id),
  )
  for (const ws of registry.list()) {
    if (!known.has(ws.id)) report.orphans.push({ workspaceId: ws.id, wsPath: ws.path })
  }
  if (report.orphans.length === 0) return
  // 孤儿发现记账：单事件单条（全部孤儿并入同条 data_json）——只提示不自动删（SC12/§交互三）
  recordKeyLog(db, {
    level: 'warn',
    scope: 'reconcile',
    message: `发现 ${report.orphans.length} 个孤儿工作区（dsh 有、应用无）——仅提示，不自动删`,
    data: { orphans: report.orphans, disposition: '仅提示不自动删——处置交用户（UI 启动对账提示）' },
  })
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
