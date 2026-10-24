// forge:proxy/* 代理通道族（mobile-ui 1.11——api-handbook §6.0 R12 终版）：
// mobile 唯一数据通道的 host 侧本体——官方能力 in-process 直调（不经网关，`_request` 不存在）：
//   · session 族 = sessionController 控制器类方法直调（list/create/page/prompt/cancel/
//     projections/rename/fork/search/selectModel/modelCatalog/attachment/updateQueue）；
//   · commands 族 = ctx.commands（list/execute）；
//   · user-questions-answer = ctx.userQuestions（ask 提交——本组合无 interaction 服务）；
//   · forge 原生 grouped = ProjectService × sessionController.list × git-worktree（api-handbook
//     §6.0 响应体——项目 → worktree → sessions + unassigned，SessionSummary 原样透传）；
//   · approval = approvalRelay 中继（forge:remote/approval 同语义别名）；
//   · disconnect = REMOTE_CHANNELS.disconnect（pair-disconnected 对偶缝——撤粘性位，fail-soft）；
//   · file = 分块读面（64KB/块——隧道模式信封层逐呼加密即逐块 AEAD；manifest 携全文件
//     SHA-256——tunnel-psk §4.4）。
// 参数校验 = 窄面结构判定（contracts DTO 定位铁律「纯类型零依赖」——零 zod，本模块单源）。
// 纯 handler（fake 服务可测）——装配归 child.ts。
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type {
  ProjectService,
  ProjectSummary,
  RemoteApprovalDecisionInput,
  RemoteApprovalForwardResult,
  WorktreeEntryDto,
} from '@dsh-forge/contracts'
import { REMOTE_CHANNELS, WORKTREE_CHANNELS } from '@dsh-forge/contracts'
import { listWorkspaceFiles } from './file-list.js'
import type { ReadCursorStore } from './read-cursor-store.js'
import { typertDispatch, typertSessionDescriptor } from './typert-dispatch.js'

/** forge:proxy/* 通道名族（mobile 唯一数据通道——LAN/隧道同构） */
export const PROXY_CHANNELS = {
  sessionList: 'forge:proxy/session-list',
  sessionCreate: 'forge:proxy/session-create',
  sessionPage: 'forge:proxy/session-page',
  sessionPrompt: 'forge:proxy/session-prompt',
  sessionCancel: 'forge:proxy/session-cancel',
  sessionProjections: 'forge:proxy/session-projections',
  sessionRename: 'forge:proxy/session-rename',
  sessionFork: 'forge:proxy/session-fork',
  sessionSearch: 'forge:proxy/session-search',
  sessionHistory: 'forge:proxy/session-history',
  sessionSelectModel: 'forge:proxy/session-select-model',
  sessionModelCatalog: 'forge:proxy/session-model-catalog',
  sessionAttachment: 'forge:proxy/session-attachment',
  sessionUpdateQueue: 'forge:proxy/session-update-queue',
  commandsList: 'forge:proxy/commands-list',
  commandsExecute: 'forge:proxy/commands-execute',
  userQuestionsAnswer: 'forge:proxy/user-questions-answer',
  userQuestionsPending: 'forge:proxy/user-questions-pending',
  projectsGrouped: 'forge:proxy/projects-grouped',
  approval: 'forge:proxy/approval',
  agentPresets: 'forge:proxy/agent-presets',
  agentPresetSelect: 'forge:proxy/agent-preset-select',
  file: 'forge:proxy/file',
  fileList: 'forge:proxy/file-list',
} as const

/** 已读游标通道族（bug 1dd4b437——host 侧持久游标，跨重启/端口churn存活） */
export const READ_STATE_CHANNELS = {
  read: 'forge:remote/read-state',
  write: 'forge:remote/read-state-write',
} as const

export type ProxyChannel = (typeof PROXY_CHANNELS)[keyof typeof PROXY_CHANNELS]

