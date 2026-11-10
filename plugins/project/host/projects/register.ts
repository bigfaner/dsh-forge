// register 五步补偿链（plugin-project 1.10，code-design §2 + design-key-flows §1）：
// 0 归一 + 同锚归并 → 1 自愈预检（悬空走 reconcile 单项修复）→ 2 碰撞复检（tasksHome 三态分类器，
// suspected-move/present 未确认拒绝零副作用）→ 3 registry.create（id 快照差集 = createdNow）
// → 4 insertProjectWithMain 单事务双行写 → 失败且 createdNow → registry.delete 补偿
// （只回滚 registry——挂接/既有实体永不补偿）。
// 不变量承袭：R4 双行同事务（DAO 单方法）；R1 撞键判据错误码级指 project_workspaces.ws_path
// （SQLITE_CONSTRAINT_UNIQUE + 表名模板），撞键 → 重入步骤 1 自愈一次。
import { classifyRegistrationCollision, type RegistrationCollision } from '@dsh-forge/lib-path'
import type { RegisterProjectInput, RegisterResult, SuspectedMoveData } from '@dsh-forge/lib-api'
import type { DiagEventPayload } from '@dsh-forge/lib-diag'
import type { ProjectsRepo, WorkspacesRepo } from '../db/repositories/index.js'
import { CompensationError, ProjectWriteError, SuspectedMoveError, WorkspaceCreateError, diag } from './errors.js'
import type { ProjectRegistryPort, RegistryEntryMutable } from './registry-adapter.js'

type DiagPayload = Omit<DiagEventPayload, 'process'>

export interface RegisterDeps {
  readonly projects: ProjectsRepo
  readonly workspaces: WorkspacesRepo
  /** registry 注入缝（fake 构造注入——补偿链两态测试面） */
  readonly registry: ProjectRegistryPort
  /** tasksHome（三态分类器消费目录；缺席 = 跳过碰撞复检——降级面） */
  readonly tasksHome?: string
  /** 三态分类器注入缝（缺省 = lib-path 单源；测试注入桩） */
  readonly classifyCollision?: (tasksHome: string, wsPath: string) => RegistrationCollision
  /** 关系表名模板（R1 错误码级判据的表名锚——撞键 message 含 `${workspacesTable}.ws_path`） */
  readonly workspacesTable: string
  readonly newId?: () => string
  readonly now?: () => string
  /** 诊断缝（emitDiagOrFallback 语义——缺席 console 兜底） */
  readonly onDiag?: ((payload: DiagPayload) => void) | undefined
  /** 注册完成回调缝（fail-soft——回调异常不阻断注册结果） */
  readonly onRegistered?: ((result: RegisterResult) => void) | undefined
}

/** better-sqlite3 约束错误形状（结构化窄面——禁运行期 import better-sqlite3 类型进域服务）。 */
interface SqliteConstraintError {
  readonly code?: string
  readonly message?: string
}

/**
 * R1：UNIQUE 撞键判据错误码级指 project_workspaces.ws_path——
 * SQLITE_CONSTRAINT_UNIQUE 且 message 含关系表模板名（"UNIQUE constraint failed: project_workspaces.ws_path"）。
 */
export function isWsPathUniqueCollision(cause: unknown, workspacesTable: string): boolean {
  const err = cause as SqliteConstraintError | null
  return (
    typeof err === 'object' &&
    err !== null &&
    err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    typeof err.message === 'string' &&
    err.message.includes(workspacesTable)
  )
}

/** forge_dir 仓外推导（路径关系自动推导——forgeDir 不在 workspaceDir 前缀链内 = external）。 */
function deriveForgeDirExternal(forgeDir: string, wsPath: string): boolean {
  const norm = (p: string): string => p.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
  const f = norm(forgeDir)
  const w = norm(wsPath)
  return !(f === w || f.startsWith(`${w}\\`))
}

export class ProjectsRegisterService {
  readonly #deps: RegisterDeps

  constructor(deps: RegisterDeps) {
    this.#deps = deps
  }

  async register(input: RegisterProjectInput): Promise<RegisterResult> {
    const { projects, workspaces, registry } = this.#deps
    const wsPath = input.workspaceDir // canonical 化后路径（DTO 契约）
    const title = input.name

    // 步 0/1：自愈预检——同 ws_path main 行健康则幂等归并；悬空走单项修复
    const attached = await this.attachExisting(wsPath, title)
    if (attached !== null) return attached

    // 步 2：碰撞复检（tasksHome 三态分类器）——suspected-move/present 未确认拒绝零副作用
    const tasksHome = this.#deps.tasksHome
    if (tasksHome !== undefined) {
      const classify = this.#deps.classifyCollision ?? classifyRegistrationCollision
      const collision = classify(tasksHome, wsPath)
      if (collision.state !== 'normal') {
        diag(this.#deps.onDiag, {
          level: 'warn',
          event: 'project-register-collision',
          message: `注册碰撞拒绝（${collision.state}）：${collision.data.guidance}`,
          cwd: wsPath,
        })
        throw new SuspectedMoveError(collision.data as SuspectedMoveData)
      }
    }

