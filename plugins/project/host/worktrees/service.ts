// forge:worktree/* 域服务本体（plugin-project 1.13 单体拆解——编排 + resolve 缓存与失效单点）。
// 职责分件（依赖单向）：
//   service（本件）→ git-client（git/外部事实触点 leaf）
//                → bind-events（session/created 留痕前台触发——type-only 回指）
//                → seal（封存判定快照通道——type-only 回指）
//                → healing（list 通道顺带 healing——type-only 回指）
//   send-guard（发送拦截）消费 seal 产出；rpc-service.ts 仅 re-export 兼容面。
// 官方服务一律经 Face 注入，本包零 apps/host/* import（依赖方向红线）。
// type-only import 整句形态（bug 9083f0f0）：inline `type` 修饰在 verbatimModuleSyntax 下
// 保留 import 语句为空壳——ESM 空 import 仍做模块解析，外部宿主装载即 ERR_MODULE_NOT_FOUND；
// 整句 type import 被 tsc 完全消隐，「零 dsh-forge 依赖」在产物面成立。
import { mkdirSync, readdirSync, existsSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import type {
  WorktreeAheadBehindRequest,
  WorktreeAheadBehindResult,
  WorktreeBranchesRequest,
  WorktreeBranchesResult,
  WorktreeChecksRequest,
  WorktreeChecksResult,
  WorktreeCreateRequest,
  WorktreeCreateResult,
  ForgeBindingMismatchEvent,
  WorktreeDeleteRequest,
  WorktreeDeleteResult,
  WorktreeEnsureWorkspaceRequest,
  WorktreeEnsureWorkspaceResult,
  WorktreeEntryDto,
  WorktreeListRequest,
  WorktreeListResult,
  WorktreeSealRequest,
  WorktreeSealResult,
  WorktreeSelectRequest,
  WorktreeSelectResult,
  WorktreeResolveRequest,
  WorktreeResolveEntry,
  WorktreeResolveResult,
} from '@dsh-forge/contracts'
import {
  createWorktree,
  defaultBranch as defaultBranchOp,
  deleteWorktree,
  aheadBehind as aheadBehindOp,
  listBranches,
  listWorktrees,
  worktreeStatus,
} from './worktree-ops.js'
import type { GitWorktreeExtensionPoints } from './extension-points.js'
import { consoleDiagFallback } from './diag-fallback.js'
import { normalizePathForCompare } from './seal-guard.js'
import type { WorktreeBindAppendTarget } from './session-attach.js'
import {
  defaultEnsureDirAcl,
  defaultListPresent,
  defaultPathPresent,
  defaultSymbolicRefOf,
  worktreeNameOf,
} from './git-client.js'
import { createBindEvents, type BindEvents } from './bind-events.js'
import { createSealChannel, type SealChannel } from './seal.js'
import { createHealing, type Healing } from './healing.js'

/** 插件域扩展点消费窄面（ctx `gitWorktree` 能力服务形状——缺省退独立模式默认实现） */
export interface GitWorktreeServiceFace {
  getExtensionPoints(): GitWorktreeExtensionPoints
}

/** 官方 SessionPersistence.open 消费切片（结构化窄面——零官方包 import；读侧 = 留痕反查/头读取） */
export interface SessionPersistenceFace {
  open(id: string, access: 'read' | 'write'): Promise<unknown>
}

/** 官方活会话消费切片（binding 留痕 append 面——Session.append 进程内直调的唯一入口；
 *  header = 官方只读头（session/created 触发径的 cwd 读取面）） */
export interface LiveSessionFace extends WorktreeBindAppendTarget {
  readonly header?: { readonly cwd?: string }
}

/** 官方 SessionController 消费切片（prompt/updateQueue = 发送链拦截面） */
export interface SessionControllerFace {
  prompt(request: unknown, signal?: AbortSignal): Promise<unknown>
  updateQueue?(request: unknown): Promise<unknown>
}

/** 桥服务方法白名单（run.ts createBridgeProxy 方法全集锚——RPC 边界动态调用） */
export const WORKTREE_RPC_METHODS = [
  'list',
  'create',
  'remove',
  'aheadBehind',
  'branches',
  'checks',
  'seal',
  'select',
  'selected',
  'resolve',
  'ensureWorkspace',
] as const

/** forge:worktree/* RPC 服务面（child 侧本体 / main 侧桥代理同形） */
export interface WorktreeRpcService {
  list(request: WorktreeListRequest): Promise<WorktreeListResult>
  create(request: WorktreeCreateRequest): Promise<WorktreeCreateResult>
  remove(request: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>
  aheadBehind(request: WorktreeAheadBehindRequest): Promise<WorktreeAheadBehindResult>
  branches(request: WorktreeBranchesRequest): Promise<WorktreeBranchesResult>
  checks(request: WorktreeChecksRequest): Promise<WorktreeChecksResult>
  seal(request: WorktreeSealRequest): Promise<WorktreeSealResult>
  select(request: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  selected(request: { readonly projectRoot: string }): Promise<{ readonly path?: string }>
  resolve(request: WorktreeResolveRequest): Promise<WorktreeResolveResult>
  ensureWorkspace(request: WorktreeEnsureWorkspaceRequest): Promise<WorktreeEnsureWorkspaceResult>
}

/** 官方 workspaceRegistry 消费窄面（结构化本地声明——@deepseek-ai/dsh-workspace Workspace/Registry 同形） */
export interface WorkspaceEntityFace {
  /** 官方 Workspace.id（durable）——WorktreeEntryDto.workspaceId 携带源（chip 双发） */
  readonly id: string
  /** 官方 workspace record 挂账集（durable）——attachedSessionsOf 计数单源（推导制读面） */
  readonly sessionIds: readonly string[]
  attachSession(sessionId: string): Promise<void>
  /** 官方 Workspace.setTitle（durable 改名）——存量树工作区 title 回写缝；替身可缺席 */
  setTitle?(title: string): Promise<void>
}

export interface WorkspaceRegistryFace {
  /** find-or-create：realpath 归一比对，同规范路径已存在即复用不改 title（官方 registry 面） */
  create(path: string, title?: string): Promise<WorkspaceEntityFace>
  /** 按规范路径只读解析（项目命名继承源 + 存量 title 对齐读面）；缺席 = 旧替身/降级面 */
  resolveByPath?(path: string): Promise<
    {
      readonly id: string
      readonly title: string
      readonly sessionIds: readonly string[]
      setTitle?(title: string): Promise<void>
    } | undefined
  >
}

const noGit: WorktreeListResult = { isGit: false, entries: [] }

/** G8 分流：list isGit:false 负结果按 projectRoot 会话期缓存——非 git 项目 hero 挂载/
 *  弹窗关闭不再每次白跑 git 子进程。只缓存负结果：isGit:true 面保持实时（清单必须新鲜）。 */
const noGitCache = new Map<string, WorktreeListResult>()

/**
 * 解析缓存失效缝：归属事实变更事件（registerProject/建删树）触发——两级解析缓存
 * （noGitCache 负结果 + 各服务实例 projectCache 解析记忆）清除，下次消费现跑。
 * projectRoot 缺席 = 全清（保守——重填成本低，一次性 git 探测）。
 * 实例级 projectCache 经注册器缝到达（各 createWorktreeRpcService 实例登记自己的清除
 * 闭包——闭包内 Map 模块级不可达；实例随宿主进程生灭，注册器不摘除=零泄漏面）。
 */
const resolveCacheInvalidators = new Set<(projectRoot?: string) => void>()

export function invalidateResolveCaches(projectRoot?: string): void {
  if (projectRoot === undefined) noGitCache.clear()
  else noGitCache.delete(normalizePathForCompare(projectRoot))
  for (const invalidate of resolveCacheInvalidators) invalidate(projectRoot)
}

/** 域内协作面（1.13 拆解依赖缝）：seal / healing / bind-events 经本接口单向消费 service 能力 */
export interface WorktreeServiceContext {
  /** 项目能力缓存解析（G7②——命中缓存否则走 extension points 链） */
  cachedResolve(path: string): Promise<{ projectRoot: string; projectName?: string } | null>
  /** worktree 分支解析（清单 + symbolic-ref 兜底单点） */
  resolveBranch(worktreePath: string, branch?: string): Promise<string>
  /** 在场清单现查（R5 单源——seal 判定与发送拦截回调内实时调用） */
  listPresent(projectRoot: string): Promise<readonly string[]>
  /** 会话 header 消费切片（cwd + parentSession 单读双取，逐会话记忆） */
  headerOf(sessionId: string): Promise<{ cwd?: string; parentSession?: string }>
  /** workspaceRegistry 惰性解析（healing 域消费） */
  resolveWorkspaceRegistry(): WorkspaceRegistryFace | undefined
  /** 诊断兜底出口（warn 级 fail-soft 降级告警——lib-diag 单出口） */
  warn(message: string): void
  readonly deps: WorktreeServiceDeps
}

export interface WorktreeServiceDeps {
  readonly gitWorktree?: (() => GitWorktreeServiceFace | undefined) | GitWorktreeServiceFace | undefined
  readonly sessionPersistence?: SessionPersistenceFace | undefined
  readonly workspaceRegistry?: (() => WorkspaceRegistryFace | undefined) | WorkspaceRegistryFace | undefined
  readonly listPresent?: ((projectRoot: string) => Promise<readonly string[]>) | undefined
  readonly listWorktreeEntries?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null }[]>) | undefined
  readonly listWorktreeRows?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null; detached: boolean; bare: boolean }[]>) | undefined
  readonly symbolicRefOf?: ((worktreePath: string) => Promise<string | null>) | undefined
  readonly ensureDirAcl?: ((path: string) => Promise<void>) | undefined
  readonly createWorktreeOp?: typeof createWorktree | undefined
  readonly onWorktreeSetChanged?: ((worktreePath?: string) => Promise<void> | void) | undefined
  readonly warn?: (message: string) => void
  readonly createDiag?: (message: string) => void
  readonly bindDiag?: (message: string) => void
  readonly bindWarnDiag?: (message: string) => void
  readonly debugDiag?: (message: string) => void
  readonly bindDriftDiag?: (message: string) => void
  readonly bindingMismatchEmit?: ((payload: ForgeBindingMismatchEvent) => void) | undefined
  readonly onSessionCreated?: ((handler: (sessionId: string) => void) => (() => void) | undefined) | undefined
  readonly liveSessions?: (() => { get(id: string): LiveSessionFace | undefined } | undefined) | undefined
  readonly pathPresent?: ((path: string) => boolean) | undefined
}