/** 官方 SessionController 消费切片（控制器类方法直调——worktree-rpc SessionControllerFace 同源扩面） */
export interface ProxySessionFace {
  list?(request?: unknown): Promise<unknown>
  create?(request: unknown): Promise<unknown>
  page?(request: unknown): Promise<unknown>
  prompt(request: unknown, signal?: AbortSignal): Promise<unknown>
  cancel?(request: unknown): Promise<unknown>
  projections?(request: unknown): Promise<unknown>
  rename?(request: unknown): Promise<unknown>
  fork?(request: unknown): Promise<unknown>
  search?(request: unknown): Promise<unknown>
  selectModel?(request: unknown): Promise<unknown>
  modelCatalog?(request: unknown): Promise<unknown>
  attachment?(request: unknown): Promise<unknown>
  updateQueue?(request: unknown): Promise<unknown>
  /** 官方 resolveAgent（公开面——agentPreset.select 需 live agent 实参） */
  resolveAgent?(sessionId: string): Promise<unknown>
}

/** 官方 commands 消费切片（ctx.commands） */
export interface ProxyCommandsFace {
  list?(request: unknown): Promise<unknown>
  execute?(request: unknown): Promise<unknown>
}

/** 官方 userQuestions 消费切片（ask 提交缝——continued 题回灌） */
export interface ProxyUserQuestionsFace {
  answer?(request: unknown): Promise<unknown>
}

/** mobile ask 桥消费切片（waterfall 在途题回灌 + 在途题枚举供刷新后重渲染面板） */
export interface ProxyUserQuestionsBridge {
  resolve(callId: string, answer: unknown): boolean
  pendingFor(sessionId: string): readonly { readonly callId: string; readonly questions: unknown }[]
}

/** worktree 桥服务切片（grouped 归组数据源 + bug a1e087a6：hero 透传通道族正门——
 *  建会话单门已退役：mobile 建会话走 forge:proxy/session-create（sessionController 直调）） */
export interface ProxyWorktreeFace {
  list(request: { readonly projectRoot: string }): Promise<{ readonly isGit: boolean; readonly worktreeDir?: string; readonly entries: readonly WorktreeEntryDto[] }>
}

/** agentPreset registry 消费切片（官方 remoteExportList roster + select 换预设） */
export interface ProxyAgentPresetsFace {
  remoteExportList?(): Promise<unknown>
  select?(agent: unknown, agentPreset: string): Promise<unknown>
}

/** 装配依赖缝（child.ts 注入真身；测试注入 fake） */
export interface ProxyChannelDeps {
  readonly session?: ProxySessionFace
  readonly commands?: ProxyCommandsFace
  readonly userQuestions?: ProxyUserQuestionsFace
  /** mobile ask 桥（waterfall 在途题回灌——缺席 = 全走官方 continued 面） */
  readonly userQuestionsBridge?: ProxyUserQuestionsBridge
  readonly projects?: Pick<ProjectService, 'listProjects' | 'getProject'>
  readonly worktrees?: ProxyWorktreeFace
  /** agentPreset registry 切片（缺席 = 预设清单通道 fail-soft 错误信封） */
  readonly agentPresets?: ProxyAgentPresetsFace
  readonly forwardApproval?: (input: RemoteApprovalDecisionInput) => Promise<RemoteApprovalForwardResult>
  /** pair-disconnected 对偶缝（缺席 = fail-soft revoked:false） */
  readonly disconnect?: () => void
  /** 已读游标持久 store（bug 1dd4b437——缺席 = 读空表/写 fail-soft） */
  readonly readCursors?: ReadCursorStore
}

/** 文件分块读常量（tunnel-psk §4.4——64KB/块） */
export const PROXY_FILE_CHUNK_BYTES = 64 * 1024

// ── 窄面结构判定（参数校验单源）──────────────────────────────────────

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error('payload 形状非法（应为对象）')
  return payload as Record<string, unknown>
}

function asString(record: Record<string, unknown>, key: string): string {
  const v = record[key]
  if (typeof v !== 'string' || v === '') throw new Error(`payload.${key} 缺席/非法（应为非空字符串）`)
  return v
}

/** 服务缺席 = 显式错误信封（fail-soft——通道在场、数据面缺席不哑挂） */
function requireService<T>(face: T | undefined, name: string): T {
  if (face === undefined) throw new Error(`${name} 服务缺席——通道数据面不可达`)
  return face
}

