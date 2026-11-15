// knowledge 插件 host 半连接 RPC（fix-9——bug 1c2a603e 官方正缝 host 半）：
// 官方 exact Fetch-route 缝（上游 rpc.d.ts ConnectionFetchRoute + session-log-export
// 先例正本核销：ctx.connection.fetch.register 逐 endpoint 一条精确 /api/<endpoint>
// POST 路由，落座 = connection 服务内建 fetchRoutes 表——由既有 /api 共享路由分发，
// 零 webServer 依赖；注：/api interceptor 席位归官方 api-gateway 独占
// ——gateway src/index.ts:248-254，第三方零可用，先例裁决记）。
// 客户端 = connection.rpc.call('/api', endpoint, payload)（官方 web caller POST
// ClientRequest 信封）；本侧 route handler 解 ClientRequest（官方 clientRequestSchema
// 门）/ 校验 method↔endpoint / 应答 ServerResponse 信封（rpcResultSchema 形状）。
// knowledge 七端点（BrowseKnowledgeService 浏览/裁决/反馈法——apps/host ipc
// knowledge-rpc.ts 同语义分派，插件域自持副本：host main pin 禁插件源码反向 import）
// + projects 两端点（knowledge UI 消费切片 list/get——core forgeProjects 具名服务
// 优先（dsh-forge 集成态运营真源单源），缺席回落官方 workspaceRegistry 投影
// （官方宿主添加项目向导注册行））。
// 信封：ConnectionRpcHandlerResult {ok,value}|{ok,error:{code,message,details}}
// （上游 rpc.d.ts:34-42）——typed error（code ∈ contracts ERROR_CODES）映射
// {code,message,data:details}（apps/host rpc-envelope serializeRpcError 同口径）；
// 非 typed 异常收敛 internal（连接 RPC 面无 Electron 拒绝通道，fail-loud 上抛只会
// 变成传输层失败——信封带内返回保 UI 错误相位可辨）。
import { API_PATH, clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import { ERROR_CODES, type EntryActionRequest, type EntryActionRequestReject, type EntryDetailQuery, type ListEntriesQuery, type Project, type ProjectSummary, type RecallFeedbackOutcome, type RecallFeedbackRequest, type SessionRecallQuery } from '@dsh-forge/contracts'
import { CONNECTION_ENDPOINT_BY_CHANNEL } from '../shared/connection-rpc.js'
import { projectKeyOf } from './project-key.js'
import type { BrowseKnowledgeService } from './service/index.js'

/** 知识七端点注入服务面（apps/host ipc knowledge-rpc.ts KnowledgeChannelService 同形 Pick） */
export type KnowledgeConnectionService = Pick<
  BrowseKnowledgeService,
  | 'browse' | 'listEntries' | 'getEntryDetail' | 'heatByEntry' | 'sessionRecall'
  | 'confirmBatch' | 'rejectBatch' | 'moveEntry' | 'updateEntry' | 'createDomain'
  | 'recallFeedback'
>

/** projects 端点数据源窄面（core forgeProjects 服务 / registry 投影两实现同型） */
export interface ForgeProjectsSource {
  listProjects(): Promise<ProjectSummary[]>
  getProject(id: string): Promise<Project | null>
}

/** 官方 workspaceRegistry 消费窄面（registry-adapter OfficialRegistryFace 同形子集） */
export interface WorkspaceRegistryFace {
  list(): Promise<readonly { readonly id: string; readonly path: string; readonly title: string }[]>
  get(id: string): Promise<{ readonly id: string; readonly path: string; readonly title: string } | undefined>
}

/** 上游 ConnectionRpcHandlerResult 结构切片（rpc.d.ts:34-42——零官方包运行期依赖） */
export type ConnectionRpcHandlerResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly details: object } }

/** 上游 ConnectionFetchRoute 消费切片（rpc.d.ts:111-129 结构同型——测试替身同型） */
export interface ConnectionFetchRouteFace {
  readonly path: string
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
  readonly requestBody: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response>
}

/** 官方 ctx.connection 消费切片（host 半——session-log-export ConnectionLike 同型窄面） */
export interface HostConnectionFace {
  readonly fetch: {
    register(route: ConnectionFetchRouteFace): (() => void) | (() => Promise<void>) | void
  }
}