/**
 * child 侧服务本体装配（透传插件域 ops + 官方 sessionController/sessionPersistence 两缝）。
 * extensionPoints 缺席（gitWorktree 服务未 provide / git 未装）→ fail-soft 独立模式面：
 * list 恒零清单、resolveProject 恒 null——seal 恒未封存（能力位 false 全 UI 零注入）。
 */
export function createWorktreeRpcService(deps: WorktreeServiceDeps): WorktreeRpcService {
  // 兜底按级分流（bug 7ba48c55——diag-face-consolidation 统一口径）：本面 emit 恒 warn
  // 级（fail-soft 降级告警），缺省走 consoleDiagFallback 单出口。
  const warn = deps.warn ?? consoleDiagFallback
  // 绑定表失效锚薄封装（恒不抛——刷新失败 = 表停在旧快照，下次 boot/注册自愈）。
  const notifyWorktreeSetChanged = async (worktreePath?: string): Promise<void> => {
    if (deps.onWorktreeSetChanged === undefined) return
    try {
      await deps.onWorktreeSetChanged(worktreePath)
    } catch (cause) {
      warn(`[git-worktree] 绑定表刷新锚失败（fail-soft——表停旧快照，下次 boot/注册自愈）：${String(cause)}`)
    }
  }
  const listPresent = deps.listPresent ?? defaultListPresent
  // 重路由目标 / list present 共源活性探测（bug 4a30b193 缝——缺省 = existsSync 盘上事实）
  const presentOf = deps.pathPresent ?? defaultPathPresent
  const resolveGitWorktree = (): GitWorktreeServiceFace | undefined =>
    typeof deps.gitWorktree === 'function' ? deps.gitWorktree() : deps.gitWorktree
  const ext = (): GitWorktreeExtensionPoints =>
    resolveGitWorktree()?.getExtensionPoints() ?? {
      resolveProject: async () => null,
      getWorktreeDir: (root) => `${root}/.forge/worktrees`,
    }
  const resolveWorkspaceRegistry = (): WorkspaceRegistryFace | undefined =>
    typeof deps.workspaceRegistry === 'function' ? deps.workspaceRegistry() : deps.workspaceRegistry

  // ── G7② 项目能力缓存（resolveProject 结果按 projectRoot 会话期记忆化）──
  // 只在 gitWorktree 能力服务在场时缓存（默认独立模式扩展点恒 null——缓存会把「能力未到」
  // 冻结成永久非 git）。判非 git 直接短路 = 零会话日志读、零 git 子进程。
  // null 结果缓存（G7② 性能钉：非 git 会话每消息零固定税）；陈旧由失效缝清
  // （invalidateResolveCaches——归属事实变更事件触发），不做读时驱逐（读时驱逐与非 git
  // 零固定税互斥——非 git 会话每消息重探测即固定税）。
  const projectCache = new Map<string, Promise<{ projectRoot: string; projectName?: string } | null>>()
  const cachedResolve = (path: string): Promise<{ projectRoot: string; projectName?: string } | null> => {
    const key = normalizePathForCompare(path)
    const cached = projectCache.get(key)
    if (cached !== undefined) return cached
    const pending = ext().resolveProject(path).catch(() => null) as Promise<{ projectRoot: string; projectName?: string } | null>
    if (resolveGitWorktree() !== undefined) projectCache.set(key, pending)
    return pending
  }
  // 失效缝注册（invalidateResolveCaches 模块级出口——本实例 projectCache 闭包内不可达）
  resolveCacheInvalidators.add((projectRoot) => {
    if (projectRoot === undefined) {
      projectCache.clear()
      return
    }
    projectCache.delete(normalizePathForCompare(projectRoot))
  })

  // 会话 header 消费切片记忆（cwd + parentSession 单读双取——零事件读；逐会话一次，其后零开销）
  const headerMemo = new Map<string, { cwd?: string; parentSession?: string }>()
  const headerOf = async (sessionId: string): Promise<{ cwd?: string; parentSession?: string }> => {
    const memo = headerMemo.get(sessionId)
    if (memo !== undefined) return memo
    let header: { cwd?: string; parentSession?: string } = {}
    try {
      const handle = (await deps.sessionPersistence?.open(sessionId, 'read')) as
        | { header?: { cwd?: string; parentSession?: string }; close?: () => Promise<void> }
        | undefined
      const cwd = handle?.header?.cwd
      const parentSession = handle?.header?.parentSession
      header = {
        ...(typeof cwd === 'string' ? { cwd } : {}),
        ...(typeof parentSession === 'string' && parentSession !== '' ? { parentSession } : {}),
      }
      await handle?.close?.()
    } catch (cause) {
      // 补点（diag-milestone-coverage）：头切片读失败 = cwd/parentSession 零注入——留痕前台
      // 触发与 seal 判定对该会话降级，非零影响 → warn 不静默（缓存空切片，单会话单条）。
      warn(`[git-worktree] 会话头切片读取失败（cwd/parentSession 零注入，绑定面降级）：sessionId=${sessionId}：${String(cause)}`)
      header = {}
    }
    headerMemo.set(sessionId, header)
    return header
  }

  const ctx: WorktreeServiceContext = {
    cachedResolve,
    resolveBranch: (worktreePath, branch) => resolveBranch(worktreePath, branch),
    listPresent,
    headerOf,
    resolveWorkspaceRegistry,
    warn,
    deps,
  }

  // hero 选中树记忆（select 通道推送——chip 选中显示恢复单源；键 = 归一 projectRoot）
  const lastSelection = new Map<string, string>()

  const entryToDto = (entry: { path: string; branch: string | null; detached: boolean; bare: boolean }, projectRoot: string): WorktreeEntryDto => ({
    path: entry.path,
    branch: entry.branch,
    worktreeName: worktreeNameOf(entry.path),
    isMain: normalizePathForCompare(entry.path) === normalizePathForCompare(projectRoot),
    present: true,
    detached: entry.detached,
    bare: entry.bare,
  })

  /**
   * worktree 分支解析（attach/sessionCreate 共源——分支缺省自查 worktree list）。
   * unborn HEAD 仓库（git init 后零提交——temp fixture 形态）的 porcelain 无 branch 行
   * → 清单解析 null → 落空显式拒。兜底 = symbolic-ref 取 unborn 分支名（main 等——
   * HEAD 指向存在的分支 ref，unborn 也有合法分支名）。
   */
  const resolveBranch = async (worktreePath: string, branch?: string): Promise<string> => {
    if (branch !== undefined && branch !== '') return branch
    // 性能收口：走 G7② 缓存（consult/换绑/上一次预铸已解析过同路径 → 零 git 探测重跑）
    const resolution = await cachedResolve(worktreePath).catch(() => null)
    const root = resolution?.projectRoot ?? worktreePath
    const entries = await (deps.listWorktreeEntries ?? listWorktrees)(root).catch(() => [])
    const listed = entries.find((row) => normalizePathForCompare(row.path) === normalizePathForCompare(worktreePath))?.branch
    if (listed !== undefined && listed !== null && listed !== '') return listed
    // unborn HEAD 兜底：symbolic-ref 取 HEAD 指向的分支短名（null/探测失败一律归 '' 落空显式拒）
    const probe = deps.symbolicRefOf ?? ((p: string) => defaultSymbolicRefOf(p, deps.debugDiag))
    return (await probe(worktreePath).catch(() => '')) ?? ''
  }

  // 子域装配（编排单向依赖；seal/healing/bind-events 只经 WorktreeServiceContext 回指）
  const bind: BindEvents = createBindEvents(ctx)
  const sealStateOf: SealChannel = createSealChannel(ctx, bind)
  const healing: Healing = createHealing(ctx)

  const service: WorktreeRpcService = {
    async list(request) {
      const cacheKey = normalizePathForCompare(request.projectRoot)
      const cached = noGitCache.get(cacheKey)
      if (cached !== undefined) return cached
      const resolution = await cachedResolve(request.projectRoot)
      if (resolution === null) {
        // 只在 gitWorktree 能力服务在场时缓存负结果（cachedResolve 同判据）：单装装配态
        // 能力经异步探测 provide——探测窗口内的非 git 判定缓存会把「能力未到」冻结成
        // 永久非 git（fix-8 真机 009 铁证径）。
        if (resolveGitWorktree() !== undefined) noGitCache.set(cacheKey, noGit)
        return noGit
      }
      const [entries, dir] = await Promise.all([
        (deps.listWorktreeRows ?? listWorktrees)(resolution.projectRoot),
        Promise.resolve(ext().getWorktreeDir(resolution.projectRoot)),
      ])
      // present 兑现盘上事实（bug 4a30b193 UI 面）：git 清单在 prune 前保留已删树陈旧行
      // ——UI 陈旧选中自愈判定源 = existsSync 盘上实存（与重路由活性同源 presentOf）
      const dtos = entries.map((entry) => ({ ...entryToDto(entry, resolution.projectRoot), present: presentOf(entry.path) }))
      // A6（binding-derivation 流程 A）：workspaceId 随行——present 行 resolveByPath 只读解析
      const workspaceIds = await Promise.all(
        dtos.map((dto) => (dto.present ? healing.resolveWorkspaceId(dto.path) : Promise.resolve(undefined))),
      )
      const entriesWithIds = dtos.map((dto, i) => ({ ...dto, workspaceId: workspaceIds[i] }))
      healing.healWorkspaceTitles(resolution, entriesWithIds)
      return {
        isGit: true,
        worktreeDir: dir,
        entries: entriesWithIds,
      }
    },

    /**
     * 点选懒物化：无 workspace 记录的树（git 手建/流程 A 前老树——list resolveByPath
     * 只读解析不物化）点选时点幂等 find-or-create 官方 workspace 记录，客户端拿 id 走
     * 官方 openWorkspace 显式传参。盘上缺席 = 不物化（防幽灵记录）；registry 缺席/失败
     * = workspaceId undefined fail-soft（点选链退显示态不阻断）。
     */
    async ensureWorkspace(request: WorktreeEnsureWorkspaceRequest): Promise<WorktreeEnsureWorkspaceResult> {
      const wsRegistry = resolveWorkspaceRegistry()
      if (wsRegistry === undefined || !existsSync(request.path)) return { workspaceId: undefined }
      try {
        const workspace = await wsRegistry.create(request.path, worktreeNameOf(request.path))
        return { workspaceId: workspace.id }
      } catch (cause) {
        const message = `[git-worktree] workspace 懒物化失败（fail-soft——点选退显示态）：${request.path}：${String(cause)}`
        warn(message)
        deps.createDiag?.(message)
        return { workspaceId: undefined }
      }
    },

    async create(request) {
      // A′（bug f9a23367）：树目录预铸——先建空目录并在此刻补可继承 ACE（空目录上 grant
      // 毫秒级），git worktree add 检出的每个文件出生即继承。非空/已存在路径不授权
      // （createWorktree 按 path-exists 拒）。
      try {
        if (!existsSync(request.path)) mkdirSync(request.path, { recursive: true })
        if (readdirSync(request.path).length === 0) {
          await (deps.ensureDirAcl ?? ((p: string) => defaultEnsureDirAcl(p, undefined, deps.debugDiag)))(request.path).catch((cause: unknown) => {
            warn(`[git-worktree] 预铸目录 ACL 补权失败（fail-soft——沙箱拒绝时走 diagnose 技能）：${String(cause)}`)
          })
        }
      } catch (cause) {
        warn(`[git-worktree] 预铸目录创建失败（fail-soft——git 自建目录路径不受影响）：${String(cause)}`)
      }
      const entry = await (deps.createWorktreeOp ?? createWorktree)(request.projectRoot, {
        branch: request.branch,
        path: request.path,
        base: request.base,
      })
      // A4（binding-derivation 流程 A）：官方 workspace 前移创建——幂等 find-or-create
      // （realpath 归一，title 仅新建时生效）。失败 fail-soft 不回滚 git 树（官方 create
      // 幂等，下次 list / find-or-create 自愈补齐），emitDiag('worktree-create', warn)。
      let workspaceId: string | undefined
      const wsRegistry = resolveWorkspaceRegistry()
      if (wsRegistry !== undefined) {
        try {
          workspaceId = (await wsRegistry.create(request.path, worktreeNameOf(request.path))).id
        } catch (cause) {
          const message = `[git-worktree] 官方 workspace 前移创建失败（fail-soft——不回滚 git 树，下次 find-or-create 自愈）：${request.path}：${String(cause)}`
          warn(message)
          deps.createDiag?.(message)
        }
      }
      await notifyWorktreeSetChanged(request.path) // 绑定表失效锚：新树路径即需路由行
      return { entry: { ...entryToDto(entry, request.projectRoot), workspaceId } }
    },

    async remove(request) {
      const result = await deleteWorktree(request.projectRoot, request.path, async () => true)
      await notifyWorktreeSetChanged(request.path) // 绑定表失效锚：被删路径旧行随全量重写即时消失
      return { removed: result.removed }
    },

    async aheadBehind(request) {
      const entries = await listWorktrees(request.projectRoot)
      const entry = entries.find((row) => normalizePathForCompare(row.path) === normalizePathForCompare(request.path))
      if (entry === undefined || entry.branch === null) return { counts: null }
      // cwd 纪律（1.19 审计）：ahead/behind = 树级操作——cwd = 目标 worktree 路径
      const counts = await aheadBehindOp(request.path, entry.branch).catch(() => null)
      return { counts }
    },

    async branches(request) {
      const [branches, fallback] = await Promise.all([
        listBranches(request.projectRoot).catch(() => [] as string[]),
        defaultBranchOp(request.projectRoot).catch(() => 'main'),
      ])
      return { branches, defaultBranch: fallback }
    },

    async checks(request) {
      const [status, entries, attachedSessions] = await Promise.all([
        worktreeStatus(request.path).catch(() => ({ dirtyCount: 0 })),
        listWorktrees(request.projectRoot).catch(() => []),
        healing.attachedSessionsOf(request.path),
      ])
      const entry = entries.find((row) => normalizePathForCompare(row.path) === normalizePathForCompare(request.path))
      const ahead = entry?.branch !== undefined && entry?.branch !== null
        // cwd 纪律（1.19 审计）：ahead/behind = 树级操作——cwd = 目标 worktree 路径
        ? await aheadBehindOp(request.path, entry.branch).catch(() => null)
        : null
      return {
        dirtyCount: status.dirtyCount,
        aheadCount: ahead?.ahead ?? 0,
        attachedSessions,
      }
    },

    async select(request) {
      const key = normalizePathForCompare(request.projectRoot)
      if (request.path === undefined || request.path === '') lastSelection.delete(key)
      else lastSelection.set(key, request.path)
      return { ok: true }
    },

    // 选中态读镜像（host 唯一事实源——chip 回填正门）。
    // 无活性检查：读取是显示层消费（陈旧选中由 web 陈旧自愈 + consult 摘除各自兜底）。
    async selected(request) {
      return { path: lastSelection.get(normalizePathForCompare(request.projectRoot)) }
    },

    // 批量归属解析（身份归并单点——hero 编排/必绑拦截同一 resolveProject 基础设施；
    // web 归属消费面加载时一次梳理，客户端零仲裁副本）。逐路径独立解析，未解析
    // （非 git/未注册/失败）不进结果；路径经 cachedResolve 会话期缓存。
    async resolve(request) {
      const resolved: WorktreeResolveEntry[] = []
      for (const rawPath of request.paths) {
        const path = await realpath(rawPath).catch(() => rawPath)
        const resolution = await cachedResolve(path).catch(() => null)
        if (resolution === null) continue
        resolved.push({
          path: rawPath,
          projectId: (resolution as { projectId?: string }).projectId ?? '',
          projectRoot: resolution.projectRoot,
          projectName: (resolution as { projectName?: string }).projectName ?? '',
        })
      }
      return { resolved }
    },

    seal: sealStateOf,
  }

  return service
}
