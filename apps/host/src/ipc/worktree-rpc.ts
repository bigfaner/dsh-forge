// forge:worktree/* 通道族（worktree-branch-management fix-2——装配缺口承接）。
// 三处一体落点：contracts WORKTREE_CHANNELS → web/rpc client → 本文件注册面。
// 域实现 = packages/plugins/git-worktree（通用层 ops/session-attach/seal-guard）——host
// ipc 装配透传（typed 载荷直通插件域，零业务逻辑停留）。
// 三职责：
//   · WorktreeRpcService（child 侧服务本体）：ops 封装 + 挂靠事件唯一写入口调用点 +
//     建会话预铸采纳（persistence.create 预铸 + controller.create adopt——1.16，单写者
//     零交叠）+ 封存判定快照；
//   · registerWorktreeChannels（main 侧 ipc 注册——m2-wiring 单行编排位）；
//   · interceptSessionSends（child 侧发送拦截——assertSendable 接入 host 消息处理链：
//     sessionController.prompt/updateQueue 前置封存校验，封存会话 host 拒绝 + 明确错误提示）。
import { realpath } from 'node:fs/promises'
import {
  WORKTREE_CHANNELS,
  type WorktreeAheadBehindRequest,
  type WorktreeAheadBehindResult,
  type WorktreeBranchesRequest,
  type WorktreeBranchesResult,
  type WorktreeChecksRequest,
  type WorktreeChecksResult,
  type WorktreeCreateRequest,
  type WorktreeCreateResult,
  type WorktreeDeleteRequest,
  type WorktreeDeleteResult,
  type WorktreeEntryDto,
  type WorktreeListRequest,
  type WorktreeListResult,
  type WorktreeSealRequest,
  type WorktreeSealResult,
  type WorktreeSelectRequest,
  type WorktreeSelectResult,
  type WorktreeSessionCreateRequest,
  type WorktreeSessionCreateResult,
} from '@dsh-forge/contracts'
import {
  createWorktree,
  preseedWorktreeSession,
  readLatestAttach,
  type SessionPersistenceCreateFace,
  defaultBranch as defaultBranchOp,
  deleteWorktree,
  aheadBehind as aheadBehindOp,
  listBranches,
  listWorktrees,
  worktreeStatus,
  assertSendable,
  evaluateSeal,
  type GitWorktreeExtensionPoints,
} from '@dsh-forge/git-worktree'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 插件域扩展点消费窄面（ctx `gitWorktree` 能力服务形状——缺省退独立模式默认实现） */
export interface GitWorktreeServiceFace {
  getExtensionPoints(): GitWorktreeExtensionPoints
}

/** 官方 SessionPersistence.open 消费切片（结构化窄面——零官方包 import；create = 1.16 预铸面） */
export interface SessionPersistenceFace {
  open(id: string, access: 'read' | 'write'): Promise<unknown>
  /** 预铸新持久会话（header 契约：id + createdAt + cwd + version 当前格式版 + isSeeded:false + agentPreset 可选；返回初始写句柄） */
  create(header: {
    readonly id: string
    readonly createdAt: number
    readonly cwd: string
    readonly version: number
    readonly isSeeded: boolean
    readonly agentPreset?: string
  }): Promise<unknown>
}

/** 官方 SessionController 消费切片（create = sessionId 携带即官方 adopt/resume 单门；prompt/updateQueue = 发送链） */
export interface SessionControllerFace {
  create(request: {
    readonly sessionId?: string
    readonly cwd?: string
    readonly workspaceId?: string
  }): Promise<{ readonly sessionId: string }>
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
  'sessionCreate',
  'seal',
  'select',
] as const