function ok(value: unknown): ConnectionRpcHandlerResult {
  return { ok: true, value }
}

function fail(code: string, message: string, details: object = {}): ConnectionRpcHandlerResult {
  return { ok: false, error: { code, message, details } }
}

/** typed error → failure（code ∈ contracts ERROR_CODES 带内返回；非 typed 收敛 internal） */
function errorResult(error: unknown): ConnectionRpcHandlerResult {
  if (error instanceof Error) {
    const { code, data } = error as Error & { code?: unknown; data?: unknown }
    if (typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)) {
      return fail(code, error.message, (data ?? {}) as object)
    }
    return fail('internal', error.message)
  }
  return fail('internal', String(error))
}

function invalidRequest(message: string): EntryActionRequestReject {
  return { outcome: 'rejected-request', code: 'invalid-request', message }
}

/** entryAction 判别联合分派（apps/host ipc knowledge-rpc.ts 同语义插件域自持副本） */
async function dispatchEntryAction(service: KnowledgeConnectionService, req: EntryActionRequest): Promise<unknown> {
  switch (req.action) {
    case 'confirm':
    case 'reject': {
      if (typeof req.projectId !== 'string' || !Array.isArray(req.entryIds) || req.entryIds.length === 0) {
        return invalidRequest(`批量 ${req.action} 需非空 entryIds 数组`)
      }
      const results = req.action === 'confirm'
        ? await service.confirmBatch({ projectId: req.projectId, entryIds: req.entryIds })
        : await service.rejectBatch({ projectId: req.projectId, entryIds: req.entryIds })
      return { results }
    }
    case 'move': {
      if (
        typeof req.projectId !== 'string'
        || !Array.isArray(req.entryIds) || req.entryIds.length !== 1 || typeof req.entryIds[0] !== 'number'
        || typeof req.targetDomain !== 'string'
      ) {
        return invalidRequest('move 需恰 1 条 entryIds 与 targetDomain 载荷')
      }
      const result = await service.moveEntry({ projectId: req.projectId, entryId: req.entryIds[0], targetDomain: req.targetDomain })
      return { results: [result] }
    }
    case 'editMeta': {
      if (
        typeof req.projectId !== 'string'
        || !Array.isArray(req.entryIds) || req.entryIds.length !== 1 || typeof req.entryIds[0] !== 'number'
        || typeof req.title !== 'string' || !Array.isArray(req.keywords) || req.keywords.some((k) => typeof k !== 'string')
        || typeof req.summary !== 'string' || typeof req.body !== 'string'
      ) {
        return invalidRequest('editMeta 需恰 1 条 entryIds 与 title/keywords/summary/body 载荷')
      }
      const result = await service.updateEntry({
        projectId: req.projectId,
        entryId: req.entryIds[0],
        title: req.title,
        keywords: req.keywords,
        summary: req.summary,
        body: req.body,
      })
      return { results: [result] }
    }
    case 'createDomain': {
      if (typeof req.projectId !== 'string' || typeof req.domain !== 'string' || req.domain === '') {
        return invalidRequest('createDomain 需 domain 域路径载荷')
      }
      return service.createDomain({ projectId: req.projectId, domain: req.domain })
    }
  }
}

