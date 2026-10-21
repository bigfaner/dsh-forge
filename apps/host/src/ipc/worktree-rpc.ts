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
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { promisify } from 'node:util'
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
  type WorktreeResolveRequest,
  type WorktreeResolveEntry,
  type WorktreeResolveResult,
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
import { createGitIdentityPort } from '@dsh-forge/core'

/**
 * W2 能力缺席显式拒绝（fail-closed 收口）：gitWorktree 能力缺席（child 60s 放弃盖
 * guardState:'absent'）且 core git 探针有锚（= git 项目）时，sessionCreate / prompt 两入口
 * 同抛本错误——code ∈ contracts ERROR_CODES（sessionCreate 径经 rpcEnvelope 序列化 → 前端
 * RpcClientError → Toast）；prompt 径经官方 Remote 错误面进 composer（SessionSealedError
 * 先例：Error + 可读中文 message + 稳定 name）。
 */
export class WorktreeCapabilityAbsentError extends Error {
  readonly code = 'ERR_WORKTREE_CAPABILITY_ABSENT'
  constructor(cwd: string) {
    super(`git 绑定能力缺席（git-worktree 插件未装载），git 项目「${cwd}」的会话创建与消息发送已拒绝——请检查插件装配后重启应用`)
    this.name = 'WorktreeCapabilityAbsentError'
  }
}

/**
 * 重路由目标树不在场显式拒绝（bug 4a30b193——prompt 径 typed 收口，SessionSealedError /
 * WorktreeCapabilityAbsentError 先例同径：Error + 可读中文 message + 稳定 name + code ∈
 * contracts ERROR_CODES）。code ∈ ERROR_CODES → rpc-envelope / 前端按码映射错误条，
 * 不落 gateway/internal 泛化折叠。
 */
export class WorktreeTargetAbsentError extends Error {
  readonly code = 'ERR_WORKTREE_TARGET_ABSENT'
  constructor(readonly targetPath: string) {
    super(`绑定的 worktree 目录已不存在（可能已被删除）：${targetPath}——消息未发送。请重建该 worktree，或在顶部项目栏重新选择目标后重试`)
    this.name = 'WorktreeTargetAbsentError'
  }
}

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
  'resolve',
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
  resolve(request: WorktreeResolveRequest): Promise<WorktreeResolveResult>
  /** host 必绑拦截 guard 面（1.30——非 RPC：sessionController/sessionPersistence 在场才有） */
  requiredBindingGuard(): RequiredBindingGuardFace | undefined
}