/** forge:worktree/* RPC 服务面（child 侧本体 / main 侧桥代理同形） */
export interface WorktreeRpcService {
  list(request: WorktreeListRequest): Promise<WorktreeListResult>
  create(request: WorktreeCreateRequest): Promise<WorktreeCreateResult>
  remove(request: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>
  aheadBehind(request: WorktreeAheadBehindRequest): Promise<WorktreeAheadBehindResult>
  branches(request: WorktreeBranchesRequest): Promise<WorktreeBranchesResult>
  checks(request: WorktreeChecksRequest): Promise<WorktreeChecksResult>
  sessionCreate(request: WorktreeSessionCreateRequest): Promise<WorktreeSessionCreateResult>
  seal(request: WorktreeSealRequest): Promise<WorktreeSealResult>
  select(request: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  /** host 必绑拦截 guard 面（1.30——非 RPC：sessionController/sessionPersistence 在场才有） */
  requiredBindingGuard(): RequiredBindingGuardFace | undefined
}

/** 必绑拦截 guard 面（judge/reroute——interceptRequiredBinding 消费） */
export interface RequiredBindingGuardFace {
  /** 'pass' = 放行；'route' = 无绑定 blank（必绑拦截命中）→ reroute */
  judge(sessionId: string): Promise<'pass' | 'route'>
  /** 编排（等待既有在途产物）+ 以原消息内容 prompt 产物会话；失败显式报错 */
  reroute(sessionId: string, request: unknown): Promise<unknown>
}

/** 官方 workspaceRegistry 消费窄面（结构化本地声明——@deepseek-ai/dsh-workspace Workspace/Registry 同形） */
export interface WorkspaceEntityFace {
  attachSession(sessionId: string): Promise<void>
  /** 官方 Workspace.setTitle（durable 改名）——存量树工作区 title 回写缝；替身可缺席 */
  setTitle?(title: string): Promise<void>
}

export interface WorkspaceRegistryFace {
  /** find-or-create：realpath 归一比对，同规范路径已存在即复用不改 title（官方 registry 面） */
  create(path: string, title?: string): Promise<WorkspaceEntityFace>
  /** 按规范路径只读解析（项目命名继承源）；缺席 = 旧替身/降级面 */
  resolveByPath?(path: string): Promise<{ readonly title: string } | undefined>
}

const noGit: WorktreeListResult = { isGit: false, entries: [] }

/** G8 分流（bug 925c96d5 核验补强）：list isGit:false 负结果按 projectRoot 会话期缓存——
 *  非 git 项目 hero 挂载/弹窗关闭不再每次白跑 git 子进程（resolveProject 探测）。
 *  只缓存负结果：isGit:true 面保持实时（worktree 清单必须新鲜）。 */
const noGitCache = new Map<string, WorktreeListResult>()

const worktreeNameOf = (path: string): string => path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path

/** 路径比对归一口径（seal-guard.normalizePathForCompare 同判——本地镜像零回环） */
const norm = (path: string): string => path.replaceAll('\\', '/').toLowerCase()

/**
 * child 侧服务本体装配（透传插件域 ops + 官方 sessionController/sessionPersistence 两缝）。
 * extensionPoints 缺席（gitWorktree 服务未 provide / git 未装）→ fail-soft 独立模式面：
 * list 恒零清单、resolveProject 恒 null——seal 恒未封存（能力位 false 全 UI 零注入）。
 */
export function createWorktreeRpcService(deps: {
  /** 插件能力服务（gitWorktree——提供者惰性求值：服务 provide 晚于装配可达；缺席 = 独立模式默认扩展点） */
  readonly gitWorktree?: (() => GitWorktreeServiceFace | undefined) | GitWorktreeServiceFace | undefined
  readonly sessionController?: SessionControllerFace | undefined
  readonly sessionPersistence?: SessionPersistenceFace | undefined
  /** 官方 workspaceRegistry（惰性取法注入缝；缺席 = 旧环境零归属面降级） */
  readonly workspaceRegistry?: (() => WorkspaceRegistryFace | undefined) | WorkspaceRegistryFace | undefined
  /** 在场清单注入缝（单测替身；缺省 = 插件域 listWorktrees 真机 git） */
  readonly listPresent?: ((projectRoot: string) => Promise<readonly string[]>) | undefined
  /** worktree 清单注入缝（branch 解析面——缺省 = 插件域 listWorktrees 真机 git） */
  readonly listWorktreeEntries?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null }[]>) | undefined
  /** 默认 agentPreset 解析缝（官方 agentPresets registry——缺席/拒绝 = 头缺席零猜测，bug eae18b5c） */
  readonly resolveDefaultPreset?: (() => Promise<string | undefined>) | undefined
  readonly warn?: (message: string) => void
}): WorktreeRpcService {
  const warn = deps.warn ?? console.warn
  const listPresent =
    deps.listPresent ??
    ((root: string) => listWorktrees(root).then((entries) => entries.map((entry) => entry.path)))
  const resolveGitWorktree = (): GitWorktreeServiceFace | undefined =>
    typeof deps.gitWorktree === 'function' ? deps.gitWorktree() : deps.gitWorktree
  const ext = (): GitWorktreeExtensionPoints =>
    resolveGitWorktree()?.getExtensionPoints() ?? {
      resolveProject: async () => null,
      getWorktreeDir: (root) => `${root}/.forge/worktrees`,
    }
  const readFactory = {
    openRead: async (sessionId: string) => deps.sessionPersistence?.open(sessionId, 'read') as never,
  }

  const resolveWorkspaceRegistry = (): WorkspaceRegistryFace | undefined =>
    typeof deps.workspaceRegistry === 'function' ? deps.workspaceRegistry() : deps.workspaceRegistry

  // ── G7② 项目能力缓存（resolveProject 结果按 projectRoot 会话期记忆化）──
  // 只在 gitWorktree 能力服务在场时缓存（默认独立模式扩展点恒 null——缓存会把「能力未到」
  // 冻结成永久非 git）。判非 git 直接短路 = 零会话日志读、零 git 子进程。
  const projectCache = new Map<string, Promise<{ projectRoot: string } | null>>()
  const cachedResolve = (path: string): Promise<{ projectRoot: string } | null> => {
    const key = norm(path)
    const cached = projectCache.get(key)
    if (cached !== undefined) return cached
    const pending = ext().resolveProject(path).catch(() => null) as Promise<{ projectRoot: string } | null>
    if (resolveGitWorktree() !== undefined) projectCache.set(key, pending)
    return pending
  }

  // 会话 cwd 记忆（读句柄 header 消费切片——零事件读；逐会话一次，其后零开销）
  const cwdMemo = new Map<string, string | undefined>()
  const sessionCwdOf = async (sessionId: string): Promise<string | undefined> => {
    if (cwdMemo.has(sessionId)) return cwdMemo.get(sessionId)
    let cwd: string | undefined
    try {
      const handle = (await deps.sessionPersistence?.open(sessionId, 'read')) as
        | { header?: { cwd?: string }; close?: () => Promise<void> }
        | undefined
      cwd = handle?.header?.cwd
      await handle?.close?.()
    } catch {
      cwd = undefined
    }
    cwdMemo.set(sessionId, cwd)
    return cwd
  }

  /** blank 判读（设计 §11 假设 5：blank = 首个 turn/start 前的投影语义——日志内全部事件
   *  ignorable 即 blank；预铸挂靠事件会话天然命中）。读失败 = 非 blank（fail-closed 不误重路由）。 */
  const blankOf = async (sessionId: string): Promise<boolean> => {
    try {
      const handle = await readFactory.openRead(sessionId)
      try {
        const events = (await (handle as { read?: () => Promise<{ events?: readonly unknown[] }> }).read?.())?.events ?? []
        return events.every((event) => (event as { ignorable?: boolean } | null)?.ignorable === true)
      } finally {
        await (handle as { close?: () => Promise<void> }).close?.()
      }
    } catch {
      return false
    }
  }

  // hero 选中树记忆（select 通道推送——重路由目标单源；键 = 归一 projectRoot）
  const lastSelection = new Map<string, string>()

  // G3 双建互斥（host 重路由 × client arm 共享互斥面）：sessionCreate 按 cwd 归一键记忆
  // 产物 Promise——并发调用共享同一在途编排（等待编排完成），已产物 blank 会话直接复用
  // （每 cwd 至多一个 blank 产物）；产物已非 blank（真实使用过）→ 除名允许新建。
  const sessionProducts = new Map<string, Promise<WorktreeSessionCreateResult>>()

  /** 会话工作区归属（bug 925c96d5 根因级修复）：以树路径 find-or-create 官方工作区
   *  （registry.create realpath 归一比对——契约条件 header.cwd realpath ≡ workspace.path
   *  对 cwd=树路径的会话天然成立）→ attachSession。主行（cwd=项目根）同径挂主工作区。
   *  fail-soft：registry 缺席/失败只 warn——不阻断预铸采纳主链（会话本体已可用）。 */
  const attachWorkspace = async (worktreePath: string, sessionId: string): Promise<void> => {
    const registry = resolveWorkspaceRegistry()
    if (registry === undefined) return
    try {
      // bug 4eab48ea：树工作区标题继承项目命名——官方 chip 文案 = workspace.title（槽外不可
      // 改制），主工作区 title = 项目名（fix-24 ② 链），resolveByPath(项目根) 只读取同源；
      // 映射缺席回退树名（旧行为零猜测）。
      const projectRoot = (await cachedResolve(worktreePath).catch(() => null))?.projectRoot
      const mainTitle =
        projectRoot !== undefined
          ? await registry.resolveByPath?.(projectRoot).then((row) => row?.title).catch(() => undefined)
          : undefined
      const workspace = await registry.create(worktreePath, mainTitle ?? worktreeNameOf(worktreePath))
      // 存量 healing：create 对已存在工作区复用不改 title（官方语义）——项目命名继承须
      // 经 setTitle 显式回写，否则修复前建的树工作区永久树名（hero 项目 chip 跟随树名）。
      if (mainTitle !== undefined) await workspace.setTitle?.(mainTitle)
      await workspace.attachSession(sessionId)
    } catch (cause) {
      warn(`[git-worktree] 工作区归属挂接失败（会话本体不受影响）：${String(cause)}`)
    }
  }

  const entryToDto = (entry: { path: string; branch: string | null; detached: boolean; bare: boolean }, projectRoot: string): WorktreeEntryDto => ({
    path: entry.path,
    branch: entry.branch,
    worktreeName: worktreeNameOf(entry.path),
    isMain: norm(entry.path) === norm(projectRoot),
    present: true,
    detached: entry.detached,
    bare: entry.bare,
  })

  /** 挂靠会话反查（checks/seal 共用——sessionPersistence.list 全量扫尾部，best-effort cap 200） */
  const attachedSessionsOf = async (path: string): Promise<number> => {
    const persistence = deps.sessionPersistence as { list?: () => Promise<unknown> } | undefined
    if (persistence === undefined || typeof persistence.list !== 'function') return 0
    try {
      const listed = await persistence.list()
      // 官方 SessionPersistence.list 返回 SessionPersistenceSnapshot[]（header.id）；
      // 兼容 {ids} 形态（历史替身）。
      const ids = (
        Array.isArray(listed)
          ? listed.map((row) => (row as { header?: { id?: unknown } } | null)?.header?.id ?? row)
          : ((listed as { ids?: readonly unknown[] } | null)?.ids ?? [])
      ) as readonly unknown[]
      let count = 0
      for (const id of ids.slice(0, 200)) {
        const binding = await readLatestAttach(String(id), readFactory).catch(() => null)
        if (binding !== null && norm(binding.worktreePath) === norm(path)) count += 1
      }
      return count
    } catch (cause) {
      warn(`[git-worktree] 挂靠会话反查失败（拦截检查降级 0）：${String(cause)}`)
      return 0
    }
  }

  /** 封存判定快照（seal 通道 + 发送拦截共源）。
   *  cwd 强制守护（1.19）：readLatestAttach 校验 SessionHeader.cwd ≡ 绑定 worktreePath，
   *  漂移即 SessionCwdMismatchError 显式上抛（RPC 错误面回传 web）——不做静默降级。
   *  G7② 判序反转：request.cwd 在场时先查项目能力缓存——判非 git 直接返回（零会话日志读）；
   *  有绑定会话仍先读日志（绑定即 git 事实）。 */
  const sealStateOf = async (request: WorktreeSealRequest): Promise<WorktreeSealResult> => {
    if (request.cwd !== undefined) {
      const resolution = await cachedResolve(request.cwd)
      if (resolution === null) return { isGit: false, sealed: false, binding: null }
    }
    const binding = await readLatestAttach(request.sessionId, readFactory).catch((cause: unknown) => {
      if ((cause as Error)?.name === 'SessionCwdMismatchError') throw cause
      return null
    })
    if (binding === null) return { isGit: false, sealed: false, binding: null }
    const resolution = await cachedResolve(binding.worktreePath)
    if (resolution === null) return { isGit: false, sealed: false, binding: { worktreePath: binding.worktreePath, branch: binding.branch } }
    const present = await listPresent(resolution.projectRoot).catch(() => [] as string[])
    const decision = evaluateSeal(binding, present)
    return {
      isGit: true,
      sealed: decision.sealed,
      binding: { worktreePath: binding.worktreePath, branch: binding.branch },
      projectRoot: resolution.projectRoot,
      worktreeName: worktreeNameOf(binding.worktreePath),
    }
  }

  /** worktree 分支解析（attach/sessionCreate 共源——分支缺省自查 worktree list） */
  const resolveBranch = async (worktreePath: string, branch?: string): Promise<string> => {
    if (branch !== undefined && branch !== '') return branch
    const resolution = await ext().resolveProject(worktreePath).catch(() => null)
    const root = resolution?.projectRoot ?? worktreePath
    const entries = await (deps.listWorktreeEntries ?? listWorktrees)(root).catch(() => [])
    return entries.find((row) => norm(row.path) === norm(worktreePath))?.branch ?? ''
  }

  const service: WorktreeRpcService = {
    async list(request) {
      const cacheKey = norm(request.projectRoot)
      const cached = noGitCache.get(cacheKey)
      if (cached !== undefined) return cached
      const resolution = await cachedResolve(request.projectRoot)
      if (resolution === null) {
        noGitCache.set(cacheKey, noGit)
        return noGit
      }
      const [entries, dir] = await Promise.all([
        listWorktrees(resolution.projectRoot),
        Promise.resolve(ext().getWorktreeDir(resolution.projectRoot)),
      ])
      return {
        isGit: true,
        worktreeDir: dir,
        entries: entries.map((entry) => entryToDto(entry, resolution.projectRoot)),
      }
    },

    async create(request) {
      const entry = await createWorktree(request.projectRoot, {
        branch: request.branch,
        path: request.path,
        base: request.base,
      })
      return { entry: entryToDto(entry, request.projectRoot) }
    },

    async remove(request) {
      const result = await deleteWorktree(request.projectRoot, request.path, async () => true)
      return { removed: result.removed }
    },

    async aheadBehind(request) {
      const entries = await listWorktrees(request.projectRoot)
      const entry = entries.find((row) => norm(row.path) === norm(request.path))
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
        attachedSessionsOf(request.path),
      ])
      const entry = entries.find((row) => norm(row.path) === norm(request.path))
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

    async sessionCreate(request) {
      const key = norm(request.worktreePath)
      // G3 互斥复用：在途编排共享等待；既有 blank 产物直接复用
      for (;;) {
        const existing = sessionProducts.get(key)
        if (existing === undefined) break
        const reused = await existing
        if (await blankOf(reused.sessionId)) return reused
        sessionProducts.delete(key) // 产物已被真实使用（非 blank）→ 允许新建
      }
      const pending = doSessionCreate(request)
      sessionProducts.set(key, pending)
      try {
        return await pending
      } catch (cause) {
        sessionProducts.delete(key)
        throw cause
      }
    },

    async select(request) {
      const key = norm(request.projectRoot)
      if (request.path === undefined || request.path === '') lastSelection.delete(key)
      else lastSelection.set(key, request.path)
      return { ok: true }
    },

    requiredBindingGuard() {
      if (deps.sessionController === undefined || deps.sessionPersistence === undefined) return undefined
      const controller = deps.sessionController
      return {
        // 判据（设计 §7）：git 项目 ∧ 目标会话 blank ∧ 无绑定（G2 同树也不放行）；
        // cwd 漂移（SessionCwdMismatchError）原样上抛 = 拒绝（A5）；非 blank 既有会话零打扰。
        judge: async (sessionId) => {
          const cwd = await sessionCwdOf(sessionId)
          if (cwd === undefined || cwd === '') return 'pass'
          const resolution = await cachedResolve(cwd)
          if (resolution === null) return 'pass' // 非 git：零行为差异（G7 分流）
          let binding: { worktreePath: string; branch: string } | null
          try {
            binding = await readLatestAttach(sessionId, readFactory)
          } catch (cause) {
            if ((cause as Error)?.name === 'SessionCwdMismatchError') throw cause // A5 拒绝
            return 'pass' // 判读链异常 fail-open（正确性不依赖此径）
          }
          if (binding !== null) return 'pass'
          return (await blankOf(sessionId)) ? 'route' : 'pass'
        },
        // 编排（与 client arm 共享 sessionCreate 互斥面——在途即等待）+ 重路由：
        // 目标 = hero 选中树（select 推送记忆）缺席回退会话 cwd 树；原消息内容保真换绑。
        reroute: async (sessionId, request) => {
          const cwd = await sessionCwdOf(sessionId)
          const resolution = cwd !== undefined && cwd !== '' ? await cachedResolve(cwd) : null
          const selected = resolution !== null ? lastSelection.get(norm(resolution.projectRoot)) : undefined
          const target = selected ?? (cwd !== undefined && cwd !== '' ? cwd : undefined)
          if (target === undefined) throw new Error('worktree 必绑重路由失败：会话 cwd 缺席且无选中树')
          // 走 sessionCreate 公开面（G3 双建互斥：在途共享、产物 blank 复用）——直调
          // doSessionCreate 会绕过互斥，与 client arm 并发时同 cwd 双建。
          const product = await service.sessionCreate({ worktreePath: target })
          return controller.prompt({ ...(request as Record<string, unknown>), sessionId: product.sessionId })
        },
      }
    },

    seal: sealStateOf,
  }

  /** 预铸采纳单会话创建（1.16 配方本体——G3 互斥面与 guard 共用的原始创建径） */
  async function doSessionCreate(request: WorktreeSessionCreateRequest): Promise<WorktreeSessionCreateResult> {
    const controller = deps.sessionController
    if (controller === undefined) throw new Error('sessionController 缺席（host 装配漂移）——无法以 worktree cwd 建会话')
    const persistence: SessionPersistenceFace | undefined = deps.sessionPersistence
    if (persistence === undefined || typeof persistence.create !== 'function') {
      throw new Error('sessionPersistence 缺席或缺 create 面（host 装配漂移）——预铸采纳配方不可用')
    }
    // A12 入头前 realpath 归一（第四维）：subst/junction/symlink/8.3 短名/大小写拼写收敛为
    // 磁盘真值——与官方 attachSession「header.cwd realpath ≡ workspace.path」比对口径对齐，
    // 预铸头与后续比对不再漂移。可达则归一、失败 fail-soft 回退原拼写（canonicalizeDir 同判）。
    const cwd = await realpath(request.worktreePath).catch(() => request.worktreePath)
    const branch = await resolveBranch(cwd)
    // 1.16 预铸采纳配方（Root cause: 官方 agent loop 自 controller.create 起即持有会话
    // 唯一写句柄——建会话后另开写句柄补写挂靠事件在活会话上结构性不可行）。改为：先
    // persistence.create 预铸（自铸 id + cwd 头）→ 初始句柄写挂靠事件（seq 0, ignorable）
    // → flush + close，再 controller.create({sessionId, cwd}) 官方 adopt/resume——写句柄
    // 生命周期零交叠，单写者铁律满足。
    // bug eae18b5c：预铸头自携默认 agentPreset（官方 composeAgent 同径——registry defaultId）；
    // 解析失败零猜测（头缺席），不阻断预铸主链。
    const agentPreset = await deps.resolveDefaultPreset?.().catch(() => undefined)
    const preseeded = await preseedWorktreeSession(
      persistence as unknown as SessionPersistenceCreateFace,
      {
        worktreePath: cwd,
        branch,
      },
      agentPreset === undefined ? {} : { agentPreset },
    )
    await controller.create({ sessionId: preseeded.sessionId, cwd })
    // bug 925c96d5：预铸采纳后即挂工作区归属（composer 门控/模式/侧栏可见性的官方单源）
    await attachWorkspace(cwd, preseeded.sessionId)
    return { sessionId: preseeded.sessionId, branch }
  }

  return service
}

