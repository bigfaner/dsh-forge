// host/assembly · 服务缝装配单点（plugin-project 1.17 五缝合拢——proposal §三下沉面 +
// code-design §6「服务装配层重订：service = seam，一 service 多 provider」）。
// 五缝：forge.projects / forge.worktrees / forge.projectResolution / forge.bugs / forge.dirFacts。
// 装配语义（设计正本 §6，此处为唯一实现面）：
//   · 常驻 provider：域实现惰性工厂（装配期由 deps 注入——db/registry 等重依赖装配期闭包）；
//   · 兜底 provider：独立模式面（projects 恒空清单 / worktrees 独立模式 / resolution 默认 /
//     bugs 拒 ErrUnavailable / dirFacts 仅内置键集）；
//   · 覆写 provider：宿主/组合器注入（deps.overrides）——注入在场即覆写、劣形退常驻再退兜底；
//   · 择优在装配期一次完成（注册即终态），运行期不切换。
// 消费面统一 injectProjectSeam（ctx.inject 路径）：注入缺席/劣形三形态（注册值非函数 /
//   实例化抛错 / 首调抛错）fail-soft 退兜底——劣形清单程序化可识别（code-design §6 S1）。
import type {
  BugsServicePort,
  DirFactsPort,
  ProjectResolutionPort,
  ProjectsServicePort,
  WorktreeServicePort,
} from '@dsh-forge/lib-api'
import { createDefaultExtensionPoints } from '../worktrees/extension-points.js'
import { WORKTREE_DIR_RELATIVE } from '../worktrees/service.js'

/** 五缝服务键单源（装配侧 provide 与消费侧 inject 同锚常量——禁字面量散落） */
export const PROJECT_SEAM_KEYS = {
  projects: 'forge.projects',
  worktrees: 'forge.worktrees',
  projectResolution: 'forge.projectResolution',
  bugs: 'forge.bugs',
  dirFacts: 'forge.dirFacts',
} as const

export type ProjectSeamKey = (typeof PROJECT_SEAM_KEYS)[keyof typeof PROJECT_SEAM_KEYS]

/** 缝契约 → 端口类型映射（injectProjectSeam 泛型锚） */
export interface ProjectSeamPorts {
  readonly [PROJECT_SEAM_KEYS.projects]: ProjectsServicePort
  readonly [PROJECT_SEAM_KEYS.worktrees]: WorktreeServicePort
  readonly [PROJECT_SEAM_KEYS.projectResolution]: ProjectResolutionPort
  readonly [PROJECT_SEAM_KEYS.bugs]: BugsServicePort
  readonly [PROJECT_SEAM_KEYS.dirFacts]: DirFactsPort
}

/** cordis ctx 窄面（reflect.provide/get——官方反射缝，plugin-forge forgeDirs 同配方） */
export interface SeamCtxFace {
  readonly reflect?: {
    readonly provide?: (name: string, value?: unknown) => unknown
    readonly get?: (name: string) => unknown
  }
}

export type SeamDiag = (line: string) => void

/** 常驻 provider 惰性工厂（装配期闭包重依赖——实例化失败 = 劣形②退兜底） */
export type ResidentFactory<T> = () => T

/** 覆写 provider（宿主注入位——在场即覆写常驻） */
export type OverrideProvider<T> = T

/** 五缝装配依赖：常驻工厂 + 覆写位（均可选——缺席该缝 = 注册兜底面） */
export interface ProjectSeamDeps {
  readonly projects?: ResidentFactory<ProjectsServicePort> | undefined
  readonly worktrees?: ResidentFactory<WorktreeServicePort> | undefined
  readonly projectResolution?: ResidentFactory<ProjectResolutionPort> | undefined
  readonly bugs?: ResidentFactory<BugsServicePort> | undefined
  readonly dirFacts?: ResidentFactory<DirFactsPort> | undefined
  /** 覆写位（宿主注入——形状劣形 = 整缝退常驻/兜底） */
  readonly overrides?: {
    readonly projects?: OverrideProvider<ProjectsServicePort> | undefined
    readonly worktrees?: OverrideProvider<WorktreeServicePort> | undefined
    readonly projectResolution?: OverrideProvider<ProjectResolutionPort> | undefined
    readonly bugs?: OverrideProvider<BugsServicePort> | undefined
    readonly dirFacts?: OverrideProvider<DirFactsPort> | undefined
  }
  readonly onDiag?: SeamDiag | undefined
}

