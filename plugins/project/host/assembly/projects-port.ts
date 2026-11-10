// host/assembly · projects 缝常驻 provider 组装面（plugin-project 1.17 五缝合拢）。
// 定位：装配缝——把 1.10 四件（register / queries / reconcile / registry-adapter）与
// repositories 组装成 ProjectsServicePort（dto ProjectService 六动词单源形状），零域逻辑
// （五步补偿链/对账矩阵/查询口径全部归属 host/projects 域本体，此处只做委托组装）。
import type { Project, ProjectPatch, ProjectService, ProjectSummary, RegisterProjectInput, RegisterResult, ReconcileReport } from '@dsh-forge/lib-api'
import type { DiagEventPayload } from '@dsh-forge/lib-diag'
import { openDomainDb, domainDbFileName, type DomainDb } from '../db/connection.js'
import type { ProjectRow } from '../db/row-types.js'
import { ProjectsRegisterService } from '../projects/register.js'
import { ProjectsQueryService } from '../projects/queries.js'
import { reconcileAtStartup } from '../projects/reconcile.js'
import { createRegistryAdapter, type OfficialRegistryFace, type ProjectRegistryPort } from '../projects/registry-adapter.js'

type DiagPayload = Omit<DiagEventPayload, 'process'>

export interface ProjectsPortDeps {
  readonly domainDb: DomainDb
  /** 官方 workspaceRegistry face（registry-adapter 适配——装配期唯一缝合点） */
  readonly registry?: OfficialRegistryFace | undefined
  /** tasksHome（三态分类器消费目录；缺席 = 跳过碰撞复检——降级面） */
  readonly tasksHome?: string | undefined
  readonly onDiag?: ((payload: DiagPayload) => void) | undefined
}

/** 行 + main 关系行 → dto Project 投影（组装面唯一映射位——零派生逻辑） */
function toProject(row: ProjectRow, main: { workspaceId: string; wsPath: string } | undefined): Project {
  return {
    id: row.id,
    workspaceId: main?.workspaceId ?? '',
    wsPath: main?.wsPath ?? '',
    name: row.title,
    forgeDir: row.forgeDir,
    forgeDirExternal: row.forgeDirExternal,
    worktreeDir: row.worktreeDir,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** ProjectsServicePort 常驻 provider（六动词逐项委托域本体）。 */
export function createProjectsServicePort(deps: ProjectsPortDeps): ProjectService {
  const { repos, tables } = deps.domainDb
  const projects = repos.projects
  const workspaces = repos.workspaces
  const absentRegistry: ProjectRegistryPort = {
    list: async () => [],
    get: async () => undefined,
    create: async () => {
      throw new Error('registry face 缺席（装配降级——注册拒绝零副作用）')
    },
    delete: async () => undefined,
    resolveByPath: async () => undefined,
  }
  const registry = deps.registry !== undefined ? createRegistryAdapter(deps.registry) : absentRegistry
  const hasRegistry = deps.registry !== undefined
  const registerService = new ProjectsRegisterService({
    projects,
    workspaces,
    registry,
    tasksHome: deps.tasksHome,
    workspacesTable: tables.workspaces,
    onDiag: deps.onDiag,
  })
  const queryService = new ProjectsQueryService({ projects, workspaces, registry, onDiag: deps.onDiag })
  return {
    registerProject: (input: RegisterProjectInput): Promise<RegisterResult> => registerService.register(input),
    listProjects: (): Promise<ProjectSummary[]> => Promise.resolve(queryService.listProjects()),
    getProject: async (id: string): Promise<Project | null> => {
      const row = projects.get(id)
      if (row === undefined) return null
      return toProject(row, workspaces.getMain(id))
    },
    updateProject: async (id: string, patch: ProjectPatch): Promise<Project> => {
      const row = projects.get(id)
      if (row === undefined) throw new Error(`project 不在册：${id}`)
      if (patch.name !== undefined) projects.updateTitle(id, patch.name, new Date().toISOString())
      if (patch.archived !== undefined) projects.setArchived(id, patch.archived, new Date().toISOString())
      if (patch.worktreeDir !== undefined) projects.updateWorktreeDir(id, patch.worktreeDir, new Date().toISOString())
      const updated = projects.get(id) ?? row
      return toProject(updated, workspaces.getMain(id))
    },
    reconcileAtStartup: (): Promise<ReconcileReport> => {
      if (!hasRegistry) {
        return Promise.resolve({ repaired: [], orphans: [] })
      }
      return reconcileAtStartup({ projects, workspaces, registry, onDiag: deps.onDiag })
    },
  }
}

/** project.db 打开缝（装配期一次；I4 拒开异常上抛由装配方 fail-soft 退兜底）。 */
export function openProjectsDomainDb(home: string): DomainDb {
  return openDomainDb(home, { prefix: 'project', file: domainDbFileName(home) })
}
