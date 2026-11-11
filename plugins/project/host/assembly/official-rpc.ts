// host/assembly · official-rpc.ts —— 官方缝双面注册（plugin-project 1.33——official-rpc-audit
// 定谳：官方 sanctioned 缝 = connection.rpc.handle（通道名 /^\/[A-Za-z0-9._~-]+$/，handler
// (endpoint, payload, signal, peer) → ConnectionRpcHandlerResult），插件自有 channels face
// （dsh-forge ipcMain + preload invoke）= 自家宿主能力，官方宿主上静默不可达。
// 本面 = host 半双面注册：ctx.connection.rpc.handle feature-detect 在场即注册
// /forge-projects | /forge-bugs | /forge-worktree 三官方通道（端点 = 各族 forge:* 方法名，
// 负载映射 = contracts dto 单源键键对应）；缺席 = 诚实降级 emitDiag 留痕不注册（自家
// channels face 不受影响——双宿主可移植，官方宿主经官方面、dsh-forge 宿主经自家面）。
// 通道命名映射（forge:‹family›/‹endpoint› → /forge-‹family› + endpoint）：官方通道名禁冒号，
// 族内端点保留 contracts 方法名（client 半 rpc.call(channel, endpoint, payload) 同径）。
import type { BugsServicePort, ProjectsServicePort } from '@dsh-forge/lib-api'
import type { GetProjectRequest, UpdateProjectRequest } from '@dsh-forge/contracts'
import { emitDiagOrFallback, type DiagEventPayload } from '@dsh-forge/lib-diag'

/** 官方 connection.rpc.handle 窄面（结构兼容官方 HostConnectionRpc——注册即异步 disposer） */
export interface OfficialRpcHandleFace {
  handle(channel: string, handler: OfficialRpcHandler): unknown
}

/** 官方 handler 形状（ConnectionRpcHandler 结构窄面——endpoint/payload 两参消费） */
export type OfficialRpcHandler = (
  endpoint: string,
  payload: unknown,
) => Promise<OfficialRpcHandlerResult>

/** ConnectionRpcHandlerResult 窄面（ok/value | ok/error{code,message,details}） */
export type OfficialRpcHandlerResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false
      readonly error: { readonly code: string; readonly message: string; readonly details: object }
    }

/** ctx 窄面（connection 官方服务结构检测——inject 声明会阻载缺席宿主，故走现查 feature-detect） */
export interface OfficialRpcCtxFace {
  readonly connection?: { readonly rpc?: { readonly handle?: unknown } }
}

/** worktree 域 RPC 服务结构窄面（assembly/channels.ts 同形面——remove 投影 delete 动词） */
export interface OfficialWorktreeRpcFace {
  list(q: unknown): Promise<unknown>
  create(q: unknown): Promise<unknown>
  remove(q: unknown): Promise<unknown>
  aheadBehind(q: unknown): Promise<unknown>
  branches(q: unknown): Promise<unknown>
  checks(q: unknown): Promise<unknown>
  seal(q: unknown): Promise<unknown>
  select(q: unknown): Promise<unknown>
  selected(q: unknown): Promise<unknown>
  resolve(q: unknown): Promise<unknown>
  ensureWorkspace(q: unknown): Promise<unknown>
}

/** 三族服务缝（工厂惰性——缺族 = 该官方通道不注册，不空挂） */
export interface OfficialRpcDeps {
  readonly projects?: () => ProjectsServicePort | undefined
  readonly bugs?: () => BugsServicePort | undefined
  readonly worktrees?: OfficialWorktreeRpcFace | (() => OfficialWorktreeRpcFace | undefined)
  /** 诊断 emit 缝（emitDiagOrFallback 语义——装配侧补 process 进程位；缺席 console 兜底） */
  readonly diag?: (payload: Omit<DiagEventPayload, 'process'>) => void
  /** 行级诊断缝（装配面 line 日志——host/index.ts diag 透传） */
  readonly onDiag?: (line: string) => void
}