/** forge:worktree/* 通道注册（负载映射 = contracts dto/worktree.ts，键键对应） */
export function registerWorktreeChannels(ipc: ForgeIpc, service: WorktreeRpcService): void {
  ipc.register(WORKTREE_CHANNELS.list, rpcEnvelope((q: WorktreeListRequest) => service.list(q)))
  ipc.register(WORKTREE_CHANNELS.create, rpcEnvelope((q: WorktreeCreateRequest) => service.create(q)))
  ipc.register(WORKTREE_CHANNELS.delete, rpcEnvelope((q: WorktreeDeleteRequest) => service.remove(q)))
  ipc.register(WORKTREE_CHANNELS.aheadBehind, rpcEnvelope((q: WorktreeAheadBehindRequest) => service.aheadBehind(q)))
  ipc.register(WORKTREE_CHANNELS.branches, rpcEnvelope((q: WorktreeBranchesRequest) => service.branches(q)))
  ipc.register(WORKTREE_CHANNELS.checks, rpcEnvelope((q: WorktreeChecksRequest) => service.checks(q)))
  ipc.register(WORKTREE_CHANNELS.sessionCreate, rpcEnvelope((q: WorktreeSessionCreateRequest) => service.sessionCreate(q)))
  ipc.register(WORKTREE_CHANNELS.seal, rpcEnvelope((q: WorktreeSealRequest) => service.seal(q)))
  ipc.register(WORKTREE_CHANNELS.select, rpcEnvelope((q: WorktreeSelectRequest) => service.select(q)))
}