/** 五缝注册结果（可观测面——降级缝明示，不静默） */
export interface ProjectSeamRegistration {
  readonly registered: readonly ProjectSeamKey[]
  readonly degraded: readonly ProjectSeamKey[]
}

/* ------------------------------------------------------------------ */
/* 兜底 provider（独立模式面——各缝语义见 code-design §6）               */
/* ------------------------------------------------------------------ */

/** projects 兜底：零库恒空清单（register/get/update 拒不可用——typed 错误上抛消费面） */
export function stubProjectsService(onDiag?: SeamDiag): ProjectsServicePort {
  const unavailable = async (): Promise<never> => {
    throw new Error('forge.projects seam unavailable（独立模式兜底——project.db 未装配）')
  }
  onDiag?.('[project-seams] forge.projects 兜底 provider 激活（零库恒空清单）')
  return {
    registerProject: unavailable,
    listProjects: async () => [],
    getProject: async () => null,
    updateProject: unavailable,
    reconcileAtStartup: async () => ({ repaired: [], orphans: [] }),
  } as unknown as ProjectsServicePort
}

/** worktrees 兜底：独立模式（list 恒零 / create/delete 拒不可用——封闭写集未装配 /
 *  resolve 恒空集 / seal 恒未封存——rpc-service 独立模式同语义） */
export function standaloneWorktreeService(onDiag?: SeamDiag): WorktreeServicePort {
  const writeUnavailable = async (): Promise<never> => {
    throw new Error('forge.worktrees create/delete unavailable（独立模式兜底——worktree 封闭写集未装配）')
  }
  onDiag?.('[project-seams] forge.worktrees 兜底 provider 激活（独立 worktree 模式）')
  return {
    list: async () => ({ isGit: false, entries: [] }),
    create: writeUnavailable,
    delete: writeUnavailable,
    ensureWorkspace: async () => ({}),
    select: async () => ({ ok: true }),
    seal: async () =>
      ({
        isGit: false,
        sealed: false,
        binding: null,
      }) as unknown as Awaited<ReturnType<WorktreeServicePort['seal']>>,
    resolve: async () => ({ resolved: [] }),
    getWorktreeDir: (projectRoot: string) => `${projectRoot}/${WORKTREE_DIR_RELATIVE}`,
    resolveProject: async () => null,
  }
}

/** projectResolution 兜底 = 既有默认 provider（extension-points——resolveProject 恒 null） */
export function defaultResolutionService(): ProjectResolutionPort {
  return createDefaultExtensionPoints()
}

/** bugs 兜底：空实现（register 拒 ErrUnavailable 语义——code-design §6） */
export function stubBugsService(onDiag?: SeamDiag): BugsServicePort {
  const unavailable = async (): Promise<never> => {
    throw new Error('forge.bugs seam unavailable（独立模式兜底——project.db 未装配）')
  }
  onDiag?.('[project-seams] forge.bugs 兜底 provider 激活（register 拒不可用）')
  return {
    registerBug: unavailable,
    resolveBug: unavailable,
    listBugs: async () => [],
    getBug: unavailable,
    aggregateByErrorType: async () => [],
  } as unknown as BugsServicePort
}

/** dirFacts 兜底位说明：契约 = host/dirs minimalDirFactsPort（仅内置键集）——
 *  本装配面的 deps.dirFacts 缺席时以「拒绝工厂」占位，真实最小兜底由 host/dirs 提供
 *  （消费侧见 host/dirs/dir-facts.ts；此处不复制第二份实现）。 */