/** 注册结果（可观测面——官方通道清单 + 未注册族明示，不静默） */
export interface OfficialRpcRegistration {
  readonly registered: readonly string[]
  readonly degraded: readonly string[]
}

/** typed error 投影：err.code（contracts 六码域字面量）→ ConnectionRpcFailure.code；余码 internal */
function failureOf(cause: unknown): OfficialRpcHandlerResult {
  const rec = (cause ?? {}) as { code?: unknown; message?: unknown; data?: unknown }
  const code = typeof rec.code === 'string' ? rec.code : 'internal'
  const message = typeof rec.message === 'string' ? rec.message : String(cause)
  const details =
    rec.data !== undefined && rec.data !== null && typeof rec.data === 'object'
      ? (rec.data as object)
      : {}
  return { ok: false, error: { code, message, details } }
}

/** 端点分发行（endpoint → 服务方法绑定——负载映射由各通道族装配点声明） */
interface EndpointBinding {
  readonly endpoint: string
  readonly run: (payload: unknown) => Promise<unknown>
}

/** 端点分发壳：typed error / 任意抛错 → ConnectionRpcHandlerResult，永不裸抛断 transport */
async function dispatch(
  binding: EndpointBinding | undefined,
  payload: unknown,
): Promise<OfficialRpcHandlerResult> {
  if (binding === undefined) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: 'dsh-forge project host: endpoint not registered on official channel（本宿主缺该端点服务面）',
        details: {},
      },
    }
  }
  try {
    return { ok: true, value: await binding.run(payload) }
  } catch (cause) {
    return failureOf(cause)
  }
}

/** 服务方法绑定（方法面缺席 = 调用期 typed unavailable——不空挂运行期 undefined 崩） */
function bind(fn: ((q: never) => Promise<unknown>) | undefined): (payload: unknown) => Promise<unknown> {
  if (fn === undefined) {
    return async () => {
      throw new Error('dsh-forge project host: service method absent（本缝缺该方法）')
    }
  }
  return (payload) => fn(payload as never)
}

/** projects 族端点表（contracts PROJECTS_CHANNELS(+M2) 键键对应；负载映射 = dto/rpc.ts
 *  projects-rpc.ts 同缝——get/update 拆请求信封，register/reconcile 直传） */
function projectsEndpoints(port: ProjectsServicePort): readonly EndpointBinding[] {
  return [
    { endpoint: 'register', run: bind(port.registerProject) },
    { endpoint: 'list', run: async () => port.listProjects() },
    { endpoint: 'get', run: (payload) => port.getProject((payload as GetProjectRequest).id) },
    {
      endpoint: 'update',
      run: (payload) => {
        const req = payload as UpdateProjectRequest
        return port.updateProject(req.id, req.patch)
      },
    },
    { endpoint: 'reconcile', run: async () => port.reconcileAtStartup() },
    // M2 扩族（forge:projects/deriveTaskStoreDir 同径端点）——本插件 ProjectsServicePort 不承载
    // 派生行（core forgeProjects 服务专属），官方宿主上 typed unavailable 诚实拒绝。
    {
      endpoint: 'deriveTaskStoreDir',
      run: async () => {
        throw new Error('forge.projects deriveTaskStoreDir unavailable（官方宿主缝——派生行归 core 服务）')
      },
    },
  ]
}

/** bugs 族端点表（BUGS_CHANNELS list/commitFiles/fileDiff——写动词不上 RPC 面分治纪律沿袭） */
function bugsEndpoints(port: BugsServicePort): readonly EndpointBinding[] {
  return [
    { endpoint: 'list', run: bind(port.listBugs) },
    {
      endpoint: 'commitFiles',
      run: async () => {
        throw new Error('forge.bugs commitFiles unavailable（官方宿主缝——fixed 证据读面归宿主 git 面）')
      },
    },
    {
      endpoint: 'fileDiff',
      run: async () => {
        throw new Error('forge.bugs fileDiff unavailable（官方宿主缝——fixed 证据读面归宿主 git 面）')
      },
    },
  ]
}