/**
 * 发送拦截接线（child 侧——「不可发送」的硬保证）：sessionController.prompt / updateQueue
 * 前置 assertSendable（挂靠 worktree 不在场 → SessionSealedError——host 拒绝 + 明确错误
 * 提示经官方 Remote 错误面回传 composer）。无绑定会话 / 封存判读失败 = 放行（fail-open
 * ——拦截面只对「确认封存」的会话生效，判定异常不阻断正常发送）。返回补撤销面（wrap
 * 替换官方实例方法——装配级恢复原方法引用）。
 */
export function interceptSessionSends(
  controller: SessionControllerFace,
  sealOf: (sessionId: string) => Promise<WorktreeSealResult>,
  warn: (message: string) => void = console.warn,
): () => void {
  const originals: Array<[string, unknown]> = []
  const wrap = (methodName: 'prompt' | 'updateQueue'): void => {
    const original = (controller as unknown as Record<string, unknown>)[methodName]
    if (typeof original !== 'function') return
    const bound = (original as (...args: unknown[]) => unknown).bind(controller)
    const wrapped = async (...args: unknown[]): Promise<unknown> => {
      const request = args[0] as { sessionId?: unknown } | undefined
      const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : undefined
      if (sessionId !== undefined) {
        try {
          const state = await sealOf(sessionId)
          assertSendable({ sealed: state.sealed })
        } catch (cause) {
          // SessionSealedError / SessionCwdMismatchError 原样上抛（明确错误提示——A5：cwd
          // 漂移改拒绝不放行）；其余判读链异常 fail-open 放行
          const name = (cause as Error)?.name
          if (name === 'SessionSealedError' || name === 'SessionCwdMismatchError') throw cause
          warn(`[git-worktree] 发送拦截判读失败（fail-open 放行）：${String(cause)}`)
        }
      }
      return bound(...args)
    }
    ;(controller as unknown as Record<string, unknown>)[methodName] = wrapped
    originals.push([methodName, original])
  }
  wrap('prompt')
  wrap('updateQueue')
  return () => {
    for (const [name, original] of originals) {
      ;(controller as unknown as Record<string, unknown>)[name] = original
    }
  }
}