function requireMethod<F>(face: F | undefined, name: string): F {
  if (face === undefined) throw new Error(`${name} 缺席（官方控制器方法漂移）——通道不可达`)
  return face
}

// ── 通道表装配 ───────────────────────────────────────────────────────

type ChannelHandler = (payload: unknown) => Promise<unknown>

/** model-catalog 缓存 TTL（2026-10-22 判例：官方 buildModelCatalog 每呼逐 provider
 *  listModels+resolveModelInfo 网络探测——秒级时延 × 手机每次打开即触发，60s TTL 收口）。 */
export const MODEL_CATALOG_CACHE_TTL_MS = 60_000

/** session 族通道（bug 30d44e5a A 案根治——用户裁决 2026-10-22）：经官方 typert 编组分发
 *  （typert-dispatch.ts——strict schema 边界 + cancellation signal 尾参注入 + result codec），
 *  与官方网关编组语义等价。特例保留：session-select-model（选档缓存失效）、session-history
 *  （page 拆包回手机窗口形）、session-model-catalog（TTL 缓存 + 探测失败回退旧目录）。
 *  bug 344dd76b 同族：编组分发 bind 控制器实例（官方方法体依赖 this 实例态）。 */
function sessionChannelTable(session: ProxySessionFace): Record<string, ChannelHandler> {
  const bound = <F extends (...args: never[]) => unknown>(method: F | undefined, name: string): F =>
    requireMethod(method, name).bind(session) as F
  const dispatch = (method: string): ChannelHandler => {
    const descriptor = typertSessionDescriptor(method)
    if (descriptor === undefined) {
      return async () => {
        throw new Error(`session.${method} 无官方 typert descriptor——通道不可达`)
      }
    }
    return async (payload) => typertDispatch(descriptor, session, payload, new AbortController().signal)
  }
  // model-catalog 短缓存（读即触探官方 provider I/O——TTL 内复用；探测失败回退旧值不空手）
  let catalogCache: { at: number; data: unknown } | undefined
  return {
    [PROXY_CHANNELS.sessionList]: dispatch('list'),
    [PROXY_CHANNELS.sessionCreate]: dispatch('create'),
    [PROXY_CHANNELS.sessionPage]: dispatch('page'),
    [PROXY_CHANNELS.sessionPrompt]: dispatch('prompt'),
    [PROXY_CHANNELS.sessionCancel]: dispatch('cancel'),
    [PROXY_CHANNELS.sessionProjections]: dispatch('projections'),
    [PROXY_CHANNELS.sessionRename]: dispatch('rename'),
    [PROXY_CHANNELS.sessionFork]: dispatch('fork'),
    [PROXY_CHANNELS.sessionSearch]: dispatch('search'),
    [PROXY_CHANNELS.sessionSelectModel]: async (payload) => {
      const result = await dispatch('selectModel')(payload)
      catalogCache = undefined // 选档改变部署 default——缓存即刻失效
      return result
    },
    // 会话历史（官方 session.history 网关形的 host 直调面）：controller.page + records[].event
    // 还原 wire events（官方 pageRecords 包装 {type:'event',event}——此处拆包回手机窗口形）。
    // bug 2714e40d 同族收口：隧道域 /api/rpc 403，chat 历史首屏/翻页唯一数据面。
    // bug 会话空白：page 的 throughSeq 是字面上界（-1 = 空集，paginate 源码核销）——载荷缺席
    // 时自解析官方 projections cursor（asOfSeq）为上界；显式 throughSeq（翻页）原样透传。
    [PROXY_CHANNELS.sessionHistory]: async (payload) => {
      const record = asRecord(payload)
      const sessionId = asString(record, 'sessionId')
      let throughSeq = typeof record['throughSeq'] === 'number' ? record['throughSeq'] : undefined
      if (throughSeq === undefined) {
        const projections = (await dispatch('projections')({ sessionId })) as { asOfSeq?: unknown } | null
        throughSeq = typeof projections?.asOfSeq === 'number' ? projections.asOfSeq : -1
      }
      const page = (await dispatch('page')({
        address: { kind: 'session', sessionId },
        throughSeq,
        ...(typeof record['maxMessages'] === 'number' ? { maxMessages: record['maxMessages'] } : {}),
      })) as { records?: readonly { event?: unknown }[]; hasMore?: unknown }
      return {
        entries: (page.records ?? []).map((entry) => (entry as { event?: unknown }).event),
        hasMore: page.hasMore === true,
      }
    },
    [PROXY_CHANNELS.sessionModelCatalog]: async (payload) => {
      if (catalogCache !== undefined && Date.now() - catalogCache.at < MODEL_CATALOG_CACHE_TTL_MS) {
        return catalogCache.data
      }
      try {
        const data = await bound(session.modelCatalog, 'session.modelCatalog')(asRecord(payload))
        catalogCache = { at: Date.now(), data }
        return data
      } catch (error) {
        if (catalogCache !== undefined) return catalogCache.data // 探测失败回退旧目录（不空手）
        throw error
      }
    },
    [PROXY_CHANNELS.sessionAttachment]: dispatch('attachment'),
    [PROXY_CHANNELS.sessionUpdateQueue]: dispatch('updateQueue'),
  }
}

