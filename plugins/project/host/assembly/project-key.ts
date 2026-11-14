// 归属键真源解析（bug b5707fe4）：register 委托缝（index.ts projects core 优先）落 core
// ProjectService 时本库 project_projects 零行——keyOf 直查恒 null → ERR_BUG_PROJECT_KEY_REQUIRED
// → bugs 行集恒空（33aec906/b124e32d 同缝第三现）。本解析器扩展兜底链：本库行缺席时经
// 官方 workspaceRegistry 锚（get(projectId).path——两库共同物理真值，官方 d.ts 直读核销：
// Workspace 消费面仅 id/path/title/setTitle，无元数据通道）→ projectKeyOf(wsPath) 本地派生
// （lib-path 单源，register.ts:113 同函数）→ 派生键惰性回写归属行（attachExisting 同语义——
// insertProjectWithMain 同事务双行；同路径已有他 id main 行即键空间自然合流零新行）。
// registry 消费 try/catch fail-soft（AGENTS 1.6 现查纪律，检测永不缓存）——派生失败返回
// null，I5 拒写语义不变（core 缺席时原路径零变化）。
// 归属：assembly 装配面（域间零横向 import 机检①——bugs 服务只认 resolveProjectKey 缝）。
import type { DiagEventPayload } from '@dsh-forge/lib-diag'
import type { DomainDb } from '../db/connection.js'
import type { OfficialRegistryFace } from '../projects/registry-adapter.js'

type DiagPayload = Omit<DiagEventPayload, 'process'>

export interface ProjectKeyResolverDeps {
  readonly domainDb: DomainDb
  /** 官方 workspaceRegistry face（core 代 projectId 的 wsPath 真源锚；缺席 = 兜底链断 null） */
  readonly registry?: OfficialRegistryFace | undefined
  readonly now?: () => string
  /** 诊断缝（回写失败等 fail-soft 面——缺席静默） */
  readonly onDiag?: ((payload: DiagPayload) => void) | undefined
}

/** wsPath 末段标题派生（回写归属行 title 兜底——registry title 缺席时） */
function basenameOf(wsPath: string): string {
  const segs = wsPath.replaceAll('\\', '/').split('/').filter((s) => s !== '')
  return segs[segs.length - 1] ?? wsPath
}

/**
 * 归属键派生缝（I5）：projectId → project_key。
 * 链：① 本库行直读 → ② registry.get(projectId).path 官方锚 → projectKeyOf 本地派生 +
 * 惰性回写归属行；任一步失败 fail-soft 返回 null（拒写语义不变）。
 */
export function createProjectKeyResolver(
  deps: ProjectKeyResolverDeps,
): (projectId: string) => Promise<string | null> {
  const { projects, workspaces } = deps.domainDb.repos
  const now = deps.now ?? (() => new Date().toISOString())
  return async (projectId: string): Promise<string | null> => {
    // ① 本库行直读（主路径——单装态注册产物，零 registry IO）
    const own = projects.get(projectId)?.projectKey
    if (typeof own === 'string' && own !== '') return own
    // ② 官方锚解析（try/catch fail-soft——registry 缺席/抛错同路 null）
    let wsPath: string | undefined
    let title: string | undefined
    try {
      const entry = await deps.registry?.get(projectId)
      if (entry !== undefined && typeof entry.path === 'string' && entry.path !== '') {
        wsPath = entry.path
        title = entry.title
      }
    } catch (cause) {
      deps.onDiag?.({
        level: 'warn',
        event: 'project-key-resolve',
        message: `归属键官方锚解析失败（fail-soft）：project=${projectId}：${String(cause)}`,
        projectId,
      })
    }
    if (wsPath === undefined) return null
    const key = projects.projectKeyOf(wsPath)
    // 同路径已有他 id main 行 → 键空间自然合流（同函数同值），零新行
    const converged = workspaces.getKeyByMainPath(wsPath)
    if (converged !== undefined) return converged
    // 惰性回写归属行（attachExisting 同语义——insertProjectWithMain 同事务双行 R4；
    // 撞键/写失败 fail-soft：键照常返回，读链不受回写失败影响）
    const stamp = now()
    try {
      workspaces.insertProjectWithMain(
        {
          id: projectId,
          projectKey: key,
          title: title !== undefined && title !== '' ? title : basenameOf(wsPath),
          forgeDir: wsPath,
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
          workspaceId: projectId,
          wsPath,
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
        cwd: wsPath,
      })
    }
    return key
  }
}
