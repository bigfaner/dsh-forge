// forge:worktree/* 通道族（worktree-branch-management fix-2——装配缺口承接）。
// 三处一体落点：contracts WORKTREE_CHANNELS → web/rpc client → 本文件注册面。
// 域实现 = packages/plugins/git-worktree（通用层 ops/session-attach/seal-guard）——host
// ipc 装配透传（typed 载荷直通插件域，零业务逻辑停留）。
// 三职责：
//   · WorktreeRpcService（child 侧服务本体）：ops 封装 + forge/worktree-bind 留痕
//     （session/created 监听 append + seal 漂移校验惰性补写，binding-derivation §2.2）+
//     封存判定快照（会话创建 host 侧已退役——桌面客户端直呼官方网关，移动端经
//     forge:proxy/session-create 中继 sessionController 进内直调，binding-derivation §2.3）；
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
  type ForgeBindingMismatchEvent,
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
} from '@dsh-forge/contracts'
import {
  createWorktree,
  appendWorktreeBind,
  readLatestWorktreeBind,
  type WorktreeBindAppendTarget,
  type WorktreeBindData,
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

/** 官方 SessionPersistence.open 消费切片（结构化窄面——零官方包 import；读侧 = 留痕反查/头读取） */
export interface SessionPersistenceFace {
  open(id: string, access: 'read' | 'write'): Promise<unknown>
}

/** 官方活会话消费切片（binding 留痕 append 面——Session.append 进程内直调的唯一入口；
 *  header = 官方只读头（session/created 触发径的 cwd 读取面）） */
export interface LiveSessionFace extends WorktreeBindAppendTarget {
  readonly header?: { readonly cwd?: string }
}

/** 官方 SessionController 消费切片（prompt/updateQueue = 发送链拦截面——会话创建 host 侧
 *  已退役，创建经官方网关/移动端 proxy 中继直调） */
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

/** G8 分流（bug 925c96d5 核验补强）：list isGit:false 负结果按 projectRoot 会话期缓存——
 *  非 git 项目 hero 挂载/弹窗关闭不再每次白跑 git 子进程（resolveProject 探测）。
 *  只缓存负结果：isGit:true 面保持实时（worktree 清单必须新鲜）。 */
const noGitCache = new Map<string, WorktreeListResult>()

/**
 * 解析缓存失效缝（bug 9eb9d6cb 后续收口）：归属事实变更事件（registerProject/建删树）
 * 触发——两级解析缓存（noGitCache 负结果 + 各服务实例 projectCache 解析记忆）清除，
 * 下次消费现跑。此前注册路径不清缓存：新注册路径的清单停在 isGit:false、解析停在陈旧
 * null 直到重启。projectRoot 缺席 = 全清（保守——重填成本低，一次性 git 探测）。
 * 实例级 projectCache 经注册器缝到达（各 createWorktreeRpcService 实例登记自己的清除
 * 闭包——闭包内 Map 模块级不可达；实例随宿主进程生灭，注册器不摘除=零泄漏面）。
 */
const resolveCacheInvalidators = new Set<(projectRoot?: string) => void>()

export function invalidateResolveCaches(projectRoot?: string): void {
  if (projectRoot === undefined) noGitCache.clear()
  else noGitCache.delete(norm(projectRoot))
  for (const invalidate of resolveCacheInvalidators) invalidate(projectRoot)
}

const worktreeNameOf = (path: string): string => path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path

/** unborn HEAD 分支名缺省探测（git symbolic-ref --short HEAD——真机 git execFile；失败 null） */
const defaultSymbolicRefOf = async (worktreePath: string): Promise<string | null> => {
  try {
    const { stdout } = await promisify(execFile)('git', ['-C', worktreePath, 'symbolic-ref', '--short', 'HEAD'], {
      windowsHide: true,
    })
    const branch = stdout.trim()
    return branch === '' ? null : branch
  } catch {
    return null
  }
}

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
  readonly sessionPersistence?: SessionPersistenceFace | undefined
  /** 官方 workspaceRegistry（惰性取法注入缝；缺席 = 旧环境零归属面降级） */
  readonly workspaceRegistry?: (() => WorkspaceRegistryFace | undefined) | WorkspaceRegistryFace | undefined
  /** 在场清单注入缝（单测替身；缺省 = 插件域 listWorktrees 真机 git） */
  readonly listPresent?: ((projectRoot: string) => Promise<readonly string[]>) | undefined
  /** worktree 清单注入缝（branch 解析面——缺省 = 插件域 listWorktrees 真机 git） */
  readonly listWorktreeEntries?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null }[]>) | undefined
  /** worktree 清单行注入缝（list 通道本体——缺省 = 插件域 listWorktrees 真机 git） */
  readonly listWorktreeRows?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null; detached: boolean; bare: boolean }[]>) | undefined
  /** unborn HEAD 分支名探测缝（git symbolic-ref --short HEAD——清单无 branch 行时兜底；
   *  缺省 = 真机 git execFile；测试注入桩。失败 = null 落空显式拒原语义） */
  readonly symbolicRefOf?: ((worktreePath: string) => Promise<string | null>) | undefined
  /** 目录 ACL 预防性补权缝（bug 4209c531——缺省 = win32 icacls 当前用户 FullControl；测试注入桩） */
  readonly ensureDirAcl?: ((path: string) => Promise<void>) | undefined
  /** worktree 一体创建缝（bug f9a23367 A′ 预铸时序——缺省 = 插件域 createWorktree 真机 git；测试注入桩） */
  readonly createWorktreeOp?: typeof createWorktree | undefined
  /**
   * 绑定表失效锚（worktree 集合变化——建/删树）。
   * worktreePath 缺席调用（建/删树）= 集合真变，必刷新；带路径调用 = 装配方按
   * 「绑定行已在册」跳过判定（性能收口：省 N×git worktree list + 文件重写）。
   */
  readonly onWorktreeSetChanged?: ((worktreePath?: string) => Promise<void> | void) | undefined
  readonly warn?: (message: string) => void
  /** service.create 失败诊断 emit 缝（binding-derivation 流程 A）：官方 workspace 前移创建
   *  fail-soft 处 emit 诊断事件（装配方注入 emitDiag('worktree-create', warn)）；缺席 = 零 emit。 */
  readonly createDiag?: (message: string) => void
  /** seal 推导判定诊断 emit 缝（binding-derivation §2.6 session-bind 域，info 级）：
   *  装配方注入 emitDiag('session-bind', info)；缺席 = 零 emit。 */
  readonly bindDiag?: (message: string) => void
  /** 留痕 append 失败诊断 emit 缝（binding-derivation §2.6 session-bind 域，warn 级——AC：
   *  append 失败 fail-soft + emitDiag('session-bind', warn)）；缺席 = 零 emit。 */
  readonly bindWarnDiag?: (message: string) => void
  /** bind-drift 漂移埋点 emit 缝（binding-derivation §2.6，info 级——触发与消除边沿各一条，
   *  携带 sessionId/cwd/两侧分支名）；缺席 = 零 emit。 */
  readonly bindDriftDiag?: (message: string) => void
  /** forge/binding-mismatch 漂移推送缝（binding-derivation M6——经 /remote/forge-stream
   *  镜像逐帧推送；装配方 ctx.emit 接线，mobile banner 消费）；缺席 = 零推送。 */
  readonly bindingMismatchEmit?: ((payload: ForgeBindingMismatchEvent) => void) | undefined
  /** session/created 监听装配缝（binding-derivation §2.2 留痕前台触发源——fork 亦发布
   *  session/created，同径覆盖）：装配方以官方 ctx.on('session/created', …) 接线并传会话
   *  id，返回撤销面；缺席 = 留痕只靠惰性补写兜底。 */
  readonly onSessionCreated?: ((handler: (sessionId: string) => void) => (() => void) | undefined) | undefined
  /** 活会话解析缝（官方 sessions store 消费切片——留痕 append 的会话解析面）：缺席/解析
   *  miss（会话无活根）= 该会话留痕不可写（fail-soft 跳过）。 */
  readonly liveSessions?: (() => { get(id: string): LiveSessionFace | undefined } | undefined) | undefined
  /** 重路由目标活性探测缝（bug 4a30b193——缺省 = existsSync 盘上事实；测试注入桩） */
  readonly pathPresent?: ((path: string) => boolean) | undefined
}): WorktreeRpcService {
  const warn = deps.warn ?? console.warn
  // 绑定表失效锚薄封装（恒不抛——刷新失败 = 表停在旧快照，下次 boot/注册自愈）。
  // worktreePath 缺席（建/删树）= 集合真变必刷新；带路径由装配方判定跳过。
  const notifyWorktreeSetChanged = async (worktreePath?: string): Promise<void> => {
    if (deps.onWorktreeSetChanged === undefined) return
    try {
      await deps.onWorktreeSetChanged(worktreePath)
    } catch (cause) {
      warn(`[git-worktree] 绑定表刷新锚失败（fail-soft——表停旧快照，下次 boot/注册自愈）：${String(cause)}`)
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

  // ── forge/worktree-bind 留痕（binding-derivation §2.2）──
  // host 进程内经 Session.append 直写（合法缝：AGENTS 1.1「ignorable 事件直写」——官方
  // model/selection 先例；词表运行期注册见 appendWorktreeBind → registerWorktreeBindVocabulary）。
  // 两级触发：① 前台 = 官方 session/created 监听（fork 同径覆盖）；② 兜底 = seal 漂移校验
  // 入口发现缺留痕时以实时 branch 惰性补写。append 失败 fail-soft + bindWarnDiag(warn)。
  const liveOf = (): { get(id: string): LiveSessionFace | undefined } | undefined => {
    try {
      return typeof deps.liveSessions === 'function' ? deps.liveSessions() : deps.liveSessions
    } catch {
      return undefined
    }
  }
  const appendBindMarker = async (sessionId: string, cwd: string, target?: LiveSessionFace): Promise<void> => {
    const appendTarget = target ?? liveOf()?.get(sessionId)
    if (appendTarget === undefined || typeof appendTarget.append !== 'function') return // 无活根——留痕降级跳过
    if ((await cachedResolve(cwd).catch(() => null)) === null) return // 非 git 域零介入
    const branch = await resolveBranch(cwd)
    if (branch === '') return // 分支落空（detached/unborn）——快照无 branch 语义，跳过
    const worktreeName = worktreeNameOf(cwd)
    try {
      appendWorktreeBind(appendTarget, { worktreeName, branch } satisfies WorktreeBindData)
      deps.bindDiag?.(
        `[git-worktree] session-bind 留痕 append：sessionId=${sessionId} worktree=${worktreeName} branch=${branch}`,
      )
    } catch (cause) {
      const message =
        `[git-worktree] session-bind 留痕 append 失败（fail-soft——漂移警示降级不警示）：` +
        `sessionId=${sessionId} worktree=${worktreeName}：${String(cause)}`
      warn(message)
      deps.bindWarnDiag?.(message)
    }
  }
  // 前台触发：官方 session/created 监听（cwd 取活会话官方只读头——创建时点已定死）。
  // 监听与装配 ctx 同生命周期（撤销面不单独持有——服务即 child 域单例，随 ctx 关停释放）。
  deps.onSessionCreated?.((sessionId) => {
    const target = liveOf()?.get(sessionId)
    const cwd = target?.header?.cwd
    if (typeof cwd !== 'string' || cwd === '') return
    void appendBindMarker(sessionId, cwd, target)
  })
  // 留痕校验记忆（性能钉：seal 通道高频——每 (session, cwd) 只做一次「缺留痕」读+补写判定；
  // 值 = 留痕 branch（'' = 读失败按「有留痕=当前」降级），留痕一旦落定不再重读）。
  const bindBranchMemo = new Map<string, string>()
  // 漂移态记忆（边沿源：每会话上一 seal 的漂移态；触发/消除跳变才 emit——埋点与推送各一条）
  const driftMemo = new Map<string, boolean>()

  const resolveWorkspaceRegistry = (): WorkspaceRegistryFace | undefined =>
    typeof deps.workspaceRegistry === 'function' ? deps.workspaceRegistry() : deps.workspaceRegistry

  // ── G7② 项目能力缓存（resolveProject 结果按 projectRoot 会话期记忆化）──
  // 只在 gitWorktree 能力服务在场时缓存（默认独立模式扩展点恒 null——缓存会把「能力未到」
  // 冻结成永久非 git）。判非 git 直接短路 = 零会话日志读、零 git 子进程。
  // null 结果缓存（G7② 性能钉：非 git 会话每消息零固定税）；陈旧由失效缝清
  // （invalidateResolveCaches——registerProject 等归属事实变更事件触发），不做读时驱逐
  //（evict-on-null 与 G7② 性能钉互斥——非 git 会话每消息重探测即固定税，b5d00e81 时代实证）。
  const projectCache = new Map<string, Promise<{ projectRoot: string; projectName?: string } | null>>()
  const cachedResolve = (path: string): Promise<{ projectRoot: string; projectName?: string } | null> => {
    const key = norm(path)
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
    projectCache.delete(norm(projectRoot))
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
    } catch {
      header = {}
    }
    headerMemo.set(sessionId, header)
    return header
  }

  // hero 选中树记忆（select 通道推送——chip 选中显示恢复单源；键 = 归一 projectRoot）
  const lastSelection = new Map<string, string>()

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

  /** 挂靠会话计数（checks 通道）：官方 workspace record sessionIds（attachSession durable
   *  挂账——dsh-workspace entity.sessionIds）。推导制读面（binding-derivation §2.1）：
   *  归属事实读官方单源，不再遍历 forge/worktree-attach 事件。registry 缺席/解析 miss = 0
   *  （降级零计数）；读失败 fail-soft 0。 */
  const attachedSessionsOf = async (path: string): Promise<number> => {
    const registry = resolveWorkspaceRegistry()
    if (registry?.resolveByPath === undefined) return 0
    try {
      return (await registry.resolveByPath(path))?.sessionIds.length ?? 0
    } catch (cause) {
      warn(`[git-worktree] 挂靠会话计数失败（workspace record 读降级 0）：${String(cause)}`)
      return 0
    }
  }

  /** 封存判定快照（seal 通道——chip/notice/composer 数据源）。
   *  推导制读侧（binding-derivation §2.1/§2.3）：绑定 = header.cwd——实时 branch
   *  （resolveBranch）+ 盘上在场性（evaluateSeal）+ aheadBehind（worktree-ops host 解析面
   *  单点）现算；seal.blank 事件判读退役（web 回落账本 isBlank）；1.19 SessionCwdMismatch
   *  读侧拒绝位随预铸事件退役消失（推导即真，无漂移可判）。
   *  G7② 判序：request.cwd 在场时先查项目能力缓存——判非 git 直接返回（零会话日志读）。 */
  const sealStateOf = async (request: WorktreeSealRequest): Promise<WorktreeSealResult> => {
    if (request.cwd !== undefined && (await cachedResolve(request.cwd)) === null) {
      return { isGit: false, sealed: false, binding: null }
    }
    const header = await headerOf(request.sessionId)
    const cwd = header.cwd ?? request.cwd
    if (cwd === undefined || cwd === '') return { isGit: false, sealed: false, binding: null }
    const resolution = await cachedResolve(cwd)
    if (resolution === null) return { isGit: false, sealed: false, binding: null }
    const branch = await resolveBranch(cwd)
    const present = await listPresent(resolution.projectRoot).catch(() => [] as string[])
    const decision = evaluateSeal({ worktreePath: cwd, branch }, present)
    // aheadBehind = 树级操作（cwd 纪律同 aheadBehind 通道）——host 解析面单点，随 seal 通道
    // 一次带回（chip §2.3.1 内联展示数据源）；branch 落空（detached/unborn）= null 零注入
    const counts = branch === '' ? null : await aheadBehindOp(cwd, branch).catch(() => null)
    // 漂移判定（binding-derivation §2.2/§2.6）：实时 branch ≠ 留痕 branch → branchDrift
    // （banner 数据源，判定随 seal 现算）+ 触发/消除边沿 bind-drift 埋点（info）与
    // forge/binding-mismatch 推送。留痕缺读：缺留痕时首次校验以实时 branch 惰性补写
    // （补写值 ≈ 创建时刻快照，语义不失真）；读失败按「有留痕=当前」降级（fail-soft，
    // 不补写不警示）。branch 落空（detached/unborn）= 不判漂移。
    let branchDrift: { readonly bindBranch: string; readonly branch: string } | null = null
    if (branch !== '') {
      const memoKey = norm(cwd) + '|' + request.sessionId
      let bindBranch = bindBranchMemo.get(memoKey)
      if (bindBranch === undefined) {
        let found: string | null = null
        try {
          found = (await readLatestWorktreeBind(request.sessionId, readFactory))?.branch ?? null
        } catch {
          found = branch // 读失败降级（不补写——漂移校验按无漂移走，路由不受影响）
        }
        if (found === null) {
          await appendBindMarker(request.sessionId, cwd) // 惰性补写（失败 fail-soft + warn）
          found = branch
        }
        bindBranch = found
        bindBranchMemo.set(memoKey, bindBranch)
      }
      if (bindBranch !== '' && bindBranch !== branch) branchDrift = { bindBranch, branch }
      const drifted = branchDrift !== null
      const prev = driftMemo.get(request.sessionId)
      if (prev !== undefined && prev !== drifted) {
        const line =
          `[git-worktree] bind-drift ${drifted ? '触发' : '消除'}：sessionId=${request.sessionId} cwd=${cwd} ` +
          `留痕=${bindBranch} 实时=${branch}`
        deps.bindDriftDiag?.(line)
        try {
          deps.bindingMismatchEmit?.({ sessionId: request.sessionId, cwd, bindBranch, branch, drifted })
        } catch {
          // 推送失败不反压 seal 判定链（fail-soft）
        }
      }
      driftMemo.set(request.sessionId, drifted)
    }
    deps.bindDiag?.(
      `[git-worktree] session-bind 推导判定：sessionId=${request.sessionId} cwd=${cwd} branch=${branch || '(落空)'} ` +
        `sealed=${decision.sealed} aheadBehind=${counts === null ? 'null' : `${counts.ahead}/${counts.behind}`}`,
    )
    return {
      isGit: true,
      sealed: decision.sealed,
      binding: { worktreePath: cwd, branch },
      projectRoot: resolution.projectRoot,
      worktreeName: worktreeNameOf(cwd),
      aheadBehind: counts,
      branchDrift,
    }
  }

  /**
   * worktree 分支解析（attach/sessionCreate 共源——分支缺省自查 worktree list）。
   * bug 9eb9d6cb 真机反馈：unborn HEAD 仓库（git init 后零提交——temp fixture 形态）
   * 的 porcelain 无 branch 行 → 清单解析 null → 落空显式拒。兜底 = symbolic-ref 取
   * unborn 分支名（main 等——HEAD 指向存在的分支 ref， unborn 也有合法分支名）。
   */
  const resolveBranch = async (worktreePath: string, branch?: string): Promise<string> => {
    if (branch !== undefined && branch !== '') return branch
    // 性能收口：走 G7② 缓存（consult/换绑/上一次预铸已解析过同路径 → 零 git 探测重跑；
    // 此前每点击直呼 ext().resolveProject = 每次 60~120ms git 子进程固定税）
    const resolution = await cachedResolve(worktreePath).catch(() => null)
    const root = resolution?.projectRoot ?? worktreePath
    const entries = await (deps.listWorktreeEntries ?? listWorktrees)(root).catch(() => [])
    const listed = entries.find((row) => norm(row.path) === norm(worktreePath))?.branch
    if (listed !== undefined && listed !== null && listed !== '') return listed
    // unborn HEAD 兜底：symbolic-ref 取 HEAD 指向的分支短名（null/探测失败一律归 '' 落空显式拒）
    const probe = deps.symbolicRefOf ?? defaultSymbolicRefOf
    return (await probe(worktreePath).catch(() => '')) ?? ''
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
      // A6（binding-derivation 流程 A）：workspaceId 随行——present 行 resolveByPath 只读
      // 解析（官方 realpath 归一；缺席/失败/registry 缺席 = undefined 零注入；盘上缺席陈旧
      // 行跳过——bug 63180253 同径零 ENOENT 空转）
      const registry = resolveWorkspaceRegistry()
      const resolveWorkspaceId = async (path: string): Promise<string | undefined> => {
        if (registry === undefined) return undefined
        try {
          return (await registry.resolveByPath?.(path))?.id
        } catch {
          return undefined
        }
      }
      const workspaceIds = await Promise.all(
        dtos.map((dto) => (dto.present ? resolveWorkspaceId(dto.path) : Promise.resolve(undefined))),
      )
      const entriesWithIds = dtos.map((dto, i) => ({ ...dto, workspaceId: workspaceIds[i] }))
      healWorkspaceTitles(resolution, entriesWithIds)
      return {
        isGit: true,
        worktreeDir: dir,
        entries: entriesWithIds,
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

    async select(request) {
      const key = norm(request.projectRoot)
      if (request.path === undefined || request.path === '') lastSelection.delete(key)
      else lastSelection.set(key, request.path)
      return { ok: true }
    },

    // 选中态读镜像（host 唯一事实源——web sessionStorage 记忆退役后的 chip 回填正门）。
    // 无活性检查：读取是显示层消费（陈旧选中由 web 陈旧自愈 + consult 摘除各自兜底）。
    async selected(request) {
      return { path: lastSelection.get(norm(request.projectRoot)) }
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

/** forge:worktree/* 通道注册（负载映射 = contracts dto/worktree.ts，键键对应） */
export function registerWorktreeChannels(ipc: ForgeIpc, service: WorktreeRpcService): void {
  ipc.register(WORKTREE_CHANNELS.list, rpcEnvelope((q: WorktreeListRequest) => service.list(q)))
  ipc.register(WORKTREE_CHANNELS.create, rpcEnvelope((q: WorktreeCreateRequest) => service.create(q)))
  ipc.register(WORKTREE_CHANNELS.delete, rpcEnvelope((q: WorktreeDeleteRequest) => service.remove(q)))
  ipc.register(WORKTREE_CHANNELS.aheadBehind, rpcEnvelope((q: WorktreeAheadBehindRequest) => service.aheadBehind(q)))
  ipc.register(WORKTREE_CHANNELS.branches, rpcEnvelope((q: WorktreeBranchesRequest) => service.branches(q)))
  ipc.register(WORKTREE_CHANNELS.checks, rpcEnvelope((q: WorktreeChecksRequest) => service.checks(q)))
  ipc.register(WORKTREE_CHANNELS.seal, rpcEnvelope((q: WorktreeSealRequest) => service.seal(q)))
  ipc.register(WORKTREE_CHANNELS.select, rpcEnvelope((q: WorktreeSelectRequest) => service.select(q)))
  ipc.register(WORKTREE_CHANNELS.selected, rpcEnvelope((q: { projectRoot: string }) => service.selected(q)))
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
          // SessionSealedError 原样上抛（明确错误提示）；其余判读链异常 fail-open 放行。
          // 1.19 SessionCwdMismatch 读侧拒绝位随预铸绑定事件退役消失（binding-derivation
          // §2.1——seal 判读改 header.cwd 推导即真，无漂移可判）。
          const name = (cause as Error)?.name
          if (name === 'SessionSealedError') throw cause
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