/** recallFeedback 判别联合分派（apps/host ipc knowledge-rpc.ts 同语义插件域自持副本） */
async function dispatchRecallFeedback(service: KnowledgeConnectionService, req: RecallFeedbackRequest): Promise<RecallFeedbackOutcome | EntryActionRequestReject> {
  const feedbackOk = (v: unknown): v is 1 | -1 | 0 => v === 1 || v === -1 || v === 0
  if (typeof req.projectId !== 'string') return invalidRequest('recallFeedback 需 projectId 载荷')
  if (req.action === 'row') {
    if (typeof req.rowId !== 'number' || !Number.isInteger(req.rowId) || !feedbackOk(req.feedback)) {
      return invalidRequest('row 动作需整数 rowId 与 feedback ∈ {1,-1,0}')
    }
    if (req.note !== undefined && typeof req.note !== 'string') {
      return invalidRequest('note 需 string 载荷')
    }
    return service.recallFeedback({ projectId: req.projectId, action: 'row', rowId: req.rowId, feedback: req.feedback, ...(req.note !== undefined ? { note: req.note } : {}) })
  }
  if (req.action === 'batch') {
    if (typeof req.callId !== 'string' || req.callId === '' || (req.feedback !== -1 && req.feedback !== 0)) {
      return invalidRequest('batch 动作需 callId 与 feedback ∈ {-1,0}（事件级 👍 不存在）')
    }
    if (req.note !== undefined && typeof req.note !== 'string') {
      return invalidRequest('note 需 string 载荷')
    }
    return service.recallFeedback({ projectId: req.projectId, action: 'batch', callId: req.callId, feedback: req.feedback, ...(req.note !== undefined ? { note: req.note } : {}) })
  }
  return invalidRequest('recallFeedback action 需 row | batch')
}

export interface KnowledgeRpcHandlerDeps {
  readonly service: KnowledgeConnectionService
  /** projects 数据源现查（缺席 = projects 端点 typed unavailable——不阻 knowledge 端点） */
  readonly projects: () => ForgeProjectsSource | undefined
}

/**
 * '/knowledge' 通道 handler 工厂（endpoint 分发单点——dispatch 表与 client 映射表
 * 共享锚对账：CONNECTION_ENDPOINT_BY_CHANNEL 值集 = 本 switch case 集）。
 */
export function knowledgeRpcHandler(deps: KnowledgeRpcHandlerDeps): (endpoint: string, payload: unknown, signal: AbortSignal, peer: unknown) => Promise<ConnectionRpcHandlerResult> {
  const req = (payload: unknown): Record<string, unknown> =>
    payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  return async (endpoint, payload) => {
    try {
      const body = req(payload)
      switch (endpoint) {
        case 'knowledge.browse':
          return ok(await deps.service.browse({ projectId: body['projectId'] as string }))
        case 'knowledge.listEntries':
          return ok(await deps.service.listEntries(body as unknown as ListEntriesQuery))
        case 'knowledge.entryDetail':
          return ok(await deps.service.getEntryDetail(body as unknown as EntryDetailQuery))
        case 'knowledge.heat':
          return ok(await deps.service.heatByEntry(body['projectId'] as string))
        case 'knowledge.sessionRecall':
          return ok(await deps.service.sessionRecall(body as unknown as SessionRecallQuery))
        case 'knowledge.entryAction':
          return ok(await dispatchEntryAction(deps.service, body as unknown as EntryActionRequest))
        case 'knowledge.recallFeedback':
          return ok(await dispatchRecallFeedback(deps.service, body as unknown as RecallFeedbackRequest))
        case 'projects.list': {
          const projects = deps.projects()
          if (projects === undefined) return fail('ERR_WORKSPACE_NOT_REGISTERED', 'projects 数据源缺席（core forgeProjects / workspaceRegistry 双缺）')
          return ok(await projects.listProjects())
        }
        case 'projects.get': {
          const projects = deps.projects()
          if (projects === undefined) return fail('ERR_WORKSPACE_NOT_REGISTERED', 'projects 数据源缺席（core forgeProjects / workspaceRegistry 双缺）')
          return ok(await projects.getProject(body['id'] as string))
        }
        default:
          return fail('internal', `knowledge 连接通道未知 endpoint：${endpoint}（映射表 = shared/connection-rpc CONNECTION_ENDPOINT_BY_CHANNEL）`)
      }
    } catch (error) {
      return errorResult(error)
    }
  }
}

/**
 * 单 endpoint 精确路由工厂（session-log-export 同型——官方 ConnectionFetchRoute）：
 * ClientRequest 信封解析（官方 schema 门）→ method↔endpoint 校验 → handler 分派 →
 * ServerResponse 信封应答（浏览器 caller parseConnectionResponse 消费形状）。
 */
