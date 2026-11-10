// queries——项目查询面（plugin-project 1.10）：四键字典序读面（sort_order→created_at→id，
// NULL 垫底）+ 归档过滤 + 标题对齐（registry title 读面）；读路径自证：project_key ≠
// f(main 行 ws_path) 投影 = suspected-move 语义——emitDiag warn 留痕 + 拒自动改（显式迁移动词面）。
import type { Project, ProjectSummary } from '@dsh-forge/lib-api'
import type { DiagEventPayload } from '@dsh-forge/lib-diag'
import type { ProjectsRepo, WorkspacesRepo } from '../db/repositories/index.js'
import { diag } from './errors.js'
import type { ProjectRegistryPort } from './registry-adapter.js'

type DiagPayload = Omit<DiagEventPayload, 'process'>

export interface ProjectsQueryDeps {
  readonly projects: ProjectsRepo
  readonly workspaces: WorkspacesRepo
  /** registry 读缝（标题对齐读面；缺席 = 跳过对齐——降级面） */
  readonly registry?: ProjectRegistryPort | undefined
  readonly onDiag?: ((payload: DiagPayload) => void) | undefined
}

export class ProjectsQueryService {
  readonly #deps: ProjectsQueryDeps

  constructor(deps: ProjectsQueryDeps) {
    this.#deps = deps
  }

  /** 四键字典序（repo ORDER BY 单源）+ 默认滤归档；读路径自证 suspected-move warn 拒自动改。 */
  listProjects(): ProjectSummary[] {
    const { projects, workspaces } = this.#deps
    const summaries: ProjectSummary[] = []
    for (const row of projects.list()) {
      const main = workspaces.getMain(row.id)
      this.selfCertify(row.projectKey, row.id, main?.wsPath)
      summaries.push({
        id: row.id,
        workspaceId: main?.workspaceId ?? '',
        name: row.title,
        wsPath: main?.wsPath ?? '',
        archived: row.archived,
        sortOrder: row.sortOrder ?? undefined,
      })
    }
    return summaries
  }

  /** 单项目读（含归档）；标题对齐读面：registry title 在场且与库内不一致 → 以 registry 为准返回。 */
  async getProject(id: string): Promise<Project | null> {
    const { projects, workspaces } = this.#deps
    const row = projects.get(id)
    if (row === undefined) return null
    const main = workspaces.getMain(id)
    this.selfCertify(row.projectKey, id, main?.wsPath)
    const title = await this.alignedTitle(id, row.title)
    return {
      id: row.id,
      workspaceId: main?.workspaceId ?? '',
      wsPath: main?.wsPath ?? '',
      name: title,
      forgeDir: row.forgeDir,
      forgeDirExternal: row.forgeDirExternal,
      worktreeDir: row.worktreeDir,
      archived: row.archived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  /** 标题对齐读面：registry entry title 在场且 ≠ 库内 title → registry 为准（库侧不被自动改写）。 */
  private async alignedTitle(projectId: string, dbTitle: string): Promise<string> {
    const registry = this.#deps.registry
    if (registry === undefined) return dbTitle
    try {
      const row = this.#deps.workspaces.getMain(projectId)
      if (row === undefined) return dbTitle
      const entry = await registry.get(row.workspaceId)
      return entry?.title ?? dbTitle
    } catch {
      return dbTitle
    }
  }

  /**
   * 读路径自证（design-key-flows §2）：project_key ≠ f(main 行 ws_path) 投影 = suspected-move
   * 语义——emitDiag warn 留痕 + 拒自动改（更新走显式迁移动词 updateMainPath，读面零写）。
   */
  private selfCertify(projectKey: string, projectId: string, mainWsPath: string | undefined): void {
    if (mainWsPath === undefined) return
    const expected = this.#deps.projects.projectKeyOf(mainWsPath)
    if (expected === projectKey) return
    diag(this.#deps.onDiag, {
      level: 'warn',
      event: 'project-suspected-move',
      message: `读路径自证不一致（suspected-move）：project_key=${projectKey} ≠ f(main ws_path)=${expected}——拒绝自动改，走显式迁移动词`,
      projectId,
      cwd: mainWsPath,
    })
  }
}