/** forge:proxy/projects-grouped（api-handbook §6.0 响应体） */
export interface GroupedWorktreeRow {
  readonly path: string
  readonly branch: string | null
  readonly worktreeName: string | null
  readonly isMain: boolean
  readonly present: boolean
}

export interface GroupedProjectRow {
  readonly id: string
  readonly name: string
  readonly wsPath: string
  readonly archived: boolean
  readonly worktrees: readonly GroupedWorktreeRow[]
  readonly sessions: readonly Record<string, unknown>[]
}

export interface GroupedResult {
  readonly generatedAt: number
  readonly projects: readonly GroupedProjectRow[]
  readonly unassigned: readonly Record<string, unknown>[]
}

const normalizePath = (path: string): string => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

/** 来源标记推断（git-worktree client inferSource 同源语义——路径落在所配 worktree 目录内
 *  = 'dsh'。host 侧内联同口径实现：client 面携 React/CSS 组件链，host 不 import UI 面）。 */
function inferSourceOf(path: string, worktreeDir: string | undefined): boolean {
  if (!worktreeDir) return false
  return normalizePath(path).startsWith(`${normalizePath(worktreeDir)}/`)
}

/** 会话 cwd 子树归属判定（∈ wsPath 本体 ∪ worktree 目录子树——桌面 session-chip 同源语义）。
 *  归组路径 inferSource 消费：cwd 落在所配 worktree 存放目录内（'dsh' 来源推断）即归属
 *  该项目——worktree 行枚举失配（present:false/盘上已删）不丢会话。 */
export function sessionCwdInProject(cwd: string | undefined, wsPath: string, worktrees: readonly WorktreeEntryDto[], worktreeDir?: string): boolean {
  if (typeof cwd !== 'string' || cwd === '') return false
  if (inferSourceOf(cwd, worktreeDir)) return true
  const n = normalizePath(cwd)
  const root = normalizePath(wsPath)
  if (n === root || n.startsWith(`${root}/`)) return true
  return worktrees.some((w) => {
    const wp = normalizePath(w.path)
    return n === wp || n.startsWith(`${wp}/`)
  })
}

/** SessionSummary 提取面（官方原样透传——cwd 归组判定读 cwd 字段，其余零裁剪）。
 *  bug 09b2bf93：官方 sessionController.list 真返回 {items:[...]}（SessionListValue——
 *  源码核销 dsh-api-session-controller list(_request)），缺 items 形 = 归组会话恒空集。 */
function sessionRows(listResult: unknown): Record<string, unknown>[] {
  if (Array.isArray(listResult)) return listResult.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
  const frame = listResult as Record<string, unknown> | null
  const rows = Array.isArray(frame?.['items'])
    ? (frame as { items: unknown[] }).items
    : Array.isArray(frame?.['sessions'])
      ? (frame as { sessions: unknown[] }).sessions
      : []
  return rows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
}

