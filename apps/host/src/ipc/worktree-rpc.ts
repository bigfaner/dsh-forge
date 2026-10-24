// forge:worktree/* 通道族（worktree-branch-management fix-2——装配缺口承接）。
// 三处一体落点：contracts WORKTREE_CHANNELS → web/rpc client → 本文件注册面。
// 域实现 = packages/plugins/git-worktree（通用层 ops/session-attach/seal-guard）——host
// ipc 装配透传（typed 载荷直通插件域，零业务逻辑停留）。
// 三职责：
//   · WorktreeRpcService（child 侧服务本体）：ops 封装 + forge/worktree-bind 留痕
//     （session/created 监听 append + seal 漂移校验惰性补写，binding-derivation §2.2）+
//     官方 create 直通建会话 + 封存判定快照；
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
  type SessionBindingMismatchEvent,
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

/** 官方 SessionPersistence.open 消费切片（结构化窄面——零官方包 import；读侧 = 留痕反查/头读取） */
export interface SessionPersistenceFace {
  open(id: string, access: 'read' | 'write'): Promise<unknown>
}

/** 官方活会话消费切片（binding 留痕 append 面——Session.append 进程内直调的唯一入口；
 *  header = 官方只读头（session/created 触发径的 cwd 读取面）） */
export interface LiveSessionFace extends WorktreeBindAppendTarget {
  readonly header?: { readonly cwd?: string }
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
  sessionCreate(request: WorktreeSessionCreateRequest): Promise<WorktreeSessionCreateResult>
  seal(request: WorktreeSealRequest): Promise<WorktreeSealResult>
  select(request: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  selected(request: { readonly projectRoot: string }): Promise<{ readonly path?: string }>
  resolve(request: WorktreeResolveRequest): Promise<WorktreeResolveResult>
  /** host 必绑拦截 guard 面（1.30——非 RPC：sessionController/sessionPersistence 在场才有） */
  requiredBindingGuard(): RequiredBindingGuardFace | undefined
}

/** 绑定哨兵 guard 面（judge——interceptRequiredBinding 消费） */
export interface RequiredBindingGuardFace {
  /** 'pass' = 原会话投递；{ routeTo } = 改投显示树会话（blank 失配——换绑竞态抢跑收口，
   *  用户裁决 2026-10-24「创建的会话还是属于上一次选中的 worktree」）；异常 = typed 拒绝上抛 */
  judge(sessionId: string): Promise<'pass' | { routeTo: string }>
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
  /** unborn HEAD 分支名探测缝（git symbolic-ref --short HEAD——清单无 branch 行时兜底；
   *  缺省 = 真机 git execFile；测试注入桩。失败 = null 落空显式拒原语义） */
  readonly symbolicRefOf?: ((worktreePath: string) => Promise<string | null>) | undefined
  /** 目录 ACL 预防性补权缝（bug 4209c531——缺省 = win32 icacls 当前用户 FullControl；测试注入桩） */
  readonly ensureDirAcl?: ((path: string) => Promise<void>) | undefined
  /** worktree 一体创建缝（bug f9a23367 A′ 预铸时序——缺省 = 插件域 createWorktree 真机 git；测试注入桩） */
  readonly createWorktreeOp?: typeof createWorktree | undefined
  /**
   * 绑定表失效锚（worktree 集合变化 + 树首次挂会话——含外部裸建树首次使用）。
   * worktreePath 缺席调用（建/删树）= 集合真变，必刷新；带路径调用（预铸挂会话）=
   * 装配方按「绑定行已在册」跳过判定（性能收口：每点击省 N×git worktree list + 文件重写）。
   */
  readonly onWorktreeSetChanged?: ((worktreePath?: string) => Promise<void> | void) | undefined
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
  /** service.create 失败诊断 emit 缝（binding-derivation 流程 A）：官方 workspace 前移创建
   *  fail-soft 处 emit 诊断事件（装配方注入 emitDiag('worktree-create', warn)）；缺席 = 零 emit。 */
  readonly createDiag?: (message: string) => void
  /** seal 推导判定诊断 emit 缝（binding-derivation §2.6 session-bind 域，info 级）：
   *  装配方注入 emitDiag('session-bind', info)；缺席 = 零 emit。 */
  readonly bindDiag?: (message: string) => void
  /** 留痕 append 失败诊断 emit 缝（binding-derivation §2.6 session-bind 域，warn 级——AC：
   *  append 失败 fail-soft + emitDiag('session-bind', warn)）；缺席 = 零 emit。 */
  readonly bindWarnDiag?: (message: string) => void
  /** session/created 监听装配缝（binding-derivation §2.2 留痕前台触发源——fork 亦发布
   *  session/created，同径覆盖）：装配方以官方 ctx.on('session/created', …) 接线并传会话
   *  id，返回撤销面；缺席 = 留痕只靠惰性补写兜底。 */
  readonly onSessionCreated?: ((handler: (sessionId: string) => void) => (() => void) | undefined) | undefined
  /** 活会话解析缝（官方 sessions store 消费切片——留痕 append 的会话解析面）：缺席/解析
   *  miss（会话无活根）= 该会话留痕不可写（fail-soft 跳过）。 */
  readonly liveSessions?: (() => { get(id: string): LiveSessionFace | undefined } | undefined) | undefined
  /** 重路由目标活性探测缝（bug 4a30b193——缺省 = existsSync 盘上事实；测试注入桩） */
  readonly pathPresent?: ((path: string) => boolean) | undefined
  /** 绑定失配哨兵发射缝（WYSIWYG——用户裁决 2026-10-24）：child 经 process.send 进事件链
   *  （bridge → webContents.send → preload 订阅面 → 客户端 toast）；缺席 = 只落日志。 */
  readonly emitSessionBindingMismatch?: ((event: SessionBindingMismatchEvent) => void) | undefined
}): WorktreeRpcService {
  const warn = deps.warn ?? console.warn
  // 绑定表失效锚薄封装（恒不抛——刷新失败 = 表停在旧快照，下次 boot/注册自愈）。
  // worktreePath 缺席（建/删树）= 集合真变必刷新；带路径（预铸挂会话）由装配方判定跳过。
  const notifyWorktreeSetChanged = async (worktreePath?: string): Promise<void> => {
    if (deps.onWorktreeSetChanged === undefined) return
    try {
      await deps.onWorktreeSetChanged(worktreePath)
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
  // 留痕校验记忆（性能钉：seal 通道高频——每 (session, cwd) 只做一次「缺留痕」读+补写判定）
  const bindMarkerMemo = new Map<string, boolean>()

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

  // hero 选中树记忆（select 通道推送——创建锚定与失配哨兵的显示单源；键 = 归一 projectRoot）
  const lastSelection = new Map<string, string>()

  // G3 双建互斥（host 重路由 × client arm 共享互斥面）：sessionCreate 按 cwd 归一键记忆
  // 产物 Promise——并发调用共享同一在途编排（等待编排完成），已产物 blank 会话直接复用
  // （每 cwd 至多一个 blank 产物）；产物已非 blank（真实使用过）→ 除名允许新建。
  // 产物本体不含 cwd（外层 sessionCreate 统一回带——realpath 归一）。
  const sessionProducts = new Map<string, Promise<Omit<WorktreeSessionCreateResult, 'cwd'>>>()
  /** 后台回收入池产物（键 = 目标树 norm——与 sessionProducts 分层，命中即免预铸交付） */
  const recycledPool = new Map<string, Omit<WorktreeSessionCreateResult, 'cwd'>>()

  /** 会话工作区归属（bug 925c96d5 根因级修复）：以树路径 find-or-create 官方工作区
   *  （registry.create realpath 归一比对——契约条件 header.cwd realpath ≡ workspace.path
   *  对 cwd=树路径的会话天然成立）→ attachSession。主行（cwd=项目根）同径挂主工作区。
   *  fail-soft：registry 缺席/失败只 warn——不阻断预铸采纳主链（会话本体已可用）。 */
  // ACL 已补权目录会话期记忆（性能收口：icacls 幂等短路查询本身 30~60ms/次——每次
  // 预铸都查一遍；目录 ACL 不回退（git worktree add 产物继承链恒在），会话期记忆安全。
  // ensureDirAcl 失败不入集——下次编排重试。
  const aclGrantedDirs = new Set<string>()

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
      if (!isMainRow && !aclGrantedDirs.has(norm(worktreePath))) {
        await (deps.ensureDirAcl ?? defaultEnsureDirAcl)(worktreePath).then(
          () => {
            aclGrantedDirs.add(norm(worktreePath)) // 补权成功入集——后续编排零 icacls 查询
          },
          (cause: unknown) => {
            warn(`[git-worktree] 目录 ACL 补权失败（fail-soft——沙箱拒绝时走 diagnose 技能）：${String(cause)}`)
          },
        )
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
    // 惰性补写（binding-derivation §2.2 兜底）：缺留痕时首次漂移校验以实时 branch 补写——
    // 留痕 = 创建时刻快照，缺失（session/created 监听缺席窗口 / 历史会话）即以此刻 branch
    // 近似（诞生到首次校验之间完成切分支的概率可忽略，语义不失真）。有留痕（含 per-session
    // 记忆）零增量读。补写失败 fail-soft（appendBindMarker 内 emit warn）。
    if (branch !== '' && !bindMarkerMemo.get(norm(cwd) + '|' + request.sessionId)) {
      bindMarkerMemo.set(norm(cwd) + '|' + request.sessionId, true)
      let hasMarker = false
      try {
        hasMarker = (await readLatestWorktreeBind(request.sessionId, readFactory)) !== null
      } catch {
        hasMarker = true // 读失败不补写（fail-soft——漂移校验按无留痕降级，路由不受影响）
      }
      if (!hasMarker) await appendBindMarker(request.sessionId, cwd)
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

    async sessionCreate(request) {
      // W2 能力缺席显式拒绝（fail-closed）：git 项目 × 能力缺席 → typed error（rpcEnvelope
      // 序列化 → 前端 RpcClientError → Toast）；非 git / 瞬态窗口 → 官方原流零差异。
      if (await absentGitProbe(request.worktreePath)) throw new WorktreeCapabilityAbsentError(request.worktreePath)
      // WYSIWYG 收敛（用户裁决 2026-10-24「为什么要记忆」）：请求路径即创建目标——调用方
      // 显式传参承担所见即所得（UI 显示什么就传什么，主树也是显式传根），host 零选中记忆
      // 劫持、零猜测。选中记忆（lastSelection）只剩两个消费者：selected() 读镜像（chip
      // 回填/显示恢复）与发送哨兵 displayed 判读，均不参与创建路由。
      const targetPath = request.worktreePath
      // 前置活性守卫（bug 9eb9d6cb 真机反馈——temp fixture 残留路径以生裸「分支解析失败」
      // 冒出）：目标路径盘上缺席 → WorktreeTargetAbsentError typed 显式拒绝。wrap 径
      // fail-open 回官方原流（零行为差异）。
      if (!presentOf(targetPath)) throw new WorktreeTargetAbsentError(targetPath)
      // bug 2bc90d64：产物头 cwd 回带（realpath 归一——与 doSessionCreate 预铸头同口径）。
      // 客户端 wrap 拿它走官方 session.create({sessionId, cwd}) adopt 正门补客户端账本——
      // cwd 即 header.cwd 相等校验的对位键。
      const productCwd = await realpath(targetPath).catch(() => targetPath)
      const key = norm(targetPath)
      const registry = resolveWorkspaceRegistry()
      const archivedOf = (): readonly string[] => registry?.archivedSessionIds ?? []
      const g3Start = Date.now()
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
          warn(`[git-worktree] 创建会话复用：id=${reused.sessionId} 目标=${targetPath} 等待=${Date.now() - g3Start}ms`)
          if (archivedOf().includes(reused.sessionId)) {
            // 归档占位交付前 cwd 核验（bug ff324cad）：推导制绑定 = header.cwd（创建时点
            // 定死、终身不可变）——cwd ≠ 目标树的漂移占位不可当目标树产物交付，降级新建。
            const boundCwd = (await headerOf(reused.sessionId)).cwd
            if (boundCwd === undefined || norm(boundCwd) !== norm(targetPath)) {
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
          return { ...reused, cwd: productCwd }
        }
        sessionProducts.delete(key) // 产物已被真实使用（非 blank）→ 允许新建
      }
      // 复用池先行（后台回收的产物——不入 G3 活池避免覆盖语义，分层独立）：命中且活性/
      // blank 复验通过 → 直接交付（零预铸）。不可用 = 弃池降级预铸。
      const pooled = recycledPool.get(key)
      if (pooled !== undefined) {
        recycledPool.delete(key)
        if (!archivedOf().includes(pooled.sessionId) && (await blankOf(pooled.sessionId))) {
          warn(`[git-worktree] 创建会话复用入池产物：id=${pooled.sessionId} 目标=${targetPath}`)
          return { ...pooled, cwd: productCwd }
        }
        warn(`[git-worktree] 入池产物失效（弃池降级预铸）：id=${pooled.sessionId}`)
      }
      warn(`[git-worktree] 创建会话入口：请求=${request.worktreePath} 目标=${targetPath}（G3 无可复用产物——走官方 create 直通，回收转后台）`)
      // G3 互斥：预铸编排先行交付（业务顺序优先——回收扫描 36 候选 5.4s 实证不能占关键
      // 路径），命中入池供后续创建复用：
      const pending = (async (): Promise<Omit<WorktreeSessionCreateResult, 'cwd'>> => {
        const result = await doSessionCreate({ ...request, worktreePath: targetPath })
        // 绑定表锚后台化（性能收口）：刷新（N×git worktree list + 文件重写，~百 ms）不阻塞
        // 会话交付——会话本体已可用，绑定表晚几拍落盘无正确性影响（fail-soft 自愈语义不变）
        const anchorStart = Date.now()
        void notifyWorktreeSetChanged(targetPath).catch((cause: unknown) => {
          warn(`[git-worktree] 创建会话绑定表锚失败（fail-soft 自愈语义不变）：${String(cause)}`)
        })
        warn(`[git-worktree] 创建会话完成（绑定表锚后台化 ${Date.now() - anchorStart}ms 已发起）`)
        // 占位回收后台化（性能收口——用户裁决「先保证业务正常，再考虑异步提升性能」）：
        // 扫描本会话交付后后台跑，命中 → unarchive + 入池，下一次 sessionCreate 走 G3
        // 复用快路径（235ms 实测）。业务正确性零依赖——本会话已交付，命中与否只影响
        // 下一次创建快慢。registry 归档面缺席 = 恒不命中（回收面降级，行为同新建）。
        void recycleArchivedBlank(targetPath, key)
        return result
      })()
      sessionProducts.set(key, pending)
      try {
        // bug 2bc90d64：预铸/回收两径统一补产物头 cwd（adopt 正门对位键）——非 git 回退径
        // 的 controller.create({cwd}) 同用 realpath(targetPath) 作头 cwd，同键成立。
        const product = await pending
        return { ...product, cwd: productCwd }
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

    requiredBindingGuard() {
      if (deps.sessionController === undefined || deps.sessionPersistence === undefined) return undefined
      return {
        // WYSIWYG 哨兵（用户裁决 2026-10-24）：绑定树必须 == chip 显示树（main worktree 也是
        // worktree）。git 项目 ∧ blank ∧ chip 选中在场 ∧ 绑定 ≠ 显示 → 失配事件（toast + 日志）
        // + 改投显示树会话（预铸/复用——换绑竞态抢跑收口：预铸 0.7~2.2s 窗口里首条消息总落
        // 旧树）。chip 选中缺席 = 用户未做树选择，打开的会话绑定即所见——零干预零提示。
        // 非 blank 既有会话零打扰；worker/fork 子会话归官方子代理机械所有恒放行；
        // cwd 漂移（SessionCwdMismatchError）原样上抛 = 拒绝（A5）。
        judge: async (sessionId) => {
          const header = await headerOf(sessionId)
          if (header.parentSession !== undefined) return 'pass' // 子会话非 hero 人口
          const cwd = header.cwd
          if (cwd === undefined || cwd === '') return 'pass'
          // W2 能力缺席显式拒绝（fail-closed）：git 项目 × 能力缺席 → 稳定 name 错误上抛
          // （经官方 Remote 错误面进 composer）；非 git / 瞬态窗口 → fail-open 现状放行。
          if (await absentGitProbe(cwd)) throw new WorktreeCapabilityAbsentError(cwd)
          const resolution = await cachedResolve(cwd)
          if (resolution === null) return 'pass' // 非 git：零行为差异（G7 分流）
          // 推导制绑定（binding-derivation §2.1）：绑定 = header.cwd（上面已读）——
          // forge/worktree-attach 事件台账读侧退役，cwd 即真，无漂移可判（SessionCwdMismatch
          // 拒绝位随之消失）。
          if (!(await blankOf(sessionId))) return 'pass' // 非 blank 既有会话 = 绑定决定，零打扰
          // 所见 = chip 显示树（选中记忆）。缺席 = 用户本回合并未做树选择——打开的会话
          // 其绑定即所见（会话 chip 直出绑定），零干预零提示（误报源收口——存量 blank
          // 会话打开再发送不再是「失配」）。
          const selected = lastSelection.get(norm(resolution.projectRoot))
          if (selected === undefined) return 'pass'
          const displayed = selected
          if (norm(cwd) === norm(displayed)) return 'pass' // 绑定 ≡ 显示 ✓
          // 失配（blank）：事件（toast）+ 日志 + **改投显示树会话**（预铸/复用）——换绑
          // 编排 0.7~2.2s 竞态窗口里首条消息总落旧树（bug 实证日志 18:04-18:06 全程
          // 复现），原会话投递即所见即所得违约。改投链失败 = fail-open 原会话投递。
          deps.emitSessionBindingMismatch?.({
            sessionId,
            binding: cwd,
            displayed,
          })
          deps.failOpenDiag?.(
            `[git-worktree] 绑定失配（WYSIWYG 哨兵）：会话 ${sessionId} 绑定 ${cwd} ≠ chip 显示 ${displayed}——改投显示树`,
          )
          try {
            const product = await service.sessionCreate({ worktreePath: displayed })
            return { routeTo: product.sessionId }
          } catch (cause) {
            deps.failOpenDiag?.(`[git-worktree] 哨兵改投失败（fail-open 原会话投递）：${String(cause)}`)
            return 'pass'
          }
        },
      }
    },

    seal: sealStateOf,
  }

  /** 官方 create 直通的单会话创建径（binding-derivation §2.1 推导制——预铸采纳配方退役：
   *  零自铸 id、零 persistence.create、零预铸绑定事件；绑定 = header.cwd 由官方 create
   *  时点定死）。cwd 由 sessionCreate 外层统一回带（realpath 归一），本径不产。 */
  async function doSessionCreate(request: WorktreeSessionCreateRequest): Promise<Omit<WorktreeSessionCreateResult, 'cwd'>> {
    const t0 = Date.now()
    const stage = (label: string, since: number): number => {
      const ms = Date.now() - since
      warn(`[git-worktree] 创建会话计时：${request.worktreePath} ${label} ${ms}ms`)
      return ms
    }
    const controller = deps.sessionController
    if (controller === undefined) throw new Error('sessionController 缺席（host 装配漂移）——无法以 worktree cwd 建会话')
    // A12 入 create 前 realpath 归一（第四维）：subst/junction/symlink/8.3 短名/大小写拼写收敛
    // 为磁盘真值——与官方 attachSession「header.cwd realpath ≡ workspace.path」比对口径对齐。
    // 可达则归一、失败 fail-soft 回退原拼写（canonicalizeDir 同判）。
    let t = Date.now()
    const cwd = await realpath(request.worktreePath).catch(() => request.worktreePath)
    stage('realpath', t)
    t = Date.now()
    const branch = await resolveBranch(cwd)
    stage('分支解析', t)
    // 分支解析落空（detached HEAD 检出 / 清单路径失配或失败）在边界显式拒——branch 是返回
    // 契约与留痕快照的数据源，落空即拒、不落半截会话。
    if (branch === '') {
      // bug 878192ec（用户裁决 2026-10-22）：非 git 目录（resolveProject null——如 Z:\tmp）
      // cwd 直建回退——非 git 项目本无 worktree/分支语义，桌面端经官方 workspaceId 径可建，
      // 远程域唯一数据门 = 本通道，拒绝即「无建会话路径」。controller.create({cwd}) 零分支，
      // 权限补钉 + 工作区归属 fail-soft（会话已建不因归属面回滚）。
      // git 仓库（含 detached HEAD）不回退——挂靠契约拒绝原语义不变（b6b88f49/488e860d）。
      const isRepo = (await cachedResolve(cwd).catch(() => null)) !== null
      if (!isRepo) {
        const created = await controller.create({ cwd })
        await pinAdoptedPermission(created.sessionId).catch(() => {})
        await attachWorkspace(cwd, created.sessionId).catch(() => {})
        return { sessionId: created.sessionId, branch: '' }
      }
      // bug 488e860d 存量选中自愈（host 侧）：拒绝即摘 lastSelection 中该树记忆——
      // 桌面 create-wrap 每次首条消息按 selected() 携带 worktreePath，不清则同一
      // 不可挂靠树失败循环（fail-open 每次都带同一路径）。
      for (const [key, value] of lastSelection) {
        if (norm(value) === norm(cwd)) lastSelection.delete(key)
      }
      throw new Error(`worktree 分支解析失败（detached HEAD 检出或清单失配），无法创建挂靠会话：${cwd}`)
    }
    // 官方 session.create 直通（零预铸零 adopt 两段式）：agentPreset 由官方 composeAgent
    // 链原生解析（registry defaultId 兜底——预铸头自携档随预铸配方退役）。
    t = Date.now()
    const created = await controller.create({ cwd })
    stage('官方 create', t)
    // bug e5059ee1：adopt（= resume 既有日志）后官方 permission 钉档走「已种子化」分支落
    // 组合缺省，绕过 defaultPreset——装配方经官方 permissionPresets.set 补钉用户缺省档
    t = Date.now()
    await pinAdoptedPermission(created.sessionId)
    stage('权限钉档', t)
    // bug 925c96d5：创建后即挂工作区归属（composer 门控/模式/侧栏可见性的官方单源）
    t = Date.now()
    await attachWorkspace(cwd, created.sessionId)
    stage('工作区归属', t)
    warn(
      `[git-worktree] 创建会话完成：id=${created.sessionId} 树=${cwd} 分支=${branch} ` +
        `总耗时=${Date.now() - t0}ms`,
    )
    return { sessionId: created.sessionId, branch }
  }

  /**
   * 占位回收后台扫描（性能收口——用户裁决「先保证业务正常，再考虑异步提升性能」）：
   * 归档集逐候选判 绑定 ≡ 目标树 ∧ blank，命中 → unarchive 回活 + 入 G3 产物池（幂等：
   * key 已有在途/既有产物不覆盖）。命中与否零影响已交付会话——只决定下一次创建走
   * 复用快路径（实测 235ms）还是再预铸。全链日志留痕，失败降级不静默。
   */
  async function recycleArchivedBlank(targetPath: string, key: string): Promise<void> {
    const scanStart = Date.now()
    try {
      const registry = resolveWorkspaceRegistry()
      if (registry?.unarchiveSession === undefined || registry.archivedSessionIds === undefined) return
      let recycledId: string | undefined
      for (const sid of registry.archivedSessionIds) {
        // 推导制绑定（binding-derivation §2.1）：绑定 = header.cwd（事件台账读侧退役）
        const cwd = (await headerOf(sid)).cwd
        if (cwd === undefined || norm(cwd) !== norm(targetPath)) continue
        if (!(await blankOf(sid))) continue
        recycledId = sid // 不 break——归档序取最后命中（近似最新）
      }
      warn(
        `[git-worktree] 占位回收扫描（后台）：目标=${targetPath} 候选=${registry.archivedSessionIds.length} ` +
          `命中=${recycledId ?? '无'} 耗时=${Date.now() - scanStart}ms`,
      )
      if (recycledId === undefined) return
      try {
        await registry.unarchiveSession(recycledId)
      } catch (cause) {
        warn(`[git-worktree] 占位回收 unarchive 失败（放弃本轮回收）：${String(cause)}`)
        return
      }
      if (recycledPool.has(key)) return // 入池幂等：重复扫描不覆盖
      recycledPool.set(key, { sessionId: recycledId, branch: await resolveBranch(targetPath) })
      warn(`[git-worktree] 占位回收入池：id=${recycledId} 目标=${targetPath}（下次创建走复用快路径）`)
    } catch (cause) {
      warn(`[git-worktree] 占位回收扫描失败（降级——下次创建再扫）：${String(cause)}`)
    }
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
 * 1.30 第二层 prompt 拦截（绑定哨兵）——叠加现役 interceptSessionSends 之上（官方
 * commands.prompt 调用时属性查找：本层先于封存层执行）。judge 恒 'pass'（失配只发
 * 哨兵事件 + 日志，投递零干预）；判读链异常 fail-open 放行；SessionCwdMismatchError
 * （A5）与 W2 缺席 typed 拒绝原样上抛。trace 缝注入（1.2 链 B）：prompt 入口生成
 * trace_id 并以 ALS 包裹整链（缺席 = 原样零差异）。
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
        // 哨兵判读（fail-open 域）：judge 链异常放行（正确性不依赖此径）；A5/W2 typed 拒绝原样上抛
        try {
          const verdict = await guard.judge(sessionId)
          if (typeof verdict === 'object' && verdict !== null) {
            // 改投（blank 失配——首条消息投显示树会话）：请求体换 sessionId 后原链投递
            warn(`[git-worktree] 绑定哨兵改投：${sessionId} → ${verdict.routeTo}（首条消息投显示树）`)
            if (args[0] !== undefined && typeof args[0] === 'object') {
              args[0] = { ...(args[0] as Record<string, unknown>), sessionId: verdict.routeTo }
            }
          }
        } catch (cause) {
          const name = (cause as Error)?.name
          if (name === 'SessionCwdMismatchError' || name === 'WorktreeCapabilityAbsentError') throw cause // A5：拒绝不放行；W2 缺席拒绝同径
          warn(`[git-worktree] 绑定哨兵判读失败（fail-open 放行）：${String(cause)}`)
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