function missingDirFacts(): DirFactsPort {
  throw new Error('forge.dirFacts resident factory absent（装配缺位）')
}

/* ------------------------------------------------------------------ */
/* 装配期择优 + 注册                                                    */
/* ------------------------------------------------------------------ */

/** 覆写形状校验（劣形①前置：注册值非对象/缺法 → 整缝覆写位作废） */
function usableOverride<T extends object>(raw: unknown): T | undefined {
  if (raw === undefined || raw === null || typeof raw !== 'object') return undefined
  const keys = Object.keys(raw as object)
  return keys.length > 0 ? (raw as T) : undefined
}

/** 单缝择优：覆写（形状合格）→ 常驻（工厂惰性）→ 兜底。返回 provider 工厂。 */
function resolveProvider<T extends object>(
  key: ProjectSeamKey,
  override: unknown,
  resident: ResidentFactory<T> | undefined,
  fallback: () => T,
  onDiag: SeamDiag | undefined,
): () => T {
  const usable = usableOverride<T>(override)
  if (usable !== undefined) {
    onDiag?.(`[project-seams] ${key} 覆写 provider 在场——装配期覆写常驻`)
    return () => usable
  }
  if (resident === undefined) return fallback
  return () => {
    try {
      const instance = resident()
      if (instance === undefined || instance === null || typeof instance !== 'object') {
        onDiag?.(`[project-seams] ${key} 常驻工厂产出非对象（劣形②）——退兜底`)
        return fallback()
      }
      return instance
    } catch (cause) {
      onDiag?.(`[project-seams] ${key} 常驻工厂实例化抛错（劣形②）——退兜底：${String(cause)}`)
      return fallback()
    }
  }
}

/**
 * 五缝注册（装配期一次）：逐缝 reflect.provide(key, factory)。反射面缺席/单缝抛错 =
 * 该缝降级（degraded 明示），不阻其余缝、不抛断宿主（fail-soft 同 forgeDirs 配方）。
 */
export function registerProjectSeams(ctx: SeamCtxFace, deps: ProjectSeamDeps): ProjectSeamRegistration {
  const provide = ctx.reflect?.provide
  const registered: ProjectSeamKey[] = []
  const degraded: ProjectSeamKey[] = []
  const overrides = deps.overrides ?? {}
  const plan: readonly {
    readonly key: ProjectSeamKey
    readonly factory: () => unknown
  }[] = [
    {
      key: PROJECT_SEAM_KEYS.projects,
      factory: resolveProvider(
        PROJECT_SEAM_KEYS.projects,
        overrides.projects,
        deps.projects,
        () => stubProjectsService(deps.onDiag),
        deps.onDiag,
      ),
    },
    {
      key: PROJECT_SEAM_KEYS.worktrees,
      factory: resolveProvider(
        PROJECT_SEAM_KEYS.worktrees,
        overrides.worktrees,
        deps.worktrees,
        () => standaloneWorktreeService(deps.onDiag),
        deps.onDiag,
      ),
    },
    {
      key: PROJECT_SEAM_KEYS.projectResolution,
      factory: resolveProvider(
        PROJECT_SEAM_KEYS.projectResolution,
        overrides.projectResolution,
        deps.projectResolution,
        defaultResolutionService,
        deps.onDiag,
      ),
    },
    {
      key: PROJECT_SEAM_KEYS.bugs,
      factory: resolveProvider(
        PROJECT_SEAM_KEYS.bugs,
        overrides.bugs,
        deps.bugs,
        () => stubBugsService(deps.onDiag),
        deps.onDiag,
      ),
    },
    {
      key: PROJECT_SEAM_KEYS.dirFacts,
      factory: resolveProvider(
        PROJECT_SEAM_KEYS.dirFacts,
        overrides.dirFacts,
        deps.dirFacts,
        missingDirFacts,
        deps.onDiag,
      ),
    },
  ]
  for (const { key, factory } of plan) {
    if (typeof provide !== 'function') {
      deps.onDiag?.(`[project-seams] ${key} reflect.provide 面缺席——缝降级（消费面退兜底）`)
      degraded.push(key)
      continue
    }
    try {
      // cordis reflect.provide 内部读 this.ctx——接收者必须为 reflect 实例（host-side.ts 同正形）；
      // 误绑 ctx 时 Context 服务面 getter 抛 `cannot get property "ctx" without inject`，全缝降级。
      provide.call(ctx.reflect, key, factory)
      registered.push(key)
    } catch (cause) {
      deps.onDiag?.(`[project-seams] ${key} provide 抛错——缝降级（fail-soft 不阻载）：${String(cause)}`)
      degraded.push(key)
    }
  }
  return { registered, degraded }
}

