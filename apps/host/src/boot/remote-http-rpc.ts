// fix-25 webserver HTTP RPC 桥（mobile-remote-approval——bug ea46a3c8 数据面架构缺口①）。
// /remote/ 静态面同侧注册受限 RPC 端点：POST {REMOTE_HTTP_RPC_PATH}，JSON body
// {channel,payload}，响应 = RPC 信封（{ok,data}|{ok,error}——ipc 信封同语义）。
// 鉴权 = 会话 cookie 在场才可达（官方 BrowserAuth 会话——authorizeIndex 门，未配对
// 401/403 由官方面写毕）；通道 allowlist 与既有 forge:remote/* 同语义：
//   · forge:remote/progress = listTasks/taskStats 装配只读（remote-rpc.ts 同口径）；
//   · forge:remote/approval = 决策转发（forwarder 缺席 = fail-soft unavailable）；
//   · forge:projects/list   = 受限视图 projectId 上下文只读（首个项目读法单源）；
//   · forge:proxy/*（1.11）  = 官方能力 in-process 代理通道族 + forge 原生 grouped/
//     approval/disconnect（proxy-channels.ts 本体——mobile 唯一数据通道）。
// 隧道域（Host 非 loopback/非 IP 字面量）+ PSK 配置在场 ⇒ 信封强制（tunnel-psk v3 §5）：
// 入口拦截器 = 唯一 401 owner——统一 401 + 恒定体 + 填充，dswf/authorizeIndex 放行也拒；
// 解密前 channel 字面量不进 diag（定长标记替代——日志注入/枚举分型消解）。
// 日志：每请求经 diag（/__rvdiag 同链——diag 桥 → harness.log）落一行（结算态 + 脱敏通道）。
// 纯 handler（fake req/res 可测）——socket/装配归 child.ts。
import { REMOTE_CHANNELS, PROJECTS_CHANNELS, type ForgeTasksService, type ProjectService, type RemoteApprovalDecisionInput, type RemoteApprovalForwardResult, type RemoteProgressQuery } from '@dsh-forge/contracts'
import { isPskEnforcedHost, writeConstant401 } from './psk.js'
import { admitPskRequest, type PskGateDeps } from './psk-gate.js'
import { proxyChannelTableOf, type ProxyChannelDeps } from './proxy-channels.js'

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

/** diag 通道脱敏定长标记（解密前 channel 字面量不进日志——tunnel-psk v2/H2） */
export const DIAG_CHANNEL_REDACTED = 'channel=<redacted>'

/** RPC 响应写出窄面（http.ServerResponse 消费切片——fake 可测；headersSent = bug 12f3590f
 *  二次派发防护——上游路由对同一请求二次进入 handler 时已发头，绝无二次写出） */
export interface RpcResFace {
  writeHead(code: number, headers?: object): unknown
  end(body?: string): unknown
  readonly headersSent?: boolean
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
  readonly projects?: Pick<ProjectService, 'listProjects' | 'getProject'>
  /** 审批转发器（worker 侧中继——缺席 = fail-soft unavailable，remote-rpc.ts 同口径） */
  readonly forwardApproval?: (input: RemoteApprovalDecisionInput) => Promise<RemoteApprovalForwardResult>
  /** 会话门（官方 authorizeIndex——false = 官方 401 面已写毕，本 handler 零写出） */
  readonly authorize: (req: unknown, res: unknown) => boolean
  /** 诊断落链（/__rvdiag 同链——diag 桥 → harness.log） */
  readonly diag: (line: string) => void
  /** forge:proxy/* 代理通道族依赖缝（缺席 = proxy 族通道 fail-soft 错误信封） */
  readonly proxy?: ProxyChannelDeps
  /** PSK 准入门（tunnel-psk v3——配对 PIN 读法由装配注入；门未配置 = 旧门语义过渡期） */
  readonly psk?: PskGateDeps
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
    ...proxyChannelTableOf(deps.proxy ?? {}),
  }
}

/**
 * dswf 受限视图入口 cookie 在场判定（自持配对语义——child.ts /pair、/pair/verify 成功面
 * Set-Cookie dswf_forge_remote=1；在场 = 配对握手已认证。只判名不读值）。
 */
export function hasRemoteViewCookie(headers: unknown): boolean {
  const raw = (headers as { cookie?: unknown } | null | undefined)?.cookie
  if (typeof raw !== 'string') return false
  return raw.split(';').some((segment) => segment.trim().startsWith(`${REMOTE_VIEW_COOKIE_NAME}=`))
}

/** dswf 受限视图入口 cookie 名（child.ts REMOTE_VIEW_COOKIE 同名单源） */
export const REMOTE_VIEW_COOKIE_NAME = 'dswf_forge_remote'

/**
 * POST /remote/__rpc 专供门（fix-27 bug b9bfb9d3）：官方 authorizeIndex 放行优先（零自持
 * 语义保持）；官方会话 cookie 拒绝时，dswf_forge_remote cookie 在场即放行——配对握手
 * （/pair token 或 /pair/verify PIN）已认证语义，官方会话门仅用于 GET 页面。Root cause:
 * 官方 BrowserAuth 会话 cookie 按 Host authority 绑定（isAuthenticated 逐字比对），隧道域
 * 下手机 POST 被拒而 GET 页面通过的三类断点（authority 派生不一致/fetch cookie 缺席/官方
 * POST 分支语义）皆由自持兜底覆盖，真断点由 401 诊断行在真机日志定位。
 * 隧道域数据面 POST 另受 PSK 信封强制（本文件分发器内——dswf 放行 ≠ 数据可达）。
 */