    // 步 3：registry.create（dsh 幂等）——id 快照差集 = createdNow
    const before = new Set((await registry.list()).map((e) => e.workspaceId))
    let entry: RegistryEntryMutable
    try {
      entry = await registry.create(wsPath, title)
    } catch (cause) {
      throw new WorkspaceCreateError(`registry.create 失败（注册中止，dsh 侧零副作用）：${String(cause)}`, { cause: String(cause), wsPath })
    }
    const createdNow = !before.has(entry.workspaceId)

    // 步 4：单事务双行写（R4——insertProjectWithMain DAO 单方法，禁拆两条语句）
    const now = this.#deps.now ?? (() => new Date().toISOString())
    const id = (this.#deps.newId ?? crypto.randomUUID)()
    const stamp = now()
    const projectRow = {
      id,
      projectKey: projects.projectKeyOf(wsPath), // project_key 现算 = main ws_path 投影（f 单源 lib-path）
      title,
      forgeDir: input.forgeDir,
      forgeDirExternal: deriveForgeDirExternal(input.forgeDir, wsPath),
      worktreeDir: input.worktreeDir ?? '',
      sortOrder: null,
      archived: false,
      createdAt: stamp,
      updatedAt: stamp,
    }
    const mainRow = {
      id: null,
      projectId: id,
      workspaceId: entry.workspaceId,
      wsPath,
      memberRole: 'main' as const,
      boundAt: stamp,
      createdAt: stamp,
    }
    try {
      workspaces.insertProjectWithMain(projectRow, mainRow)
    } catch (cause) {
      if (isWsPathUniqueCollision(cause, this.#deps.workspacesTable)) {
        // R1：撞键（同路径已注册）→ 重入步骤 1 自愈一次；自愈不成（worktree 行占位等）→ 补偿后拒绝
        const healed = await this.attachExisting(wsPath, title)
        if (healed !== null) return healed
      }
      // 步 4 失败且 createdNow → registry.delete 补偿（挂接/既有实体永不补偿）
      if (createdNow) {
        try {
          await registry.delete(entry.workspaceId)
        } catch (compCause) {
          diag(this.#deps.onDiag, {
            level: 'error',
            event: 'project-register-compensation',
            message: `补偿删除失败（交启动对账，不自动删）：workspace=${entry.workspaceId}：${String(compCause)}`,
            projectId: id,
            cwd: wsPath,
          })
          throw new CompensationError(`补偿删除失败：${String(compCause)}`, {
            workspaceId: entry.workspaceId,
            reason: String(cause),
          })
        }
      }
      throw new ProjectWriteError(`项目双表写失败（补偿${createdNow ? '已执行' : '不适用——挂接既有实体'}）：${String(cause)}`, {
        compensated: createdNow ? { workspaceId: entry.workspaceId, reason: String(cause) } : undefined,
      })
    }

    // 标题对齐（fail-soft）+ onRegistered（fail-soft）
    await this.alignTitle(entry, title, id, wsPath)
    const result: RegisterResult = { projectId: id, workspaceId: entry.workspaceId, attachedToExisting: false }
    try {
      this.#deps.onRegistered?.(result)
    } catch (cause) {
      diag(this.#deps.onDiag, { level: 'warn', event: 'project-register-callback', message: `onRegistered 回调失败（fail-soft）：${String(cause)}`, projectId: id })
    }
    return result
  }

  /**
   * 步 1 自愈预检：main 行健康（registry 命中且 path 一致）→ 幂等归并返回；
   * workspace_id 悬空 → resolveByPath 找回 relink / 找不回 recreate 幂等重建（单向修应用侧引用）。
   * 非 main 行占位（worktree 行）不构成归并 → null 继续主链（最终撞 R1 判据走补偿面）。
   */
  private async attachExisting(wsPath: string, title: string): Promise<RegisterResult | null> {
    const { workspaces, registry } = this.#deps
    const row = workspaces.findByWsPath(wsPath)
    if (row === undefined || row.memberRole !== 'main') return null
    const entry = await registry.get(row.workspaceId)
    if (entry === undefined || entry.wsPath !== wsPath) {
      const found = await registry.resolveByPath(wsPath)
      const target = found ?? (await registry.create(wsPath, title))
      if (row.id !== null) workspaces.updateWorkspaceRef(row.id, target.workspaceId)
      await this.alignTitle(target, title, row.projectId, wsPath)
      return { projectId: row.projectId, workspaceId: target.workspaceId, attachedToExisting: true }
    }
    await this.alignTitle(entry, title, row.projectId, wsPath)
    return { projectId: row.projectId, workspaceId: row.workspaceId, attachedToExisting: true }
  }

  /** 标题对齐（步 4 尾巴 + 归并径）：registry title 与项目名不一致 → setTitle durable 对齐，fail-soft。 */
  private async alignTitle(entry: RegistryEntryMutable, title: string, projectId: string, wsPath: string): Promise<void> {
    if (entry.setTitle === undefined || entry.title === title) return
    try {
      await entry.setTitle(title)
    } catch (cause) {
      diag(this.#deps.onDiag, {
        level: 'warn',
        event: 'project-title-align',
        message: `标题对齐失败（fail-soft）：workspace=${entry.workspaceId}：${String(cause)}`,
        projectId,
        cwd: wsPath,
      })
    }
  }
}