/* ------------------------------------------------------------------ */
/* 消费面（ctx.inject 路径）                                            */
/* ------------------------------------------------------------------ */

/**
 * 消费面取法：reflect.get(缝键) → 工厂实例化 → 首调守卫包裹。
 * 劣形三形态逐项收口（S1）：
 *   ① 注册值非函数（含缺席 undefined）→ 返回兜底；
 *   ② 工厂实例化抛错 → 返回兜底；
 *   ③ 首调抛错 → 该缝此后恒兜底（劣形降级记忆——设计「劣形注入 fail-soft 退默认」）。
 * 检测永不缓存纪律的边界：在场性逐调用现查（reflect.get 每次重求值）；仅劣形③的
 * 降级态按设计记忆（运行期不切换的正常择优语义的反向面——劣形即退默认终态）。
 */
export function injectProjectSeam<K extends ProjectSeamKey>(
  ctx: SeamCtxFace,
  key: K,
  fallback: () => ProjectSeamPorts[K],
): ProjectSeamPorts[K] {
  let degraded = false
  const resolve = (): ProjectSeamPorts[K] => {
    if (degraded) return fallback()
    let raw: unknown
    try {
      raw = ctx.reflect?.get?.(key)
    } catch {
      raw = undefined // 读取异常（scope 缺席）视同缺席——劣形①
    }
    if (typeof raw !== 'function') return fallback() // 劣形①（含缺席）
    try {
      const instance = (raw as () => unknown)()
      if (instance === undefined || instance === null || typeof instance !== 'object') {
        degraded = true
        return fallback() // 劣形②产出非对象
      }
      return guardFirstCall(instance as ProjectSeamPorts[K], fallback, () => {
        degraded = true
      })
    } catch {
      degraded = true
      return fallback() // 劣形②实例化抛错
    }
  }
  // 每次消费调用现查注入缝（检测永不缓存——AGENTS 1.6 同径）；劣形降级态按设计记忆
  //（劣形即退默认终态，运行期不切换的反向面）。单次调用内 provider 引用稳定。
  return resolve()
}

/** 首调守卫：函数面首个抛错（同步或 Promise rejection）→ 切兜底（劣形③）；此后恒兜底。 */
function guardFirstCall<T extends object>(provider: T, fallback: () => T, degrade: () => void): T {
  const guarded: Record<string, unknown> = {}
  for (const key of Object.keys(provider)) {
    const value = (provider as Record<string, unknown>)[key]
    if (typeof value !== 'function') {
      guarded[key] = value
      continue
    }
    guarded[key] = (...args: unknown[]) => {
      const degradeToFallback = (cause: unknown): unknown => {
        degrade()
        const fb = fallback() as Record<string, unknown>
        const fbFn = fb[key]
        if (typeof fbFn !== 'function') throw cause
        return (fbFn as (...a: unknown[]) => unknown)(...args)
      }
      try {
        const result = (value as (...a: unknown[]) => unknown)(...args)
        if (result instanceof Promise) {
          return result.catch((cause: unknown) => degradeToFallback(cause))
        }
        return result
      } catch (cause) {
        return degradeToFallback(cause)
      }
    }
  }
  return guarded as T
}