/**
 * grouped 归组装配：listProjects × session/list × worktree list（单项目失败降级为
 * 零 worktree 行——会话仍按 wsPath 本体归属，不因单项目 worktree 读法失败丢项目）。
 */
export async function assembleGrouped(deps: Pick<ProxyChannelDeps, 'projects' | 'session' | 'worktrees'>, now: number): Promise<GroupedResult> {
  const projects = requireService(deps.projects, 'forgeProjects')
  const session = requireMethod(deps.session, 'sessionController')
  // bug 344dd76b：list 同为控制器实例态方法——bind 后直调（this 语义同 session 族）
  const list = requireMethod(session.list, 'session.list').bind(session)
  const [projectRows, listResult] = await Promise.all([projects.listProjects(), list(undefined)])
  const sessions = sessionRows(listResult)
  const assigned = new Set<Record<string, unknown>>()
  const projectsOut: GroupedProjectRow[] = []
  for (const project of projectRows as ProjectSummary[]) {
    let entries: readonly WorktreeEntryDto[] = []
    let worktreeDir: string | undefined
    try {
      const result = await requireService(deps.worktrees, 'gitWorktree 桥').list({ projectRoot: project.wsPath })
      entries = result.entries
      worktreeDir = result.worktreeDir
    } catch {
      // worktree 读法失败 = 零 worktree 行降级（归组路径仍按 wsPath 子树成立）
    }
    const members = sessions.filter((s) => !assigned.has(s) && sessionCwdInProject(typeof s['cwd'] === 'string' ? s['cwd'] as string : undefined, project.wsPath, entries, worktreeDir))
      // bug 5b9e405b：官方 blank 会话（建了零消息——blankBit 初始 true，首条 prompt 翻转）
      // 桌面列表不展示；grouped 同语义过滤，与桌面可见集对齐（blank 位缺席 = 兼容保留）
      .filter((s) => s['blank'] !== true)
    for (const m of members) assigned.add(m)
    projectsOut.push({
      id: project.id,
      name: project.name,
      wsPath: project.wsPath,
      archived: project.archived,
      worktrees: entries.map((w): GroupedWorktreeRow => ({ path: w.path, branch: w.branch, worktreeName: w.worktreeName, isMain: w.isMain, present: w.present })),
      sessions: sortSessionsDesc(members),
    })
  }
  return {
    generatedAt: now,
    projects: projectsOut,
    unassigned: sortSessionsDesc(sessions.filter((s) => !assigned.has(s) && s['blank'] !== true)), // bug 5b9e405b 同上
  }
}

/** updatedAt 降序（SessionSummary 官方字段——缺席行沉底，稳定性排序） */
function sortSessionsDesc(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => String(b['updatedAt'] ?? '') .localeCompare(String(a['updatedAt'] ?? '')))
}

// ── 文件分块读面（隧道模式文件下载——tunnel-psk §4.4）────────────────

export interface FileManifest {
  readonly manifest: true
  readonly size: number
  readonly sha256: string
}

export interface FileChunk {
  readonly manifest: false
  readonly offset: number
  readonly eof: boolean
  /** base64（信封层整呼 AEAD——逐呼即逐块加密） */
  readonly data: string
  /** eof 块携全文件清单签名材料（SHA-256 hex——防拼接重排） */
  readonly sha256?: string
}

export async function readFileChunk(path: string, offset: number, manifestRequested?: boolean): Promise<FileManifest | FileChunk> {
  if (typeof path !== 'string' || path === '') throw new Error('payload.path 缺席/非法')
  const handle = await fs.open(path, 'r')
  try {
    const stat = await handle.stat()
    if (offset === 0 && manifestRequested === true) {
      return { manifest: true, size: stat.size, sha256: await hashFile(handle) }
    }
    const buf = Buffer.alloc(PROXY_FILE_CHUNK_BYTES)
    const { bytesRead } = await handle.read(buf, 0, PROXY_FILE_CHUNK_BYTES, offset)
    const eof = offset + bytesRead >= stat.size
    return {
      manifest: false,
      offset,
      eof,
      data: buf.subarray(0, bytesRead).toString('base64'),
      ...(eof ? { sha256: await hashFile(handle) } : {}),
    }
  } finally {
    await handle.close()
  }
}