/**
 * 1.30 第二层 prompt 拦截（必绑 + 重路由）——叠加现役 interceptSessionSends 之上（官方
 * commands.prompt 调用时属性查找：本层先于封存层执行，judge 'route' 时以 guard.reroute
 * 的 promise 替代原发送；dispose 恢复封存层包装 = 逆序撤销安全）。
 * 判读链异常 fail-open 放行；SessionCwdMismatchError（A5）与重路由失败显式拒绝。
 */
export function interceptRequiredBinding(
  controller: SessionControllerFace,
  guard: RequiredBindingGuardFace,
  warn: (message: string) => void = console.warn,
): () => void {
  const original = (controller as unknown as Record<string, unknown>)['prompt']
  if (typeof original !== 'function') return () => {}
  const bound = (original as (...args: unknown[]) => unknown).bind(controller)
  const wrapped = async (...args: unknown[]): Promise<unknown> => {
    const request = args[0] as { sessionId?: unknown } | undefined
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : undefined
    if (sessionId !== undefined) {
      try {
        if ((await guard.judge(sessionId)) === 'route') {
          // 拒绝原发送：编排（等待既有在途产物）后以原消息内容 prompt 产物会话
          return guard.reroute(sessionId, request)
        }
      } catch (cause) {
        const name = (cause as Error)?.name
        if (name === 'SessionCwdMismatchError') throw cause // A5：拒绝不放行
        warn(`[git-worktree] 必绑拦截判读失败（fail-open 放行）：${String(cause)}`)
      }
    }
    return bound(...args)
  }
  ;(controller as unknown as Record<string, unknown>)['prompt'] = wrapped
  return () => {
    ;(controller as unknown as Record<string, unknown>)['prompt'] = original
  }
}
