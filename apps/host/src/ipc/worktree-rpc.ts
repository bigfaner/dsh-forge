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
import {
  WORKTREE_CHANNELS,
  type WorktreeAheadBehindRequest,
  type WorktreeAheadBehindResult,
  type WorktreeAttachRequest,
  type WorktreeAttachResult,
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
  type WorktreeSessionCreateRequest,
  type WorktreeSessionCreateResult,
} from '@dsh-forge/contracts'
import {
  createWorktree,
  createWorktreeAttachWriter,
  preseedWorktreeSession,
  type SessionPersistenceCreateFace,
  defaultBranch as defaultBranchOp,
  deleteWorktree,
  aheadBehind as aheadBehindOp,
  listBranches,
  listWorktrees,
  readLatestAttach,
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
  /** 预铸新持久会话（header 契约：id + createdAt + cwd + version 当前格式版 + isSeeded:false；返回初始写句柄） */
  create(header: {
    readonly id: string
    readonly createdAt: number
    readonly cwd: string
    readonly version: number
    readonly isSeeded: boolean
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
  'attach',
  'sessionCreate',
  'seal',
] as const

/** forge:worktree/* RPC 服务面（child 侧本体 / main 侧桥代理同形） */
export interface WorktreeRpcService {
  list(request: WorktreeListRequest): Promise<WorktreeListResult>
  create(request: WorktreeCreateRequest): Promise<WorktreeCreateResult>
  remove(request: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>
  aheadBehind(request: WorktreeAheadBehindRequest): Promise<WorktreeAheadBehindResult>
  branches(request: WorktreeBranchesRequest): Promise<WorktreeBranchesResult>
  checks(request: WorktreeChecksRequest): Promise<WorktreeChecksResult>
  attach(request: WorktreeAttachRequest): Promise<WorktreeAttachResult>
  sessionCreate(request: WorktreeSessionCreateRequest): Promise<WorktreeSessionCreateResult>
  seal(request: WorktreeSealRequest): Promise<WorktreeSealResult>
}

const noGit: WorktreeListResult = { isGit: false, entries: [] }

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
  /** 在场清单注入缝（单测替身；缺省 = 插件域 listWorktrees 真机 git） */
  readonly listPresent?: ((projectRoot: string) => Promise<readonly string[]>) | undefined
  /** worktree 清单注入缝（branch 解析面——缺省 = 插件域 listWorktrees 真机 git） */
  readonly listWorktreeEntries?: ((projectRoot: string) => Promise<readonly { path: string; branch: string | null }[]>) | undefined
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
  const writeFactory = {
    openWrite: async (sessionId: string) => deps.sessionPersistence?.open(sessionId, 'write') as never,
  }
  const writer = createWorktreeAttachWriter(writeFactory)

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

  /** 封存判定快照（seal 通道 + 发送拦截共源） */
  const sealStateOf = async (request: WorktreeSealRequest): Promise<WorktreeSealResult> => {
    const binding = await readLatestAttach(request.sessionId, readFactory).catch(() => null)
    if (binding === null) return { isGit: false, sealed: false, binding: null }
    const resolution = await ext().resolveProject(binding.worktreePath).catch(() => null)
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

  return {
    async list(request) {
      const resolution = await ext().resolveProject(request.projectRoot).catch(() => null)
      if (resolution === null) return noGit
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
      const counts = await aheadBehindOp(request.projectRoot, entry.branch).catch(() => null)
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
        ? await aheadBehindOp(request.projectRoot, entry.branch).catch(() => null)
        : null
      return {
        dirtyCount: status.dirtyCount,
        aheadCount: ahead?.ahead ?? 0,
        attachedSessions,
      }
    },

    async attach(request) {
      const branch = await resolveBranch(request.worktreePath, request.branch)
      const event = await writer.attach(request.sessionId, { worktreePath: request.worktreePath, branch })
      return { attached: true, branch: event.branch, seq: event.seq }
    },

    async sessionCreate(request) {
      const controller = deps.sessionController
      if (controller === undefined) throw new Error('sessionController 缺席（host 装配漂移）——无法以 worktree cwd 建会话')
      const persistence: SessionPersistenceFace | undefined = deps.sessionPersistence
      if (persistence === undefined || typeof persistence.create !== 'function') {
        throw new Error('sessionPersistence 缺席或缺 create 面（host 装配漂移）——预铸采纳配方不可用')
      }
      const branch = await resolveBranch(request.worktreePath)
      // 1.16 预铸采纳配方（Root cause: 官方 agent loop 自 controller.create 起即持有会话
      // 唯一写句柄——建会话后另开写句柄补写挂靠事件在活会话上结构性不可行）。改为：先
      // persistence.create 预铸（自铸 id + cwd 头）→ 初始句柄写挂靠事件（seq 0, ignorable）
      // → flush + close，再 controller.create({sessionId, cwd}) 官方 adopt/resume——写句柄
      // 生命周期零交叠，单写者铁律满足。
      const preseeded = await preseedWorktreeSession(persistence as unknown as SessionPersistenceCreateFace, {
        worktreePath: request.worktreePath,
        branch,
      })
      await controller.create({ sessionId: preseeded.sessionId, cwd: request.worktreePath })
      return { sessionId: preseeded.sessionId, branch }
    },

    seal: sealStateOf,
  }
}

/** forge:worktree/* 通道注册（负载映射 = contracts dto/worktree.ts，键键对应） */
export function registerWorktreeChannels(ipc: ForgeIpc, service: WorktreeRpcService): void {
  ipc.register(WORKTREE_CHANNELS.list, rpcEnvelope((q: WorktreeListRequest) => service.list(q)))
  ipc.register(WORKTREE_CHANNELS.create, rpcEnvelope((q: WorktreeCreateRequest) => service.create(q)))
  ipc.register(WORKTREE_CHANNELS.delete, rpcEnvelope((q: WorktreeDeleteRequest) => service.remove(q)))
  ipc.register(WORKTREE_CHANNELS.aheadBehind, rpcEnvelope((q: WorktreeAheadBehindRequest) => service.aheadBehind(q)))
  ipc.register(WORKTREE_CHANNELS.branches, rpcEnvelope((q: WorktreeBranchesRequest) => service.branches(q)))
  ipc.register(WORKTREE_CHANNELS.checks, rpcEnvelope((q: WorktreeChecksRequest) => service.checks(q)))
  ipc.register(WORKTREE_CHANNELS.attach, rpcEnvelope((q: WorktreeAttachRequest) => service.attach(q)))
  ipc.register(WORKTREE_CHANNELS.sessionCreate, rpcEnvelope((q: WorktreeSessionCreateRequest) => service.sessionCreate(q)))
  ipc.register(WORKTREE_CHANNELS.seal, rpcEnvelope((q: WorktreeSealRequest) => service.seal(q)))
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
          // SessionSealedError 原样上抛（明确错误提示）；判读链异常 fail-open 放行
          if ((cause as Error)?.name === 'SessionSealedError') throw cause
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