/** 必绑拦截 guard 面（judge/reroute——interceptRequiredBinding 消费） */
export interface RequiredBindingGuardFace {
  /** 'pass' = 放行；'route' = 无绑定 blank（必绑拦截命中）→ reroute */
  judge(sessionId: string): Promise<'pass' | 'route'>
  /** 编排（等待既有在途产物）+ 以原消息内容 prompt 产物会话；args 尾巴（官方 signal 等）原样透传；失败显式报错 */
  reroute(sessionId: string, request: unknown, ...args: unknown[]): Promise<unknown>
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
  /** 按规范路径只读解析（项目命名继承源 + 存量 title 对齐读面）；缺席 = 旧替身/降级面 */
  resolveByPath?(path: string): Promise<{ readonly title: string; setTitle?(title: string): Promise<void> } | undefined>
  /** registry 全局归档集只读快照（官方 registry.archivedSessionIds——占位回收判定源；
   *  缺席 = 旧替身，回收面降级为零回收） */
  readonly archivedSessionIds?: readonly string[]
  /** 取消归档（官方 registry.unarchiveSession——bug ff324cad 占位 recycle 唯一写入口）；
   *  缺席 = 旧替身，回收面降级为零回收 */
  unarchiveSession?(sessionId: string): Promise<void>
  /** 归档（官方 registry.archiveSession——bug ff324cad 重路由弃置占位清场唯一写入口）；
   *  缺席 = 旧替身，清场降级为零归档（侧栏残留占位，可手动归档） */
  archiveSession?(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
}

const noGit: WorktreeListResult = { isGit: false, entries: [] }

/** G8 分流（bug 925c96d5 核验补强）：list isGit:false 负结果按 projectRoot 会话期缓存——
 *  非 git 项目 hero 挂载/弹窗关闭不再每次白跑 git 子进程（resolveProject 探测）。
 *  只缓存负结果：isGit:true 面保持实时（worktree 清单必须新鲜）。 */
const noGitCache = new Map<string, WorktreeListResult>()

const worktreeNameOf = (path: string): string => path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path

/**
 * 目录 ACL 预防性补权（bug 4209c531——与官方 diagnose-windows-sandbox-acl 修复同语义，
 * 前置到编排创建时点）。平台分派（钩子三平台均在，动作按需）：
 *   · win32：git worktree add 产出的树目录只继承父链 ACE（Authenticated Users Modify——
 *     不含 WRITE_DAC/WRITE_OWNER），沙箱授权链 grantWrite 要求目录链对授权进程有效
 *     WRITE_DAC+WRITE_OWNER，缺任一 = 新树首条命令必被拒 → icacls 为当前用户补
 *     FullControl（OI)(CI)（仅该树目录；不删改任何既有 ACE）；
 *   · linux/mac：显式 no-op——posix 树目录由创建者用户所有（ugo 语义天然满足授权
 *     前置），无 capability-SID 授权链，无需补权。
 * 调用方 fail-soft（失败只 warn，不阻断编排）。
 */
/** grant 超时上界（ms）——残余传播场景最坏 10s fail-soft（diagnose 技能兜底不变） */
const ACL_GRANT_TIMEOUT_MS = 10_000

/** ACL 子进程执行器（测试注入缝；缺省 = execFile promisified） */
export type AclRunner = (file: string, args: string[], opts?: { timeout?: number }) => Promise<string>
const defaultAclRunner: AclRunner = async (file, args, opts) =>
  (await promisify(execFile)(file, args, { windowsHide: true, ...opts })).stdout

const defaultEnsureDirAcl = async (path: string, run: AclRunner = defaultAclRunner): Promise<void> => {
  if (process.platform !== 'win32') return
  const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`
  if (user === '\\') return
  // Root cause: 带继承标志的 ACE 写入触发 Windows 对整棵子树的继承传播（大仓库分钟级、
  // 独占 1 核——bug f9a23367），且旧实现每次编排无条件 grant（已补权目录重复付账）。
  // 幂等短路：先只读查 DACL（单目录 SD 读，毫秒级），当前用户已有 (OI)(CI)(F) 有效
  // ACE（含继承式 (I) 标记——继承物化在场同样有效）即跳过 grant；DENY 行拒绝优先不算。
  try {
    const current = await run('icacls', [path])
    const prefix = `${user}:`.toUpperCase()
    const granted = current.split('\n').some((line) => {
      const l = line.trim().toUpperCase()
      return !l.includes('(DENY)') && l.startsWith(prefix) && l.includes('(OI)(CI)') && l.includes('(F)')
    })
    if (granted) return
  } catch {
    // 只读失败走 grant 兜底（超时上界保护）——现行 fail-soft 语义不变
  }
  await run('icacls', [path, '/grant', `${user}:(OI)(CI)F`], { timeout: ACL_GRANT_TIMEOUT_MS })
}
export { defaultEnsureDirAcl }

/** 路径比对归一口径（seal-guard.normalizePathForCompare 同判——本地镜像零回环） */
const norm = (path: string): string => path.replaceAll('\\', '/').toLowerCase()

/** 重路由目标活性探测（bug 4a30b193 缝——缺省 = existsSync 盘上事实；测试注入桩） */
const defaultPathPresent = (path: string): boolean => existsSync(path)

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
  /** worktree 清单行注入缝（list 通道本体——缺省 = 插件域 listWorktrees 真机 git） */
  readonly listWorktreeRows?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null; detached: boolean; bare: boolean }[]>) | undefined
  /** 默认 agentPreset 解析缝（官方 agentPresets registry——缺席/拒绝 = 头缺席零猜测，bug eae18b5c） */
  readonly resolveDefaultPreset?: (() => Promise<string | undefined>) | undefined
  /** 目录 ACL 预防性补权缝（bug 4209c531——缺省 = win32 icacls 当前用户 FullControl；测试注入桩） */
  readonly ensureDirAcl?: ((path: string) => Promise<void>) | undefined
  /** worktree 一体创建缝（bug f9a23367 A′ 预铸时序——缺省 = 插件域 createWorktree 真机 git；测试注入桩） */
  readonly createWorktreeOp?: typeof createWorktree | undefined
  /** worktree 集合变化锚（绑定表失效通知——create/remove 建删树 + sessionCreate 树首次
   * 挂会话时点触发；装配方接 refreshKnowledgeBindings 全量现算重写 knowledge-bindings。
   * fail-soft：锚缺席/抛错只记 warn，不影响建删树/编排结果） */
  readonly onWorktreeSetChanged?: (() => Promise<void> | void) | undefined
  /** 会话采纳锚（bug e5059ee1——controller.create adopt 成功后触发恰一次；装配方经官方
   * permissionPresets.set 补钉 defaultPreset（resume 钉档走「已种子化」分支落组合缺省，
   * 绕过用户缺省档）。fail-soft：缺席/抛错只记 warn不改写产物） */
  readonly onSessionAdopted?: ((sessionId: string) => Promise<void> | void) | undefined
  /** W2 缺席拒绝面判定源：child boot 60s 能力轮询放弃路径盖 'absent'（能力在场/瞬态窗口
   *  = undefined——瞬态 fail-open 分支维持现状，D1 拆分不捆绑收紧）。 */
  readonly guardState?: () => 'absent' | undefined
  /** W2 git 探针注入缝（缺省 = @dsh-forge/core createGitIdentityPort().commonDirAnchor；
   *  逐次现跑、零缓存——git 仓库可被移除，判定结果不作会话期记忆；测试注入桩） */
  readonly probeGitAnchor?: ((dir: string) => Promise<string | null>) | undefined
  readonly warn?: (message: string) => void
  /** 派生失败诊断 emit 缝（app-observability fix-3）：judge 判读链 fail-open 放行处 emit
   *  诊断事件（装配方注入 failOpenDiag——ALS 上下文内被调，行带链 B trace_id）；缺席 = 零 emit。 */
  readonly failOpenDiag?: (message: string) => void
  /** 重路由目标活性探测缝（bug 4a30b193——缺省 = existsSync 盘上事实；测试注入桩） */
  readonly pathPresent?: ((path: string) => boolean) | undefined
}): WorktreeRpcService {
  const warn = deps.warn ?? console.warn
  // 绑定表失效锚薄封装（恒不抛——刷新失败 = 表停在旧快照，下次 boot/注册自愈）
  const notifyWorktreeSetChanged = async (): Promise<void> => {
    if (deps.onWorktreeSetChanged === undefined) return
    try {
      await deps.onWorktreeSetChanged()
    } catch (cause) {
      warn(`[git-worktree] 绑定表刷新锚失败（fail-soft——表停旧快照，下次 boot/注册自愈）：${String(cause)}`)
    }
  }
  // 权限补钉锚薄封装（恒不抛——补钉失败 = 会话保持组合缺省档，用户可手切）
  const pinAdoptedPermission = async (sessionId: string): Promise<void> => {
    if (deps.onSessionAdopted === undefined) return
    try {
      await deps.onSessionAdopted(sessionId)
    } catch (cause) {
      warn(`[git-worktree] 权限补钉失败（fail-soft——会话保持组合缺省档，可手切）：${String(cause)}`)
    }
  }
  const listPresent =
    deps.listPresent ??
    ((root: string) => listWorktrees(root).then((entries) => entries.map((entry) => entry.path)))
  // 重路由目标 / list present 共源活性探测（bug 4a30b193 缝——缺省 = existsSync 盘上事实）
  const presentOf = deps.pathPresent ?? defaultPathPresent
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

  /**
   * W2 能力缺席判定核（fail-closed 收口）：入口同步查 resolveGitWorktree() === undefined
   * （粘性能力位）→ 缺席且 60s 放弃位已盖（guardState 'absent'；瞬态窗口 = undefined →
   * fail-open 现状，D1 拆分）→ 跑 core git 探针——有锚 = git = 显式拒绝；null = 真非 git
   * = 官方原流。探针逐次现跑、零缓存（创建入口非热路径；git 仓库可被移除，判定结果不作
   * 会话期记忆）。能力在场路径恒 false = 零改动（非介入面零固定税维持）。
   */
  const absentGitProbe = async (dir: string): Promise<boolean> => {
    if (resolveGitWorktree() !== undefined) return false
    if (deps.guardState?.() !== 'absent') return false
    const probe = deps.probeGitAnchor ?? ((path: string) => createGitIdentityPort().commonDirAnchor(path))
    const anchor = await probe(dir).catch(() => null)
    return anchor !== null
  }

  const resolveWorkspaceRegistry = (): WorkspaceRegistryFace | undefined =>
    typeof deps.workspaceRegistry === 'function' ? deps.workspaceRegistry() : deps.workspaceRegistry

  // ── G7② 项目能力缓存（resolveProject 结果按 projectRoot 会话期记忆化）──
  // 只在 gitWorktree 能力服务在场时缓存（默认独立模式扩展点恒 null——缓存会把「能力未到」
  // 冻结成永久非 git）。判非 git 直接短路 = 零会话日志读、零 git 子进程。
  const projectCache = new Map<string, Promise<{ projectRoot: string; projectName?: string } | null>>()
  const cachedResolve = (path: string): Promise<{ projectRoot: string; projectName?: string } | null> => {
    const key = norm(path)
    const cached = projectCache.get(key)
    if (cached !== undefined) return cached
    const pending = ext().resolveProject(path).catch(() => null) as Promise<{ projectRoot: string; projectName?: string } | null>
    if (resolveGitWorktree() !== undefined) projectCache.set(key, pending)
    return pending
  }

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
    } catch {
      header = {}
    }
    headerMemo.set(sessionId, header)
    return header
  }

  /**
   * blank 判读（设计 §11 假设 5：blank = 首个 turn/start 前的投影语义）。判据 = 官方
   * sessionListMetadata 投影折叠同式（api-session-controller 核销 2026-10-17：init true，
   * 仅 `turn/start` 清位——种子事件 permission/sandbox/approval 不构成「已用」）。旧判据
   * 「全部事件 ignorable」对官方直建会话恒 false（bug 82cab5fe：创建链先写非 ignorable
   * 种子事件 → 必绑重路由结构性死路）。读失败 = 非 blank（fail-closed 不误重路由）。
   */
  const blankOf = async (sessionId: string): Promise<boolean> => {
    try {
      const handle = await readFactory.openRead(sessionId)
      try {
        const events = (await (handle as { read?: () => Promise<{ events?: readonly unknown[] }> }).read?.())?.events ?? []
        return !events.some((event) => (event as { type?: unknown } | null)?.type === 'turn/start')
      } finally {
        await (handle as { close?: () => Promise<void> }).close?.()
      }
    } catch {
      return false
    }
  }

  /**
   * 源会话 agentPreset 折叠读（bug 82cab5fe 重路由模式随档）：官方 agentPreset 投影同式
   * （agent-preset-registry 核销 2026-10-17——init = header.agentPreset ?? null，按
   * agent-preset/selected 事件顺序推进；blank 会话仅 select 事件，折叠即现值）。读失败
   * = undefined（零猜测，回落 registry 默认——eae18b5c 同径 fail-soft）。
   */
  const sourcePresetOf = async (sessionId: string): Promise<string | undefined> => {
    try {
      const handle = await readFactory.openRead(sessionId)
      try {
        const header = (handle as { header?: { agentPreset?: unknown } }).header
        let preset = typeof header?.agentPreset === 'string' ? header.agentPreset : undefined
        const events = (await (handle as { read?: () => Promise<{ events?: readonly unknown[] }> }).read?.())?.events ?? []
        for (const event of events) {
          const typed = event as { type?: unknown; data?: { agentPreset?: unknown } } | null
          if (typed?.type !== 'agent-preset/selected') continue
          const next = typed.data?.agentPreset
          if (typeof next === 'string') preset = next
        }
        return preset
      } finally {
        await (handle as { close?: () => Promise<void> }).close?.()
      }
    } catch {
      return undefined
    }
  }

  // hero 选中树记忆（select 通道推送——重路由目标单源；键 = 归一 projectRoot）
  const lastSelection = new Map<string, string>()

  // 重路由在途重入保护：reroute 对「目标 ≡ 会话自身树」径 reuse 自身 blank 后原样
  // prompt——judge 若再判 route 将无限重入。在途标记使重入判读恒 pass。
  const routing = new Set<string>()

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
      // 树工作区标题继承项目命名——官方 chip 文案 = workspace.title（槽外不可改制）。
      // title 源 = 活跃项目行 name（hero 项目行同源；工作区 title 是用户可改名的易变字段
      // 不作源）。主行（cwd=项目根）不回写——主工作区 title 是用户命名面。映射缺席回退树名。
      const resolution = await cachedResolve(worktreePath).catch(() => null)
      const projectRoot = resolution?.projectRoot
      const isMainRow = projectRoot !== undefined && norm(worktreePath) === norm(projectRoot)
      // bug f9a23367（C）：预防性补权只针对 git worktree add 产物（4209c531 语义——新树
      // 目录缺 WRITE_DAC 继承链）；主行 = 用户自有目录链，跳过——否则项目根每次编排都
      // 触发分钟级全子树传播。resolution 缺席（非 git/降级面）保守补权（原行为不变）。
      if (!isMainRow) {
        await (deps.ensureDirAcl ?? defaultEnsureDirAcl)(worktreePath).catch((cause: unknown) => {
          warn(`[git-worktree] 目录 ACL 补权失败（fail-soft——沙箱拒绝时走 diagnose 技能）：${String(cause)}`)
        })
      }
      const mainTitle = isMainRow
        ? undefined
        : (resolution?.projectName ??
          (projectRoot !== undefined
            ? await registry.resolveByPath?.(projectRoot).then((row) => row?.title).catch(() => undefined)
            : undefined))
      const workspace = await registry.create(worktreePath, mainTitle ?? worktreeNameOf(worktreePath))
      // 存量 healing：create 对已存在工作区复用不改 title（官方语义）——项目命名继承须
      // 经 setTitle 显式回写，否则修复前建的树工作区永久树名（hero 项目 chip 跟随树名）。
      if (mainTitle !== undefined) await workspace.setTitle?.(mainTitle)
      await workspace.attachSession(sessionId)
    } catch (cause) {
      warn(`[git-worktree] 工作区归属挂接失败（会话本体不受影响）：${String(cause)}`)
    }
  }

  /**
   * 存量树工作区 title 对齐（list 通道顺带 healing——attach 只在编排新建会话时触发，
   * 修复前建的树工作区若只被打开/选择将永无回写时机；list = hero 挂载/刷新必经之路）。
   * 幂等：title 已等于项目名即零写；主行跳过（用户命名面）；失败 fail-soft 零扰清单。
   */
  const healWorkspaceTitles = (
    resolution: { projectRoot: string; projectName?: string },
    dtos: readonly WorktreeEntryDto[],
  ): void => {
    const registry = resolveWorkspaceRegistry()
    const projectName = resolution.projectName
    if (registry === undefined || projectName === undefined || projectName === '') return
    for (const entry of dtos) {
      // bug 63180253：盘上缺席陈旧行（git prune 前残留）跳过——resolveByPath realpath
      // ENOENT warn 空转（现场 26 次/天）。树重建后 list 自然重新对齐，自愈语义零损失。
      if (entry.isMain || !entry.present) continue
      void (async (): Promise<void> => {
        try {
          const workspace = await registry.resolveByPath?.(entry.path)
          if (workspace === undefined || workspace.title === projectName) return
          await workspace.setTitle?.(projectName)
        } catch (cause) {
          warn(`[git-worktree] 树工作区 title 对齐失败（fail-soft）：${entry.worktreeName}：${String(cause)}`)
        }
      })()
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
        (deps.listWorktreeRows ?? listWorktrees)(resolution.projectRoot),
        Promise.resolve(ext().getWorktreeDir(resolution.projectRoot)),
      ])
      // present 兑现盘上事实（bug 4a30b193 UI 面）：git 清单在 prune 前保留已删树陈旧行
      // ——UI 陈旧选中自愈判定源 = existsSync 盘上实存（与重路由活性同源 presentOf）
      const dtos = entries.map((entry) => ({ ...entryToDto(entry, resolution.projectRoot), present: presentOf(entry.path) }))
      healWorkspaceTitles(resolution, dtos)
      return {
        isGit: true,
        worktreeDir: dir,
        entries: dtos,
      }
    },

    async create(request) {
      // A′（bug f9a23367）：树目录预铸——先建空目录并在此刻补可继承 ACE（空目录上 grant
      // 毫秒级），git worktree add 检出的每个文件出生即继承，消除「检出后对满树 grant」
      // 的分钟级全子树回溯传播。非空/已存在路径不授权（createWorktree 按 path-exists 拒）。
      try {
        if (!existsSync(request.path)) mkdirSync(request.path, { recursive: true })
        if (readdirSync(request.path).length === 0) {
          await (deps.ensureDirAcl ?? defaultEnsureDirAcl)(request.path).catch((cause: unknown) => {
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
      await notifyWorktreeSetChanged() // 绑定表失效锚：新树路径即需路由行
      return { entry: entryToDto(entry, request.projectRoot) }
    },

    async remove(request) {
      const result = await deleteWorktree(request.projectRoot, request.path, async () => true)
      await notifyWorktreeSetChanged() // 绑定表失效锚：被删路径旧行随全量重写即时消失
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
      // W2 能力缺席显式拒绝（fail-closed）：git 项目 × 能力缺席 → typed error（rpcEnvelope
      // 序列化 → 前端 RpcClientError → Toast）；非 git / 瞬态窗口 → 官方原流零差异。
      if (await absentGitProbe(request.worktreePath)) throw new WorktreeCapabilityAbsentError(request.worktreePath)
      // bug ff324cad 根治级「创建即绑选中树」：hero 选中树记忆消费前移到创建时点——wrap
      // 恒传项目根，此处选中记忆在场且活性可证即直接预铸选中树会话（零主树占位双建，
      // 首条消息零重路由）；陈旧记忆摘除回落请求路径（bug 4a30b193 同判）。消费仅限
      // 「请求 ≡ 项目根」的占位语义请求：显式树请求（点选即换绑编排 / 重路由产物径）
      // 目标本就是点选结果，记忆劫持 = 绑错树。
      let targetPath = request.worktreePath
      const resolution = await cachedResolve(request.worktreePath).catch(() => null)
      if (
        resolution !== null &&
        norm(request.worktreePath) === norm(resolution.projectRoot)
      ) {
        const selected = lastSelection.get(norm(resolution.projectRoot))
        if (selected !== undefined) {
          if (presentOf(selected)) {
            if (norm(selected) !== norm(request.worktreePath)) targetPath = selected
          } else {
            lastSelection.delete(norm(resolution.projectRoot)) // 陈旧记忆摘除——后续创建不再走失效径
          }
        }
      }
      const key = norm(targetPath)
      const registry = resolveWorkspaceRegistry()
      const archivedOf = (): readonly string[] => registry?.archivedSessionIds ?? []
      // bug 8af836eb：回收占位不做时间戳刷新——被 adopt 过的会话写句柄被官方 agent loop
      // 持有（单写者铁律），post-adopt 写入结构性不可行（SessionAlreadyOwnedError 实证）；
      // 时间戳陈旧为 recycle 复用的固有边界，侧栏显示原创建时刻。
      // G3 互斥复用：在途编排共享等待；既有 blank 产物直接复用；弃置归档产物（重路由
      // 清场，见 rerouteInner）unarchive 回活复用——占位全局至多一个（bug ff324cad 累积面收口）
      for (;;) {
        const existing = sessionProducts.get(key)
        if (existing === undefined) break
        const reused = await existing
        if (await blankOf(reused.sessionId)) {
          if (archivedOf().includes(reused.sessionId)) {
            // 归档占位交付前 cwd 核验（bug ff324cad + 1.19 强制守护同判）：绑定经
            // readLatestAttach 的 header cwd ≡ 绑定树强制校验（漂移抛错 → null 拒收），
            // 再求绑定 ≡ 目标树——漂移占位不可当目标树产物交付，降级新建。
            const binding = await readLatestAttach(reused.sessionId, readFactory).catch(() => null)
            if (binding === null || norm(binding.worktreePath) !== norm(targetPath)) {
              sessionProducts.delete(key)
              break
            }
            try {
              await registry?.unarchiveSession?.(reused.sessionId)
            } catch (cause) {
              warn(`[git-worktree] 占位回收 unarchive 失败（降级新建）：${String(cause)}`)
              sessionProducts.delete(key)
              break
            }
            if (registry?.unarchiveSession === undefined || archivedOf().includes(reused.sessionId)) {
              // 归档面缺席或 unarchive 未生效（会话仍不可见）——不可交付，降级新建
              sessionProducts.delete(key)
              break
            }
          }
          return reused
        }
        sessionProducts.delete(key) // 产物已被真实使用（非 blank）→ 允许新建
      }
      // 占位回收重启世界兜底 + 预铸编排同链（G3 互斥：key 认领后首个 await 前同步 set——
      // 并发调用方在 loop 段即命中在途产物，scan/预铸不再开双建窗口）：
      const pending = (async (): Promise<WorktreeSessionCreateResult> => {
        // 归档集精确候选扫描（bug 8af836eb 后续性能收口：候选源 = registry.archivedSessionIds
        // 本身——只有产品归档的占位会进该集合，通常一两个条目；替代初版 persistence.list
        // 全量尾扫 cap 200 逐会话开读句柄——真实项目秒级，是「点新会话打开 hero 明显延迟」
        // 的根因）。registry 归档面缺席 = 恒不命中（回收面降级，行为同现状新建）。
        const registry2 = registry
        if (registry2?.unarchiveSession !== undefined && registry2.archivedSessionIds !== undefined) {
          try {
            let recycledId: string | undefined
            for (const sid of registry2.archivedSessionIds) {
              const binding = await readLatestAttach(sid, readFactory).catch(() => null)
              if (binding === null || norm(binding.worktreePath) !== norm(targetPath)) continue
              if (!(await blankOf(sid))) continue
              recycledId = sid // 不 break——归档序取最后命中（近似最新）
            }
            if (recycledId !== undefined) {
              try {
                await registry2.unarchiveSession(recycledId)
              } catch (cause) {
                warn(`[git-worktree] 占位回收 unarchive 失败（降级新建）：${String(cause)}`)
                recycledId = undefined
              }
              if (recycledId !== undefined && !archivedOf().includes(recycledId)) {
                return { sessionId: recycledId, branch: await resolveBranch(targetPath) }
              }
            }
          } catch {
            // 扫描失败 = 回收面降级（零回收），落预铸现状
          }
        }
        const result = await doSessionCreate({ ...request, worktreePath: targetPath })
        await notifyWorktreeSetChanged()
        return result
      })()
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

    requiredBindingGuard() {
      if (deps.sessionController === undefined || deps.sessionPersistence === undefined) return undefined
      return {
        // 判据（设计 §7 + bug 82cab5fe 修订）：git 项目 ∧ 目标会话 blank ∧ 无绑定 ∧ 顶层
        // 会话（header.parentSession 缺席——worker/fork 子会话归官方子代理机械所有，恒放行）；
        // cwd 漂移（SessionCwdMismatchError）原样上抛 = 拒绝（A5）；非 blank 既有会话零打扰。
        judge: async (sessionId) => {
          if (routing.has(sessionId)) return 'pass' // 重路由在途重入保护（reuse-self 径）
          const header = await headerOf(sessionId)
          if (header.parentSession !== undefined) return 'pass' // 子会话零重路由（非 hero 人口）
          const cwd = header.cwd
          if (cwd === undefined || cwd === '') return 'pass'
          // W2 能力缺席显式拒绝（fail-closed）：git 项目 × 能力缺席 → 稳定 name 错误上抛
          // （经官方 Remote 错误面进 composer）；非 git / 瞬态窗口 → fail-open 现状放行。
          if (await absentGitProbe(cwd)) throw new WorktreeCapabilityAbsentError(cwd)
          const resolution = await cachedResolve(cwd)
          if (resolution === null) return 'pass' // 非 git：零行为差异（G7 分流）
          let binding: { worktreePath: string; branch: string } | null
          try {
            binding = await readLatestAttach(sessionId, readFactory)
          } catch (cause) {
            if ((cause as Error)?.name === 'SessionCwdMismatchError') throw cause // A5 拒绝
            // Root cause: 判读链异常此前静默 'pass'——链 B 派生失败旅程零日志行（fix-2 实证）。
            // fail-open 放行语义不变，仅补诊断 emit（ALS 上下文内——行带同 trace_id）。
            deps.failOpenDiag?.(`[git-worktree] 必绑判读链异常 fail-open 放行（attach 读失败）：${String(cause)}`)
            return 'pass' // 判读链异常 fail-open（正确性不依赖此径）
          }
          if (binding !== null) {
            // W3 预铸占位（bug ac0246f5）：create-wrap 改道产物 blank 恒绑项目根——那是
            // 「待重路由占位」不是绑定决定，选中树由首条消息重路由兑现；非 blank（已真实
            // 使用）或绑定他树 = 绑定决定，零打扰。
            const rootPlaceholder = norm(binding.worktreePath) === norm(resolution.projectRoot)
            if (!rootPlaceholder || !(await blankOf(sessionId))) return 'pass'
            return 'route'
          }
          return (await blankOf(sessionId)) ? 'route' : 'pass'
        },
        // 编排（与 client arm 共享 sessionCreate 互斥面——在途即等待）+ 重路由：
        // 目标 = hero 选中树（select 推送记忆）缺席回退会话 cwd 树；原消息内容保真换绑；
        // 模式随档（bug 82cab5fe——源会话 preset 折叠值显式入请求，registry 默认不覆盖源档）。
        // bug dcdc1b4d：官方 prompt 契约 = (request, signal)（gateway 面 prompt 首行
        // signal.throwIfAborted()）——重路由漏传 signal 使内层 prompt 拿到 undefined →
        // TypeError 被网关 dispatch 折叠为 gateway/internal 回包（toast + 无回复）。
        // args 尾巴原样透传（signal 等调用方上下文保真）。
        reroute: async (sessionId, request, ...args) => {
          routing.add(sessionId) // 重入保护：reuse-self 径的原样 prompt 判读恒 pass
          try {
            return await rerouteInner(sessionId, request, ...args)
          } finally {
            routing.delete(sessionId)
          }
        },
      }
    },

    seal: sealStateOf,
  }

  /** 重路由编排本体（guard.reroute 的 inner——routing 重入标记由外层承担） */
  async function rerouteInner(sessionId: string, request: unknown, ...args: unknown[]): Promise<unknown> {
    {
      const header = await headerOf(sessionId)
          const cwd = header.cwd
          const resolution = cwd !== undefined && cwd !== '' ? await cachedResolve(cwd) : null
          // bug 4a30b193：Root cause——hero 选中树记忆（lastSelection）从不失效，树目录被
          // 强制删除后重路由仍以其为目标编排（realpath ENOENT 链 / adopt 到不存在 cwd /
          // AbortError 显式拒绝——实机发送长时间无响应）。消费时点验活性：陈旧选中树摘除
          // 并回落会话 cwd；cwd 亦不在场 = 显式报错，绝不对已删路径静默编排。
          const presentOf = deps.pathPresent ?? defaultPathPresent
          const selected = resolution !== null ? lastSelection.get(norm(resolution.projectRoot)) : undefined
          let target = selected !== undefined && presentOf(selected) ? selected : undefined
          if (target === undefined && selected !== undefined && resolution !== null) {
            lastSelection.delete(norm(resolution.projectRoot)) // 陈旧记忆摘除——后续发送不再走失效径
          }
          if (target === undefined && cwd !== undefined && cwd !== '') target = cwd
          if (target === undefined) throw new Error('worktree 必绑重路由失败：会话 cwd 缺席且无选中树')
          if (!presentOf(target)) throw new WorktreeTargetAbsentError(target)
          // 已绑定目标树（根绑定占位 × 目标 ≡ 自身树）→ 免再编排，原样投递（routing 标记
          // 使重入判读 pass）；无绑定 blank 同目标仍走产物径（G2——绑定语义由预铸兑现）。
          const existingBinding = await readLatestAttach(sessionId, readFactory).catch(() => null)
          if (existingBinding !== null && norm(existingBinding.worktreePath) === norm(target)) {
            const selfController = deps.sessionController
            if (selfController === undefined) throw new Error('sessionController 缺席（host 装配漂移）——无法投递 prompt')
            return (selfController.prompt as (r: unknown, ...rest: unknown[]) => unknown)(
              { ...(request as Record<string, unknown>), sessionId },
              ...args,
            )
          }
          // 走 sessionCreate 公开面（G3 双建互斥：在途共享、产物 blank 复用）——直调
          // doSessionCreate 会绕过互斥，与 client arm 并发时同 cwd 双建。
          const preset = await sourcePresetOf(sessionId)
          const product = await service.sessionCreate({
            worktreePath: target,
            ...(preset === undefined ? {} : { agentPreset: preset }),
          })
          const productController = deps.sessionController
          if (productController === undefined) throw new Error('sessionController 缺席（host 装配漂移）——无法重路由 prompt')
          const result = await (productController.prompt as (r: unknown, ...rest: unknown[]) => unknown)(
            { ...(request as Record<string, unknown>), sessionId: product.sessionId },
            ...args,
          )
          // bug ff324cad 弃置清场：产物投递成功后，源会话仍为 blank（未被并发真实使用）
          // 即就地归档（官方 registry durable 归档集——全分组面隐藏、可 unarchive 恢复；
          // 占位回收见 sessionCreate——归档占位会被 recycle 复用，全局至多一个根占位）。
          // prompt 失败不归档（源会话保留供重试）；归档面缺席/失败 fail-soft 只 warn。
          try {
            if (await blankOf(sessionId)) {
              await resolveWorkspaceRegistry()?.archiveSession?.(sessionId, { stopActivity: true })
            }
          } catch (cause) {
            warn(`[git-worktree] 重路由弃置占位归档失败（fail-soft——侧栏残留占位，可手动归档）：${String(cause)}`)
          }
          return result
    }
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
    // Root cause: 分支解析落空（detached HEAD 检出 / 清单路径失配或失败）此前未在边界拦截，
    // 空串直达预铸深处由 requireNonEmpty 抛无业务语义的 TypeError（bug b6b88f49）。
    // 挂靠事件契约 = 分支非空（一 worktree 一分支），落空即显式拒绝、不落半截预铸会话。
    if (branch === '') {
      throw new Error(`worktree 分支解析失败（detached HEAD 检出或清单失配），无法预铸挂靠会话：${cwd}`)
    }
    // 1.16 预铸采纳配方（Root cause: 官方 agent loop 自 controller.create 起即持有会话
    // 唯一写句柄——建会话后另开写句柄补写挂靠事件在活会话上结构性不可行）。改为：先
    // persistence.create 预铸（自铸 id + cwd 头）→ 初始句柄写挂靠事件（seq 0, ignorable）
    // → flush + close，再 controller.create({sessionId, cwd}) 官方 adopt/resume——写句柄
    // 生命周期零交叠，单写者铁律满足。
    // bug eae18b5c：预铸头自携默认 agentPreset（官方 composeAgent 同径——registry defaultId）；
    // 解析失败零猜测（头缺席），不阻断预铸主链。
    // bug 82cab5fe：请求显式档（重路由源会话折叠值）优先——registry 默认不覆盖源档。
    const agentPreset =
      request.agentPreset ?? (await deps.resolveDefaultPreset?.().catch(() => undefined))
    const preseeded = await preseedWorktreeSession(
      persistence as unknown as SessionPersistenceCreateFace,
      {
        worktreePath: cwd,
        branch,
      },
      agentPreset === undefined ? {} : { agentPreset },
    )
    await controller.create({ sessionId: preseeded.sessionId, cwd })
    // bug e5059ee1：adopt（= resume 既有日志）后官方 permission 钉档走「已种子化」分支落
    // 组合缺省，绕过 defaultPreset——装配方经官方 permissionPresets.set 补钉用户缺省档
    await pinAdoptedPermission(preseeded.sessionId)
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
  ipc.register(WORKTREE_CHANNELS.resolve, rpcEnvelope((q: WorktreeResolveRequest) => service.resolve(q)))
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
 * 诊断 trace 缝（app-observability 1.2 链 B）：宿主 prompt dispatch 入口生成 trace_id +
 * ALS 包裹——judge/reroute/原发送等同链派生调用与日志行自动携带。child 侧装配方注入。
 */
export interface PromptTraceSpan {
  /** 新 trace_id（每次 prompt 派生链一枚） */
  next(): string
  /** 在 trace 上下文内执行整条 prompt 链 */
  run<T>(traceId: string, sessionId: string | undefined, fn: () => Promise<T>): Promise<T>
}

/**
 * 1.30 第二层 prompt 拦截（必绑 + 重路由）——叠加现役 interceptSessionSends 之上（官方
 * commands.prompt 调用时属性查找：本层先于封存层执行，judge 'route' 时以 guard.reroute
 * 的 promise 替代原发送；dispose 恢复封存层包装 = 逆序撤销安全）。
 * 判读链异常 fail-open 放行；SessionCwdMismatchError（A5）与重路由失败显式拒绝。
 * trace 缝注入（1.2 链 B）：prompt 入口生成 trace_id 并以 ALS 包裹整链（缺席 = 原样零差异）。
 */
export function interceptRequiredBinding(
  controller: SessionControllerFace,
  guard: RequiredBindingGuardFace,
  warn: (message: string) => void = console.warn,
  trace?: PromptTraceSpan,
): () => void {
  const original = (controller as unknown as Record<string, unknown>)['prompt']
  if (typeof original !== 'function') return () => {}
  const bound = (original as (...args: unknown[]) => unknown).bind(controller)
  const wrapped = async (...args: unknown[]): Promise<unknown> => {
    const request = args[0] as { sessionId?: unknown } | undefined
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : undefined
    const inner = async (): Promise<unknown> => {
      if (sessionId !== undefined) {
        // 判读（fail-open 域）：judge 链异常放行（正确性不依赖此径）；A5/W2 typed 拒绝原样上抛
        let verdict: 'route' | 'pass'
        try {
          verdict = await guard.judge(sessionId)
        } catch (cause) {
          const name = (cause as Error)?.name
          if (name === 'SessionCwdMismatchError' || name === 'WorktreeCapabilityAbsentError') throw cause // A5：拒绝不放行；W2 缺席拒绝同径
          warn(`[git-worktree] 必绑拦截判读失败（fail-open 放行）：${String(cause)}`)
          verdict = 'pass'
        }
        if (verdict === 'route') {
          // 拒绝原发送：编排（等待既有在途产物）后以原消息内容 prompt 产物会话。
          // 重路由失败 = 显式拒绝（不 fail-open）——独立 try 使 rejection 不落入判读
          // fail-open 径；catch 仅补派生失败取证 emit（ALS 上下文内——行带同 trace_id，
          // fix-2 实证 rejection 裸 return 时结构性零日志）后原样上抛。
          try {
            // args 尾巴（signal 等调用方上下文）原样透传——bug dcdc1b4d 根因即漏传
            return await guard.reroute(sessionId, request, ...args.slice(1))
          } catch (cause) {
            warn(`[git-worktree] 必绑重路由派生失败（显式拒绝，取证 emit）：${String(cause)}`)
            throw cause
          }
        }
      }
      return bound(...args)
    }
    if (trace !== undefined) return trace.run(trace.next(), sessionId, inner)
    return inner()
  }
  ;(controller as unknown as Record<string, unknown>)['prompt'] = wrapped
  return () => {
    ;(controller as unknown as Record<string, unknown>)['prompt'] = original
  }
}

/**
 * W4 装载自证（session-binding-guarantee §W4）：installSendGuard 成功路径的 wrap 换芯读回
 * ——两层拦截均为属性替换缝，装配后 controller.prompt 引用必须已换（≠ 装配前留底）且必绑
 * guard 非空；任一不满足 = 发送拦截静默残缺 → fail-loud 上抛（不静默降级为无拦截宿主）。
 * 纯判读函数（child.ts 装配方消费，单测直注替身 controller）。
 */
export function verifySendGuardInstalled(
  controller: SessionControllerFace,
  input: { readonly promptBefore: unknown; readonly guardPresent: boolean },
): void {
  const record = controller as unknown as Record<string, unknown>
  const detail =
    typeof input.promptBefore !== 'function'
      ? 'controller.prompt 装配前留底缺席'
      : record['prompt'] === input.promptBefore
        ? 'controller.prompt 未换芯（wrap 未生效）'
        : input.guardPresent
          ? undefined
          : '必绑 guard 缺席（sessionPersistence 缺席）'
  if (detail === undefined) return
  throw new Error(`[git-worktree] 发送拦截装载自证失败（${detail}）——fail-loud 不静默残缺`)
}
