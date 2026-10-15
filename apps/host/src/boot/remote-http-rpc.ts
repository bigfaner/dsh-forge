// fix-25 webserver HTTP RPC 桥（mobile-remote-approval——bug ea46a3c8 数据面架构缺口①）。
// /remote/ 静态面同侧注册受限 RPC 端点：POST {REMOTE_HTTP_RPC_PATH}，JSON body
// {channel,payload}，响应 = RPC 信封（{ok,data}|{ok,error}——ipc 信封同语义）。
// 鉴权 = 会话 cookie 在场才可达（官方 BrowserAuth 会话——authorizeIndex 门，未配对
// 401/403 由官方面写毕）；通道 allowlist 与既有 forge:remote/* 同语义：
//   · forge:remote/progress = listTasks/taskStats 装配只读（remote-rpc.ts 同口径）；
//   · forge:remote/approval = 决策转发（forwarder 缺席 = fail-soft unavailable）；
//   · forge:projects/list   = 受限视图 projectId 上下文只读（首个项目读法单源）。
// 日志：每请求经 diag（/__rvdiag 同链——diag 桥 → harness.log）落一行（通道 + 结算态）。
// 纯 handler（fake req/res 可测）——socket/装配归 child.ts。
import {
  PROJECTS_CHANNELS,
  REMOTE_CHANNELS,
  type ForgeTasksService,
  type ProjectService,
  type RemoteApprovalDecisionInput,
  type RemoteApprovalForwardResult,
  type RemoteProgressQuery,
} from '@dsh-forge/contracts'

/** HTTP RPC 端点（/remote/ 挂载点同侧——静态前缀路由内单点分诊） */
export const REMOTE_HTTP_RPC_PATH = '/remote/__rpc'

/** 请求命中判定（分诊面——静态路由先于此分流；GET 静态请求不命中） */
export function isRemoteHttpRpcRequest(method: string, requestUrl: string): boolean {
  if (method !== 'POST') return false
  let pathname = ''
  try {
    pathname = new URL(requestUrl, 'http://dsh.invalid').pathname
  } catch {
    return false
  }
  return pathname === REMOTE_HTTP_RPC_PATH
}

/** RPC 响应写出窄面（http.ServerResponse 消费切片——fake 可测） */
export interface RpcResFace {
  writeHead(code: number, headers?: object): unknown
  end(body?: string): unknown
}

/** fake 可测响应（测试捕获面——真身 http.ServerResponse 结构兼容） */
export interface FakeRes extends RpcResFace {
  status: number
  headers: Record<string, unknown>
  body: string
}

/** 装配依赖缝（child.ts 注入真身；测试注入 fake） */
export interface RemoteHttpRpcDeps {
  /** forgeTasks 只读切片（缺席 = progress 通道 fail-soft 错误信封） */
  readonly tasks?: Pick<ForgeTasksService, 'listTasks' | 'taskStats'>
  /** forgeProjects 只读切片（缺席 = projects 通道 fail-soft 错误信封） */
  readonly projects?: Pick<ProjectService, 'listProjects'>
  /** 审批转发器（worker 侧中继——缺席 = fail-soft unavailable，remote-rpc.ts 同口径） */
  readonly forwardApproval?: (input: RemoteApprovalDecisionInput) => Promise<RemoteApprovalForwardResult>
  /** 会话门（官方 authorizeIndex——false = 官方 401 面已写毕，本 handler 零写出） */
  readonly authorize: (req: unknown, res: unknown) => boolean
  /** 诊断落链（/__rvdiag 同链——diag 桥 → harness.log） */
  readonly diag: (line: string) => void
}

/** 通道 allowlist（值 → 装配动作；形参 = 请求 payload） */
type ChannelHandler = (payload: unknown) => Promise<unknown>

/** allowlist 装配（每次请求新建——服务缺席在装配期即显形为 fail-soft 信封） */
function channelTableOf(deps: RemoteHttpRpcDeps): Record<string, ChannelHandler> {
  return {
    [REMOTE_CHANNELS.progress]: async (payload) => {
      const tasks = deps.tasks
      if (tasks === undefined) throw new Error('forgeTasks 服务缺席——progress 数据面不可达')
      const q = (payload ?? {}) as RemoteProgressQuery
      const [list, stats] = await Promise.all([
        tasks.listTasks({ projectId: q.projectId, statusFilter: q.statusFilter, sort: 'active' }),
        tasks.taskStats({ projectId: q.projectId }),
      ])
      return { tasks: list, stats }
    },
    [REMOTE_CHANNELS.approval]: async (payload) =>
      deps.forwardApproval !== undefined
        ? deps.forwardApproval(payload as RemoteApprovalDecisionInput)
        : ({ forwarded: false, reason: 'unavailable' } satisfies RemoteApprovalForwardResult),
    [PROJECTS_CHANNELS.list]: async () => {
      const projects = deps.projects
      if (projects === undefined) throw new Error('forgeProjects 服务缺席——项目上下文不可达')
      return projects.listProjects()
    },
  }
}

/** 请求体读取（chunk 收集单面） */
function readBody(req: { on(event: string, cb: (chunk: unknown) => void): unknown }): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

/**
 * HTTP RPC 分发（/remote/__rpc 单点——child.ts 静态路由内分诊后调用）：
 * 会话门 → body 解析 → allowlist 分发 → 信封写出 → diag 落链。永不 reject。
 */
export async function handleRemoteHttpRpc(
  req: Parameters<typeof readBody>[0] & { url?: string },
  res: RpcResFace,
  deps: RemoteHttpRpcDeps,
): Promise<void> {
  // 会话门 = 官方 authorizeIndex（cookie 认证语义全归官方 BrowserAuth——零自持；
  // false = 官方 401/403 面已写毕，本 handler 静默返回）
  if (!deps.authorize(req, res)) return
  let channel = ''
  let payload: unknown
  try {
    const body: unknown = JSON.parse(await readBody(req) || '{}')
    if (typeof body !== 'object' || body === null) throw new SyntaxError('body 形状非法')
    channel = typeof (body as Record<string, unknown>)?.['channel'] === 'string'
      ? (body as Record<string, unknown>)['channel'] as string
      : ''
    payload = (body as Record<string, unknown> | null)?.['payload']
  } catch {
    // 畸形 body = 400（信封面外——协议层失败）
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=(unparsable) status=bad-request`)
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end()
    return
  }
  const handler = channelTableOf(deps)[channel]
  if (handler === undefined) {
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${channel || '(none)'} status=not-found`)
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: { message: '通道不在受限 allowlist' } }))
    return
  }
  try {
    const data = await handler(payload)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, data }))
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${channel} status=ok`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: { message } }))
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${channel} status=error`)
  }
}