/** worktree 族端点表（WORKTREE_CHANNELS 十一键键对应——remove 投影 delete 动词，channels.ts 同缝） */
function worktreeEndpoints(svc: OfficialWorktreeRpcFace): readonly EndpointBinding[] {
  return [
    { endpoint: 'list', run: bind(svc.list) },
    { endpoint: 'create', run: bind(svc.create) },
    { endpoint: 'delete', run: bind(svc.remove) },
    { endpoint: 'ahead-behind', run: bind(svc.aheadBehind) },
    { endpoint: 'branches', run: bind(svc.branches) },
    { endpoint: 'checks', run: bind(svc.checks) },
    { endpoint: 'seal', run: bind(svc.seal) },
    { endpoint: 'select', run: bind(svc.select) },
    { endpoint: 'selected', run: bind(svc.selected) },
    { endpoint: 'resolve', run: bind(svc.resolve) },
    { endpoint: 'ensure-workspace', run: bind(svc.ensureWorkspace) },
  ]
}

/**
 * 官方缝三通道注册（host 半双面注册——feature-detect 择优）：
 * ctx.connection.rpc.handle 在场 → 逐族注册（单族抛错只降本族，不阻其余）；
 * 缺席 → 诚实降级 emitDiag warn 留痕（官方宿主形漂移/非官方宿主——自家 channels face 不受影响）。
 */
export function registerOfficialRpcChannels(
  ctx: OfficialRpcCtxFace,
  deps: OfficialRpcDeps,
): OfficialRpcRegistration {
  const onDiag = deps.onDiag
  const diag = deps.diag
  const registered: string[] = []
  const degraded: string[] = []

  const rpcFace = ctx.connection?.rpc as { handle?: unknown } | undefined
  const handle = (rpcFace?.handle ?? undefined) as
    | ((this: unknown, channel: string, handler: OfficialRpcHandler) => unknown)
    | undefined
  if (typeof handle !== 'function') {
    const line = '[project-official-rpc] ctx.connection.rpc.handle 缺席——官方缝不注册（自家 channels face 服务本宿主）'
    onDiag?.(line)
    emitDiagOrFallback(diag, { event: 'official-rpc-register', level: 'warn', message: line })
    return { registered, degraded: ['official'] }
  }

  const families: Array<{
    readonly channel: string
    readonly endpoints: () => readonly EndpointBinding[]
  }> = []
  const projects = deps.projects?.()
  if (projects !== undefined) {
    families.push({ channel: '/forge-projects', endpoints: () => projectsEndpoints(projects) })
  }
  const bugs = deps.bugs?.()
  if (bugs !== undefined) families.push({ channel: '/forge-bugs', endpoints: () => bugsEndpoints(bugs) })
  const worktrees = typeof deps.worktrees === 'function' ? deps.worktrees() : deps.worktrees
  if (worktrees !== undefined && worktrees !== null) {
    families.push({ channel: '/forge-worktree', endpoints: () => worktreeEndpoints(worktrees) })
  }

  for (const family of families) {
    const table = family.endpoints()
    try {
      handle.call(rpcFace, family.channel, async (endpoint, payload) =>
        dispatch(
          table.find((b) => b.endpoint === endpoint),
          payload,
        ),
      )
      registered.push(family.channel)
    } catch (cause) {
      const line = `[project-official-rpc] ${family.channel} 注册抛错——本族降级（fail-soft 不阻载）：${String(cause)}`
      onDiag?.(line)
      emitDiagOrFallback(diag, {
        event: 'official-rpc-register',
        level: 'warn',
        message: line,
        channel: family.channel,
      })
      degraded.push(family.channel)
    }
  }
  onDiag?.(
    `[project-official-rpc] 官方缝注册完成：registered=[${registered.join(', ')}] degraded=[${degraded.join(', ')}]`,
  )
  return { registered, degraded }
}