function knowledgeFetchRoute(endpoint: string, deps: KnowledgeRpcHandlerDeps): ConnectionFetchRouteFace {
  const path = `${API_PATH}/${endpoint}`
  const handler = knowledgeRpcHandler(deps)
  return {
    path,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let rpcId = ''
      try {
        const parsed = clientRequestSchema.safeParse(await request.json())
        if (!parsed.success) {
          return Response.json({ type: 'server-response', rpcId: 'invalid', result: { ok: false, error: { code: 'gateway/bad-request', message: 'invalid client-request message', details: {} } } }, { status: 400 })
        }
        rpcId = parsed.data.rpcId
        if (parsed.data.method !== endpoint) {
          return Response.json({ type: 'server-response', rpcId, result: { ok: false, error: { code: 'gateway/bad-request', message: `method ${JSON.stringify(parsed.data.method)} does not match endpoint ${JSON.stringify(endpoint)}`, details: {} } } })
        }
        const result = await handler(endpoint, parsed.data.payload, request.signal, undefined)
        return Response.json({ type: 'server-response', rpcId, result })
      } catch (cause) {
        return Response.json({ type: 'server-response', rpcId, result: { ok: false, error: { code: 'internal', message: String(cause), details: {} } } }, { status: 200 })
      }
    },
  }
}

/**
 * /api 精确路由族注册（host 半 apply 期一次——返回合并注销器；fetch.register 缺席/抛
 * = 零注册零抛 fail-soft，不阻载插件）。
 */
export function registerKnowledgeConnectionRpc(connection: HostConnectionFace, deps: KnowledgeRpcHandlerDeps): () => void {
  const register = connection?.fetch?.register
  if (typeof register !== 'function') return () => {}
  const disposers: Array<() => void> = []
  for (const endpoint of Object.values(CONNECTION_ENDPOINT_BY_CHANNEL)) {
    const dispose = register.call(connection.fetch, knowledgeFetchRoute(endpoint, deps))
    disposers.push(() => {
      try {
        void Promise.resolve(dispose?.()).catch(() => {})
      } catch {
        // 注销失败不阻卸载（fiber 级联拆卸兜底）
      }
    })
  }
  return () => {
    for (const dispose of disposers) dispose()
  }
}

/** core forgeProjects 具名服务形状校验（防御读取——AGENTS 1.6 检测永不缓存） */
export function isForgeProjectsSource(value: unknown): value is ForgeProjectsSource {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<ForgeProjectsSource>
  return typeof candidate.listProjects === 'function' && typeof candidate.getProject === 'function'
}

/** 官方 workspaceRegistry 形状校验（list/get 函数面） */
export function isWorkspaceRegistryFace(value: unknown): value is WorkspaceRegistryFace {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<WorkspaceRegistryFace>
  return typeof candidate.list === 'function' && typeof candidate.get === 'function'
}

/**
 * 官方 workspace 行 → ProjectSummary 投影（archived 概念官方注册行缺席——恒 false）。
 * fix-11 B 方案·身份统一：行 id = projectKeyOf(path) 派生稳定 forge project key
 *（lib-path 单源——plugins/project 同款先例），workspaceId 归位官方 workspace id
 * 关联列——两字段不再同值；派生键与 knowledge_registry 注册行解析同域。
 */
function registryRowToSummary(row: { id: string; path: string; title: string }): ProjectSummary {
  return { id: projectKeyOf(row.path), workspaceId: row.id, name: row.title, wsPath: row.path, archived: false }
}

/** 官方 workspaceRegistry → projects 数据源投影（官方宿主形态——添加项目向导注册行） */
export function registryProjectsSource(registry: WorkspaceRegistryFace): ForgeProjectsSource {
  return {
    listProjects: async () => (await registry.list()).map(registryRowToSummary),
    getProject: async (id: string): Promise<Project | null> => {
      // 派生键域内反查（官方 get(id) 面 = workspace 域 id，不在本源 id 域——逐行现派生比对）
      const row = (await registry.list()).find((r) => projectKeyOf(r.path) === id)
      if (row === undefined) return null
      return {
        id,
        workspaceId: row.id,
        wsPath: row.path,
        name: row.title,
        forgeDir: '',
        forgeDirExternal: false,
        archived: false,
        createdAt: '',
        updatedAt: '',
      }
    },
  }
}
