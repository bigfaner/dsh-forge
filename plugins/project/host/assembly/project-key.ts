// 归属键真源解析（bug b5707fe4）：register 委托缝（index.ts projects core 优先）落 core
// ProjectService 时本库 project_projects 零行——keyOf 直查恒 null → ERR_BUG_PROJECT_KEY_REQUIRED
// → bugs 行集恒空（33aec906/b124e32d 同缝第三现）。本解析器扩展兜底链：
// ① 本库行直读（单装态注册产物，零额外 IO）；
// ② core 行真值锚——coreProjectsOf().getProject(projectId).wsPath（core projectId =
//    randomUUID ≠ workspace id——project-service.ts:442 实证；core 应用库行携 wsPath 真值，
//    coreProjectsOf 逐调用现查零缓存，AGENTS 1.6 纪律）；
// ③ registry 官方锚——registry.get(projectId).path（projectId 即 workspaceId 形态；
//    官方 d.ts 直读核销：Workspace 消费面仅 id/path/title/setTitle，无元数据通道）；
// → projectKeyOf(wsPath) 本地派生（lib-path 单源，register.ts:113 同函数）→ 派生键惰性回写
//   归属行（attachExisting 同语义——insertProjectWithMain 同事务双行；同路径已有他 id main
//   行即键空间自然合流零新行）。
// 各锚 try/catch fail-soft——派生失败返回 null，I5 拒写语义不变（core 缺席时原路径零变化）。
// 归属：assembly 装配面（域间零横向 import 机检①——bugs 服务只认 resolveProjectKey 缝）。
import type { DiagEventPayload } from '@dsh-forge/lib-diag'
import { canonicalizePath, projectKeyOf } from '@dsh-forge/lib-path'
import type { ProjectsServicePort } from '@dsh-forge/lib-api/ports'
import type { DomainDb } from '../db/connection.js'
import type { OfficialRegistryFace } from '../projects/registry-adapter.js'

type DiagPayload = Omit<DiagEventPayload, 'process'>

export interface ProjectKeyResolverDeps {
  readonly domainDb: DomainDb
  /** core forgeProjects 服务现查缝（core 代 projectId 的行真值锚——getProject().wsPath） */
  readonly coreProjects?: (() => ProjectsServicePort | undefined) | undefined
  /** 官方 workspaceRegistry face（projectId 即 workspaceId 形态的次级锚；缺席 = 链断） */
  readonly registry?: OfficialRegistryFace | undefined
  readonly now?: () => string
  /** 诊断缝（回写失败等 fail-soft 面——缺席静默） */
  readonly onDiag?: ((payload: DiagPayload) => void) | undefined
}

/** wsPath 末段标题派生（回写归属行 title 兜底——registry/core title 缺席时） */
function basenameOf(wsPath: string): string {
  const segs = wsPath.replaceAll('\\', '/').split('/').filter((s) => s !== '')
  return segs[segs.length - 1] ?? wsPath
}

/** wsPath 锚解析（② core 行真值 → ③ registry 官方锚；全链 fail-soft → null） */
async function resolveWsPath(
  deps: ProjectKeyResolverDeps,
  projectId: string,
): Promise<{ wsPath: string; title?: string; workspaceId?: string } | null> {
  // ② core 行真值锚（core 代注册形态——projectId = core randomUUID）
  try {
    const core = deps.coreProjects?.()
    if (core !== undefined) {
      const project = await core.getProject(projectId)
      if (project !== null && typeof project.wsPath === 'string' && project.wsPath !== '') {
        return { wsPath: project.wsPath, title: project.name || undefined, workspaceId: project.workspaceId || undefined }
      }
    }
  } catch (cause) {
    // fail-soft——core 缺席/劣形/调用失败同路次级锚（warn 留痕，不静默吞错）
    deps.onDiag?.({
      level: 'warn',
      event: 'project-key-anchor',
      message: `core 行真值锚解析失败（fail-soft 退次级锚）：project=${projectId}：${String(cause)}`,
      projectId,
    })
  }
  // ③ registry 官方锚（projectId 即 workspaceId 形态）
  try {
    const entry = await deps.registry?.get(projectId)
    if (entry !== undefined && typeof entry.path === 'string' && entry.path !== '') {
      return { wsPath: entry.path, title: entry.title || undefined, workspaceId: entry.id }
    }
  } catch (cause) {
    // fail-soft——registry 缺席/抛错同路 null（warn 留痕，不静默吞错）
    deps.onDiag?.({
      level: 'warn',
      event: 'project-key-anchor',
      message: `registry 官方锚解析失败（fail-soft 归 null）：project=${projectId}：${String(cause)}`,
      projectId,
    })
  }
  return null
}

/**
 * 归属键派生缝（I5）：projectId → project_key。
 * 链：① 本库行直读 → ②/③ wsPath 锚解析 → projectKeyOf 本地派生 + 惰性回写归属行；
 * 任一步失败 fail-soft 返回 null（拒写语义不变）。
 */
export function createProjectKeyResolver(
  deps: ProjectKeyResolverDeps,
): (projectId: string) => Promise<string | null> {
  const { projects, workspaces } = deps.domainDb.repos
  const now = deps.now ?? (() => new Date().toISOString())
  return async (projectId: string): Promise<string | null> => {
    // ① 本库行直读（主路径——单装态注册产物，零锚 IO）
    const own = projects.get(projectId)?.projectKey
    if (typeof own === 'string' && own !== '') return own
    const anchor = await resolveWsPath(deps, projectId)
    if (anchor === null) return null
    // 键先规范化再派生（bug 3467e146——与 resolveProjectKey 消费点同口径，写行/返回同键）
    const key = projectKeyOf(canonicalizePath(anchor.wsPath))
    // 同路径已有他 id main 行 → 键空间自然合流（同函数同值），零新行
    const converged = workspaces.getKeyByMainPath(anchor.wsPath)
    if (converged !== undefined) return converged
    // 惰性回写归属行（attachExisting 同语义——insertProjectWithMain 同事务双行 R4；
    // 撞键/写失败 fail-soft：键照常返回，读链不受回写失败影响）
    const stamp = now()
    try {
      workspaces.insertProjectWithMain(
        {
          id: projectId,
          projectKey: key,
          title: anchor.title ?? basenameOf(anchor.wsPath),
          forgeDir: anchor.wsPath,
          forgeDirExternal: false,
          worktreeDir: '',
          sortOrder: null,
          archived: false,
          createdAt: stamp,
          updatedAt: stamp,
        },
        {
          id: null,
          projectId,
          workspaceId: anchor.workspaceId ?? projectId,
          wsPath: anchor.wsPath,
          memberRole: 'main',
          boundAt: stamp,
          createdAt: stamp,
        },
      )
    } catch (cause) {
      deps.onDiag?.({
        level: 'warn',
        event: 'project-key-backfill',
        message: `归属行惰性回写失败（fail-soft——键照常返回）：project=${projectId} key=${key}：${String(cause)}`,
        projectId,
        cwd: anchor.wsPath,
      })
    }
    return key
  }
}