async function hashFile(handle: import('node:fs').promises.FileHandle): Promise<string> {
  const hash = createHash('sha256')
  const buf = Buffer.alloc(PROXY_FILE_CHUNK_BYTES)
  let pos = 0
  for (;;) {
    const { bytesRead } = await handle.read(buf, 0, PROXY_FILE_CHUNK_BYTES, pos)
    if (bytesRead === 0) break
    hash.update(buf.subarray(0, bytesRead))
    pos += bytesRead
  }
  return hash.digest('hex')
}

// ── 通道表（1.11 交付面全集）─────────────────────────────────────────

/** allowlist 全集（含既有 forge:remote/disconnect——pair-disconnected 对偶缝） */
export function proxyChannelTableOf(deps: ProxyChannelDeps): Record<string, ChannelHandler> {
  const sessionTable = deps.session !== undefined ? sessionChannelTable(deps.session) : {}
  return {
    ...sessionTable,
    // bug 017b0e5b：commands.list 官方实现 this.view(agent) 依赖实例态——同 344dd76b 一律 bind 后直调。
    // feature（官方 scoping 语义核销：dsh-commands index.d.ts:76-106——list(agent) = 全局层 +
    // 该 agent 阴影层，user 指令走 agent 作用域注册）：payload.sessionId 在场 → resolveAgent
    // 解析活 agent 取收敛清单；缺席/解析失败回退既有调用形态（全局层）。
    [PROXY_CHANNELS.commandsList]: async (payload) => {
      const commands = requireService(deps.commands, 'commands')
      const list = requireMethod(commands.list, 'commands.list').bind(commands)
      const sessionId =
        typeof (payload as Record<string, unknown> | null)?.['sessionId'] === 'string'
          ? (payload as Record<string, unknown>)['sessionId'] as string
          : undefined
      if (sessionId === undefined || deps.session?.resolveAgent === undefined) return list(payload ?? {})
      const resolved = await requireMethod(deps.session.resolveAgent, 'session.resolveAgent').call(deps.session, sessionId)
      const agent = (resolved as { agent?: unknown } | null)?.agent
      if (agent === undefined) return list({})
      return list(agent)
    },
    [PROXY_CHANNELS.commandsExecute]: (payload) => {
      const commands = requireService(deps.commands, 'commands')
      return requireMethod(commands.execute, 'commands.execute').bind(commands)(asRecord(payload))
    },
    [PROXY_CHANNELS.userQuestionsAnswer]: async (payload) => {
      const record = asRecord(payload)
      // mobile ask 桥优先：waterfall 在途题（callId 命中）直接回灌 answerer（bug f73315a1）
      const rawCallId = record['callId']
      const callId = typeof rawCallId === 'string' && rawCallId !== '' ? rawCallId : ''
      if (deps.userQuestionsBridge !== undefined && callId !== '' && deps.userQuestionsBridge.resolve(callId, record['answer'])) {
        return { resolved: true }
      }
      const questions = requireService(deps.userQuestions, 'userQuestions')
      return requireMethod(questions.answer, 'userQuestions.answer').bind(questions)(asRecord(payload))
    },
    // 在途题枚举（页面刷新后面板重渲染数据源——推送只发一次，刷新即丢）
    [PROXY_CHANNELS.userQuestionsPending]: async (payload) => {
      const record = asRecord(payload)
      const sessionId = asString(record, 'sessionId')
      if (deps.userQuestionsBridge !== undefined) return { pending: deps.userQuestionsBridge.pendingFor(sessionId) }
      return { pending: [] }
    },
    [PROXY_CHANNELS.projectsGrouped]: async () => assembleGrouped(deps, Date.now()),
    // 预设 roster（官方 remoteExportList——{presets:[{id,name,isDefault}]}；增减动态单源。
    // bug 344dd76b 同族：registry 方法绑定后直调）
    [PROXY_CHANNELS.agentPresets]: async () => {
      const registry = requireService(deps.agentPresets, 'agentPresets')
      return requireMethod(registry.remoteExportList, 'agentPresets.remoteExportList').bind(registry)()
    },
    // 换预设（官方 agentPreset.select 网关形的 host 直调面）：sessionId → live agent
    // （controller.resolveAgent 公开面，{agent}|{error} 包装须解包——bug 同 344dd76b 族：
    // 整包装直传 registry.select 官方读 wrapper.header 崩）→ registry.select(agent, preset)。
    [PROXY_CHANNELS.agentPresetSelect]: async (payload) => {
      const record = asRecord(payload)
      const sessionId = asString(record, 'sessionId')
      const agentPreset = asString(record, 'agentPreset')
      const controller = requireService(deps.session, 'sessionController')
      const resolved = await requireMethod(controller.resolveAgent, 'session.resolveAgent').bind(controller)(sessionId)
      const agent = (resolved as { agent?: unknown; error?: unknown } | null)?.agent
      if (agent === undefined || agent === null) {
        return {
          error: {
            code: 'session/agent-unavailable',
            message: `会话无活 agent（${JSON.stringify((resolved as { error?: unknown } | null)?.error ?? 'unknown')}）`,
          },
        }
      }
      const registry = requireService(deps.agentPresets, 'agentPresets')
      return requireMethod(registry.select, 'agentPresets.select').bind(registry)(agent, agentPreset)
    },
    [PROXY_CHANNELS.approval]: async (payload) =>
      deps.forwardApproval !== undefined
        ? deps.forwardApproval(asRecord(payload) as unknown as RemoteApprovalDecisionInput)
        : ({ forwarded: false, reason: 'unavailable' } satisfies RemoteApprovalForwardResult),
    [REMOTE_CHANNELS.disconnect]: async () => {
      if (deps.disconnect === undefined) return { revoked: false } // fail-soft（remote-rpc.ts 同口径）
      deps.disconnect()
      return { revoked: true }
    },
    // bug 1dd4b437：已读游标 host 侧读写（手机 localStorage 随 origin churn 丢失 → 未读全量误报）
    [READ_STATE_CHANNELS.read]: async () => ({ cursors: deps.readCursors?.getAll() ?? {} }),
    [READ_STATE_CHANNELS.write]: async (payload) => {
      if (deps.readCursors === undefined) return { saved: false } // fail-soft
      const record = asRecord(payload)
      deps.readCursors.set(asString(record, 'sessionId'), typeof record['seq'] === 'number' ? record['seq'] : Number.NaN)
      return { saved: true }
    },
    [PROXY_CHANNELS.file]: async (payload) => {
      const record = asRecord(payload)
      return readFileChunk(asString(record, 'path'), typeof record['offset'] === 'number' ? record['offset'] : 0, record['manifest'] === true)
    },
    // feature：移动端 composer @ 文件 mention 候选源（工作区相对路径清单——
    // 轻量 walk 忽略重目录 + 条目上限；payload 形状非法/目录缺席 = fail-soft 错误信封）
    [PROXY_CHANNELS.fileList]: async (payload) => {
      const record = asRecord(payload)
      const projectRoot = asString(record, 'projectRoot')
      let result
      try {
        result = listWorkspaceFiles(projectRoot)
      } catch (cause) {
        throw new Error(`工作区清单不可达：${String(cause)}`)
      }
      return result
    },
    // bug a1e087a6：hero 透传通道族注册（此前不在远程 allowlist——worktree 清单 not-found）。
    // 建会话预铸单门（WORKTREE_CHANNELS.sessionCreate）已退役——mobile 建会话统一走
    // PROXY_CHANNELS.sessionCreate（上方 dispatch('create')——sessionController 进内直调）。
    [WORKTREE_CHANNELS.list]: async (payload) => {
      const worktrees = requireService(deps.worktrees, 'gitWorktree 桥')
      return requireMethod(worktrees.list, 'worktree.list').bind(worktrees)(asRecord(payload) as never)
    },
  }
}
