// registerProject 四步补偿链（tech-design §Interface 1 + §交互一；定位：业务）。
// ① registry.list() 按 canonical path 预检（命中=挂接既有，attachedToExisting=true，不登记补偿）
// ② registry.create(wsPath)（dsh 幂等）→ ③ 事务写 projects 行
// ④ ③失败且属本次新建 → registry.delete(workspaceId) 补偿（保目录保日志，幂等）；
//    挂接既有时后任一步失败均不删既有工作区（ownership 保护）。
// SQLite 写仅经 db/ 句柄（单写路径）；registry 调用只依赖 dsh 官方 ctx.workspaceRegistry 面。
import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import type Database from 'better-sqlite3'
import type { ProjectService, RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { withTransaction } from '../db/index.js'
import { CompensationError, ProjectWriteError, WorkspaceCreateError } from './errors.js'
import { recordKeyLog } from './key-logs.js'
import type { WorkspaceLike, WorkspaceRegistryPort } from './registry.js'

export interface ProjectServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** dsh 官方面（ctx.workspaceRegistry；G1 pin 4 幂等语义见 ./registry.ts） */
  registry: WorkspaceRegistryPort
}

/** 2.2 服务面（2.3 并齐 contracts ProjectService：查询面 + reconcileAtStartup） */
export type ForgeProjectsService = Pick<ProjectService, 'registerProject'>

export function createProjectService(deps: ProjectServiceDeps): ForgeProjectsService {
  return {
    async registerProject(input: RegisterProjectInput): Promise<RegisterResult> {
      return registerProject(deps, input)
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