export function authorizeRemoteRpc(req: unknown, res: unknown, authorizeIndex: (req: unknown, res: unknown) => boolean): boolean {
  if (authorizeIndex(req, res)) return true
  return hasRemoteViewCookie((req as { headers?: unknown } | null | undefined)?.headers)
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
 * 会话门 → body 读取 → 隧道域 PSK 信封强制（唯一 401 owner）→ allowlist 分发 → 信封写出
 * → diag 落链（channel 脱敏）。永不 reject。
 */
export async function handleRemoteHttpRpc(
  req: Parameters<typeof readBody>[0] & { url?: string; headers?: Record<string, unknown> },
  res: RpcResFace,
  deps: RemoteHttpRpcDeps,
): Promise<void> {
  // bug 12f3590f：上游 webserver 路由层对同一 /remote/__rpc 请求可能二次派发（现场：
  // not-found 404 后紧跟 401 → writeConstant401 撞已发头 → ERR_HTTP_HEADERS_SENT fatal
  // 宿主崩溃）。headersSent = 前次调用已写毕——diag 落链即静默返回，契约「永不 reject /
  // 永不二次写出」成立。
  if (res.headersSent === true) {
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} status=already-sent（二次派发静默跳过）`)
    return
  }
  // 会话门 = 官方 authorizeIndex（cookie 认证语义全归官方 BrowserAuth）；false = 官方
  // 401/403 面已写毕，本 handler 静默返回——但先落一行诊断（fix-27 bug b9bfb9d3：401
  // 路径零日志是诊断盲区；method/host/cookie 有无，不含值）
  if (!deps.authorize(req, res)) {
    const { method, headers } = req as { method?: unknown; headers?: Record<string, unknown> }
    deps.diag(
      `[pair-diag] ${REMOTE_HTTP_RPC_PATH} method=${String(method ?? '')} host=${JSON.stringify(String(headers?.['host'] ?? ''))} cookie=${typeof headers?.['cookie'] === 'string' ? 'present' : 'absent'} status=unauthorized`,
    )
    return
  }
  const table = channelTableOf(deps)
  const rawBody = await readBody(req)
  const hostHeader = typeof (req as { headers?: Record<string, unknown> }).headers?.['host'] === 'string'
    ? (req as { headers: Record<string, unknown> }).headers['host'] as string
    : undefined
  // 隧道域 + PSK 配置在场 ⇒ 信封强制（v2/C1+H4，A3 生效域）：无信封/验签失败/未知通道
  // 一律统一 401（恒定体 + 填充）——dswf/authorizeIndex 放行也拒；明文零降级路径。
  if (deps.psk !== undefined && isPskEnforcedHost(hostHeader) && deps.psk.load() !== undefined) {
    const verdict = admitPskRequest(deps.psk, rawBody, (channel) => table[channel] !== undefined)
    if (!verdict.ok) {
      deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} ${DIAG_CHANNEL_REDACTED} status=unauthorized`)
      writeConstant401(res)
      return
    }
    try {
      const handler = table[verdict.channel]
      if (handler === undefined) throw new Error('通道不在受限 allowlist')
      // bug 8b97047a：准入后通道 ∈ allowlist 白名单常量集——diag 落真实通道名（无注入/枚举面；
      // 未准入路径仍 <redacted>）
      const diagChannel = `channel=${verdict.channel}`
      const data = await handler(verdict.payload)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(verdict.reply(data))
      deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} ${diagChannel} status=ok`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(verdict.replyError(message))
      // bug 7d26b074 + 8b97047a：准入后通道名 + 消息落 diag；官方 RemoteError 携 details
      // （如 session/agent-busy 的 reason=内层异常串）——一并落链可归因
      const details = (error as { details?: unknown }).details
      deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${verdict.channel} status=error ${message}${details === undefined ? '' : ` details=${JSON.stringify(details)}`}`)
    }
    return
  }
  let channel = ''
  let payload: unknown
  try {
    const body: unknown = JSON.parse(rawBody || '{}')
    if (typeof body !== 'object' || body === null) throw new SyntaxError('body 形状非法')
    channel = typeof (body as Record<string, unknown>)?.['channel'] === 'string'
      ? (body as Record<string, unknown>)['channel'] as string
      : ''
    payload = (body as Record<string, unknown> | null)?.['payload']
  } catch {
    // 畸形 body = 400（信封面外——协议层失败）
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} ${DIAG_CHANNEL_REDACTED} status=bad-request`)
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end()
    return
  }
  const handler = table[channel]
  if (handler === undefined) {
    // bug 12f3590f 同批：allowlist miss 落真实通道名（404 本就暴露，无泄露面——重复再现
    // 的 not-found 可归因到具体通道）
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${channel} status=not-found`)
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: { message: '通道不在受限 allowlist' } }))
    return
  }
  try {
    const data = await handler(payload)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, data }))
    // bug 8b97047a：allowlist 命中后通道名落 diag（常量集——无注入/枚举面）
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${channel} status=ok`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: { message } }))
    // bug 7d26b074 + 8b97047a：准入后通道名 + 消息落 diag；官方 RemoteError details 同批（PSK 分支同改）
    const details = (error as { details?: unknown }).details
    deps.diag(`[pair-diag] ${REMOTE_HTTP_RPC_PATH} channel=${channel} status=error ${message}${details === undefined ? '' : ` details=${JSON.stringify(details)}`}`)
  }
}
