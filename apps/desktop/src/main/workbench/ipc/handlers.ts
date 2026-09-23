// workbench/ipc/handlers — dshForge.workbench.* 动词注册与错误封装(任务 2.7)。
//
// Hard Rule 执行:本层只做 sender 校验 + 参数形状校验 + 服务调用 + 错误映射,
// 零内联业务规则;每动词一条白名单通道(channel-allowlist.ts),未注册通道
// 由 Electron 拒绝,注册通道由 sender-validate.ts 拒绝。
//
// 错误封装(tech-design §Error Handling):handler 捕获域错误 → reject
// WorkbenchIpcError(message = JSON 序列化 `{ code, message, detail? }`,渲染层
// 可直接 parse);携带 `ERR_*` code 的域错误原码透传;未知异常 →
// ERR_WORKBENCH_DB 兜底 + log。sender 拒绝沿用 M1 惯例(plain Error +
// ERR_IPC_SENDER_REJECTED log),不进封装路径。
//
// onEvents 生命周期:订阅/退订为独立白名单动词;渲染层销毁时经 webContents
// destroyed 钩子自动退订;事件批推送(sink)只发已订阅且存活的 sender。

import { shellLog } from '../../log.ts'
import { WORKBENCH_EVENT_CHANNEL, WORKBENCH_VERB_CHANNELS, type WorkbenchVerbChannel } from './channel-allowlist.ts'
import { assertWorkbenchSender, type WorkbenchEventSender, type WorkbenchVerbEvent } from './sender-validate.ts'
import type {
  DecideApprovalInput,
  DispatchTasksInput,
  DocKind,
  ReceiveApprovalVerbInput,
  KnowledgeFactInput,
  KnowledgeForensicInput,
  KnowledgeLessonInput,
  KnowledgeResearchInput,
  PrefEntry,
  PrefScope,
  ProjectPatch,
  RecordSessionLinkInput,
  RegisterProjectInput,
  TaskAddInput,
  TaskClaimInput,
  TaskGetInput,
  TaskQueryInput,
  TaskReopenInput,
  TaskSubmitInput,
  TaskTransitionInput,
  WorkbenchErrorEnvelope,
  WorkbenchVerbServices,
} from './types.ts'

/** 域错误沿动词面的 reject 形态(message 即封装 JSON,渲染层 parse 回对象)。 */
export class WorkbenchIpcError extends Error {
  constructor(readonly envelope: WorkbenchErrorEnvelope) {
    super(JSON.stringify(envelope))
    this.name = 'WorkbenchIpcError'
  }
}

const DOMAIN_CODE_PATTERN = /^ERR_[A-Z0-9_]+$/

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 错误映射:①已是封装形态原样;②携带合法 `ERR_*` code 的域错误
 * (WorkbenchRepoError / WorkbenchRegistryError / WorkbenchDbError / 守卫
 * PluginMandatoryError 及 3.1 真守卫的等价形态)→ 同码封装;③未知异常 →
 * ERR_WORKBENCH_DB 兜底封装 + log(Propagation Strategy 口径)。
 */
export function toWorkbenchIpcError(error: unknown, verb: string): WorkbenchIpcError {
  if (error instanceof WorkbenchIpcError) return error
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (error instanceof Error && typeof code === 'string' && DOMAIN_CODE_PATTERN.test(code)) {
    return new WorkbenchIpcError({ code, message: error.message })
  }
  shellLog.error({
    code: 'ERR_WORKBENCH_DB',
    message: `workbench verb ${verb} failed with an unclassified error`,
    data: { verb, detail: errorMessage(error) },
  })
  return new WorkbenchIpcError({
    code: 'ERR_WORKBENCH_DB',
    message: `workbench verb ${verb} failed`,
    detail: errorMessage(error),
  })
}

/** ipcMain.handle seam(Electron ipcMain in production;假登记器在测试)。 */
export type WorkbenchHandleRegistrar = (
  channel: WorkbenchVerbChannel,
  listener: (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown,
) => void

// ---------------------------------------------------------------------------
// 参数形状校验(浅校验:域语义由 registry/repos 复验;形状错 = 调用方契约错)
// ---------------------------------------------------------------------------

function requireString(verb: string, arg: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`workbench.${verb}: ${arg} must be a non-empty string (got ${typeof value})`)
  }
  return value
}

function requireObject(verb: string, arg: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`workbench.${verb}: ${arg} must be an object (got ${typeof value})`)
  }
  return value as Record<string, unknown>
}

const DOC_KINDS: ReadonlySet<string> = new Set(['manifest', 'prd', 'design', 'ui', 'tasks'])

/** 任务 7 态词表(schema-v2 task.status CHECK 同源;浅校验用)。 */
const TASK_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
  'skipped',
  'rejected',
])

/** 可选字符串字段:缺省/字符串放行,其余(含空串)拒绝为形状错。 */
function optionalString(verb: string, arg: string, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value === '') {
    throw new Error(`workbench.${verb}: ${arg} must be a non-empty string when present (got ${typeof value})`)
  }
  return value
}

// ---------------------------------------------------------------------------
// 事件订阅登记(onEvents 主进程侧半身)
// ---------------------------------------------------------------------------

/** 事件订阅登记面:订阅/退订动词 + sink 广播(测试可注入观测)。 */
export interface WorkbenchEventSubscriptions {
  /** 2.6 批推缓冲的落点:整批发往全部存活订阅者(webContents.send)。 */
  sink(events: readonly unknown[]): void
  subscribe(sender: WorkbenchEventSender): void
  unsubscribe(sender: WorkbenchEventSender): void
  readonly size: number
}

export function createWorkbenchEventSubscriptions(): WorkbenchEventSubscriptions {
  const senders = new Set<WorkbenchEventSender>()
  return {
    sink(events: readonly unknown[]): void {
      if (events.length === 0 || senders.size === 0) return
      for (const sender of senders) {
        if (sender.isDestroyed()) {
          senders.delete(sender) // 防御性清扫(destroyed 钩子之外的第二道)
          continue
        }
        sender.send(WORKBENCH_EVENT_CHANNEL, events)
      }
    },
    subscribe(sender: WorkbenchEventSender): void {
      if (senders.has(sender)) return // 单订阅者语义:同 webContents 重复订阅幂等
      senders.add(sender)
      sender.once('destroyed', () => {
        senders.delete(sender) // 渲染层销毁即退订
      })
    },
    unsubscribe(sender: WorkbenchEventSender): void {
      senders.delete(sender)
    },
    get size() {
      return senders.size
    },
  }
}

// ---------------------------------------------------------------------------
// 动词注册(M2 16 条 + M3 tasks 段 7 条 + migration 段 2 条 + UF3 集成段 2 条
// + 知识系/feature 读段 6 条(任务 2.2)+ prefs 段 3 条(任务 3.1)
// + stages 读段 3 条(任务 3.2)+ dispatch 段 5 条(任务 3.3)
// + dispatch host 回调段 3 条(任务 3.5)= 47 条白名单通道)
// ---------------------------------------------------------------------------

/**
 * Register every workbench verb on exactly one whitelisted channel. Sender
 * validation runs before the try/catch (M1-style plain rejection, never
 * remapped); everything else is mapped through {@link toWorkbenchIpcError}.
 * Async verbs (任务 1.4 起,如 startMigration 的 fs IO 面)经同一映射:同步
 * 抛错即时封装,Promise 拒绝在 then 链上同码封装 —— 两条路径共享一张表。
 */
export function installWorkbenchVerbs(
  handle: WorkbenchHandleRegistrar,
  services: WorkbenchVerbServices,
  subscriptions: WorkbenchEventSubscriptions,
): void {
  const register = (channel: WorkbenchVerbChannel, run: (args: readonly unknown[]) => unknown): void => {
    handle(channel, (event, ...args) => {
      assertWorkbenchSender(channel, event)
      let result: unknown
      try {
        result = run(args)
      } catch (error) {
        throw toWorkbenchIpcError(error, channel)
      }
      if (
        result !== null &&
        typeof result === 'object' &&
        typeof (result as PromiseLike<unknown>).then === 'function'
      ) {
        return (result as PromiseLike<unknown>).then(undefined, (error: unknown) => {
          throw toWorkbenchIpcError(error, channel)
        })
      }
      return result
    })
  }

  const C = WORKBENCH_VERB_CHANNELS

  register(C.getState, () => services.getState())

  register(C.registerProject, (args) => {
    const input = requireObject('registerProject', 'input', args[0])
    requireString('registerProject', 'input.codeRoot', input.codeRoot)
    requireString('registerProject', 'input.docLocationType', input.docLocationType)
    return services.registerProject(input as unknown as RegisterProjectInput)
  })

  register(C.updateProject, args =>
    services.updateProject(
      requireString('updateProject', 'id', args[0]),
      requireObject('updateProject', 'patch', args[1]) as unknown as ProjectPatch,
    ))

  register(C.removeProject, args => services.removeProject(requireString('removeProject', 'id', args[0])))

  register(C.activateProject, args => services.activateProject(requireString('activateProject', 'id', args[0])))

  register(C.getTaskBoard, args => services.getTaskBoard(requireString('getTaskBoard', 'projectId', args[0])))

  register(C.getTaskDetail, args =>
    services.getTaskDetail(
      requireString('getTaskDetail', 'projectId', args[0]),
      requireString('getTaskDetail', 'taskKey', args[1]),
    ))

  register(C.getFeatureBoard, args => services.getFeatureBoard(requireString('getFeatureBoard', 'projectId', args[0])))

  register(C.readFeatureDoc, (args) => {
    const kind = requireString('readFeatureDoc', 'kind', args[2])
    if (!DOC_KINDS.has(kind)) {
      throw new Error(`workbench.readFeatureDoc: kind must be one of manifest/prd/design/ui/tasks (got ${kind})`)
    }
    return services.readFeatureDoc(
      requireString('readFeatureDoc', 'projectId', args[0]),
      requireString('readFeatureDoc', 'featureSlug', args[1]),
      kind as DocKind,
    )
  })

  register(C.listPlugins, () => services.listPlugins())

  register(C.setPluginEnabled, (args) => {
    if (typeof args[1] !== 'boolean') {
      throw new Error(`workbench.setPluginEnabled: enabled must be a boolean (got ${typeof args[1]})`)
    }
    return services.setPluginEnabled(requireString('setPluginEnabled', 'name', args[0]), args[1])
  })

  register(C.recordSessionLink, (args) => {
    const input = requireObject('recordSessionLink', 'input', args[0])
    requireString('recordSessionLink', 'input.projectId', input.projectId)
    requireString('recordSessionLink', 'input.taskKey', input.taskKey)
    requireString('recordSessionLink', 'input.sessionId', input.sessionId)
    return services.recordSessionLink(input as unknown as RecordSessionLinkInput)
  })

  register(C.endSessionLink, args => services.endSessionLink(requireString('endSessionLink', 'linkId', args[0])))

  register(C.authorizeExternalDocPath, args =>
    services.authorizeExternalDocPath(requireString('authorizeExternalDocPath', 'path', args[0])))

  // —— M3 tasks 段(任务 1.3):七个任务动词。Hard Rule 延续 —— 本层只做
  // sender 校验 + 参数形状校验 + 服务调用 + 错误映射;taskKey 限定地址
  // 形态、actor 审计、状态机/依赖校验全部在内核服务面(task-service),
  // 不信任 renderer 语义(T1 缓解)。 ——

  const requireTaskRef = (verb: string, value: unknown): { projectId: string; taskKey: string } => {
    const input = requireObject(verb, 'input', value)
    requireString(verb, 'input.projectId', input.projectId)
    requireString(verb, 'input.taskKey', input.taskKey)
    return input as unknown as { projectId: string; taskKey: string }
  }

  register(C.taskAdd, (args) => {
    const input = requireObject('taskAdd', 'input', args[0])
    requireString('taskAdd', 'input.projectId', input.projectId)
    requireString('taskAdd', 'input.featureSlug', input.featureSlug)
    requireString('taskAdd', 'input.title', input.title)
    optionalString('taskAdd', 'input.taskKey', input.taskKey)
    optionalString('taskAdd', 'input.taskType', input.taskType)
    optionalString('taskAdd', 'input.descPath', input.descPath)
    if (input.blockers !== undefined && input.blockers !== null) {
      if (!Array.isArray(input.blockers) || input.blockers.some(dep => typeof dep !== 'string' || dep === '')) {
        throw new Error('workbench.taskAdd: input.blockers must be an array of non-empty strings when present')
      }
    }
    return services.taskAdd(input as unknown as TaskAddInput, requireString('taskAdd', 'actor', args[1]))
  })

  register(C.taskClaim, args =>
    services.taskClaim(
      requireTaskRef('taskClaim', args[0]) as TaskClaimInput,
      requireString('taskClaim', 'actor', args[1]),
    ))

  register(C.taskTransition, (args) => {
    const input = requireObject('taskTransition', 'input', args[0])
    requireString('taskTransition', 'input.projectId', input.projectId)
    requireString('taskTransition', 'input.taskKey', input.taskKey)
    const to = requireString('taskTransition', 'input.to', input.to)
    if (!TASK_STATUSES.has(to)) {
      throw new Error(`workbench.taskTransition: input.to must be one of the 7 task statuses (got ${to})`)
    }
    optionalString('taskTransition', 'input.reason', input.reason)
    return services.taskTransition(input as unknown as TaskTransitionInput, requireString('taskTransition', 'actor', args[1]))
  })

  register(C.taskSubmit, (args) => {
    const input = requireObject('taskSubmit', 'input', args[0])
    requireString('taskSubmit', 'input.projectId', input.projectId)
    requireString('taskSubmit', 'input.taskKey', input.taskKey)
    optionalString('taskSubmit', 'input.recordPath', input.recordPath)
    return services.taskSubmit(input as unknown as TaskSubmitInput, requireString('taskSubmit', 'actor', args[1]))
  })

  register(C.taskReopen, args =>
    services.taskReopen(
      requireTaskRef('taskReopen', args[0]) as TaskReopenInput,
      requireString('taskReopen', 'actor', args[1]),
    ))

  register(C.taskGet, args => services.taskGet(requireTaskRef('taskGet', args[0]) as TaskGetInput))

  register(C.taskQuery, (args) => {
    const input = requireObject('taskQuery', 'input', args[0])
    requireString('taskQuery', 'input.projectId', input.projectId)
    optionalString('taskQuery', 'input.featureSlug', input.featureSlug)
    const status = optionalString('taskQuery', 'input.status', input.status)
    if (status !== undefined && !TASK_STATUSES.has(status)) {
      throw new Error(`workbench.taskQuery: input.status must be one of the 7 task statuses when present (got ${status})`)
    }
    return services.taskQuery(input as unknown as TaskQueryInput)
  })

  // —— M3 migration 段(任务 1.4):一对迁移动词。Hard Rule 延续 —— 本层
  //    只做 sender 校验 + 参数形状校验 + 服务调用 + 错误映射;守卫/备份/
  //    摄入/对拍/切读/归档与回滚全部在内核管线(migration/pipeline.ts),
  //    startMigration 的异步拒绝经 register 的 then 链同码封装。 ——

  register(C.getMigrationStatus, args =>
    services.getMigrationStatus(requireString('getMigrationStatus', 'projectId', args[0])))

  register(C.startMigration, args =>
    services.startMigration(requireString('startMigration', 'projectId', args[0])))

  // —— M3 UF3 集成段(任务 1.7):两条只读探测/位置读。同一 Hard Rule ——
  //    本层零内联业务;probeCodeRoot 的 fs 只读探测与 getWorkbenchPaths 的
  //    userData 路径解析全部在 services 装配层。——
  register(C.probeCodeRoot, (args) => {
    const input = args[0]
    if (input === null || typeof input !== 'object' || typeof (input as { codeRoot?: unknown }).codeRoot !== 'string') {
      throw new Error('probeCodeRoot expects { codeRoot: string }')
    }
    const { codeRoot, docLocationPath } = input as { codeRoot: string; docLocationPath?: unknown }
    return services.probeCodeRoot({
      codeRoot,
      ...(typeof docLocationPath === 'string' ? { docLocationPath } : { docLocationPath: null }),
    })
  })

  register(C.getWorkbenchPaths, () => services.getWorkbenchPaths())

  // —— M3 知识系 + feature 读段(任务 2.2,D4):六条动词。Hard Rule 延续 ——
  //    本层只做 sender 校验 + 参数形状校验 + 服务调用 + 错误映射;动作分派、
  //    路径授权(文档根/forge 根 + 越界拒绝)与 forge 数据面语义全部在内核
  //    (knowledge/knowledge-service.ts),不信任 renderer 语义(T1)。 ——

  const FACT_SOURCES = new Set(['static', 'runtime', 'manual'])
  const FACT_CONFIDENCES = new Set(['confirmed', 'inferred', 'assumed'])
  const FACT_KINDS = new Set([
    'signature', 'output_format', 'error_code', 'side_effect',
    'precondition', 'compilation_error', 'runtime_crash',
  ])

  /** 可选字符串数组成员校验(tags/dimensions/candidates 共用)。 */
  const optionalStringArray = (verb: string, arg: string, value: unknown): void => {
    if (value === undefined || value === null) return
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || entry === '')) {
      throw new Error(`workbench.${verb}: ${arg} must be an array of non-empty strings when present`)
    }
  }

  const requireKnowledgeProject = (verb: string, value: unknown): string =>
    requireString(verb, 'input.projectId', value)

  register(C.knowledgeFact, (args) => {
    const input = requireObject('knowledgeFact', 'input', args[0])
    requireKnowledgeProject('knowledgeFact', input.projectId)
    const action = requireString('knowledgeFact', 'input.action', input.action)
    if (!['list', 'get', 'summary', 'add'].includes(action)) {
      throw new Error(`workbench.knowledgeFact: input.action must be one of list/get/summary/add (got ${action})`)
    }
    const source = optionalString('knowledgeFact', 'input.source', input.source)
    if (source !== undefined && !FACT_SOURCES.has(source)) {
      throw new Error(`workbench.knowledgeFact: input.source must be one of static/runtime/manual when present (got ${source})`)
    }
    const confidence = optionalString('knowledgeFact', 'input.confidence', input.confidence)
    if (confidence !== undefined && !FACT_CONFIDENCES.has(confidence)) {
      throw new Error(`workbench.knowledgeFact: input.confidence must be one of confirmed/inferred/assumed when present (got ${confidence})`)
    }
    optionalString('knowledgeFact', 'input.factId', input.factId)
    if (input.entry !== undefined && input.entry !== null) {
      const entry = requireObject('knowledgeFact', 'input.entry', input.entry)
      requireString('knowledgeFact', 'input.entry.subject', entry.subject)
      const kind = requireString('knowledgeFact', 'input.entry.kind', entry.kind)
      if (!FACT_KINDS.has(kind)) {
        throw new Error(`workbench.knowledgeFact: input.entry.kind must be one of the 7 fact kinds (got ${kind})`)
      }
      if (entry.value === undefined || entry.value === null) {
        throw new Error('workbench.knowledgeFact: input.entry.value is required (any JSON value)')
      }
      optionalString('knowledgeFact', 'input.entry.factId', entry.factId)
      const entrySource = optionalString('knowledgeFact', 'input.entry.source', entry.source)
      if (entrySource !== undefined && !FACT_SOURCES.has(entrySource)) {
        throw new Error(`workbench.knowledgeFact: input.entry.source must be one of static/runtime/manual when present (got ${entrySource})`)
      }
      const entryConfidence = optionalString('knowledgeFact', 'input.entry.confidence', entry.confidence)
      if (entryConfidence !== undefined && !FACT_CONFIDENCES.has(entryConfidence)) {
        throw new Error(`workbench.knowledgeFact: input.entry.confidence must be one of confirmed/inferred/assumed when present (got ${entryConfidence})`)
      }
    }
    return services.knowledgeFact(input as unknown as KnowledgeFactInput)
  })

  register(C.knowledgeLesson, (args) => {
    const input = requireObject('knowledgeLesson', 'input', args[0])
    requireKnowledgeProject('knowledgeLesson', input.projectId)
    const action = requireString('knowledgeLesson', 'input.action', input.action)
    if (!['list', 'get', 'add'].includes(action)) {
      throw new Error(`workbench.knowledgeLesson: input.action must be one of list/get/add (got ${action})`)
    }
    optionalString('knowledgeLesson', 'input.name', input.name)
    optionalString('knowledgeLesson', 'input.title', input.title)
    optionalString('knowledgeLesson', 'input.severity', input.severity)
    optionalString('knowledgeLesson', 'input.created', input.created)
    optionalString('knowledgeLesson', 'input.body', input.body)
    optionalStringArray('knowledgeLesson', 'input.tags', input.tags)
    return services.knowledgeLesson(input as unknown as KnowledgeLessonInput)
  })

  register(C.knowledgeResearch, (args) => {
    const input = requireObject('knowledgeResearch', 'input', args[0])
    requireKnowledgeProject('knowledgeResearch', input.projectId)
    const action = requireString('knowledgeResearch', 'input.action', input.action)
    if (!['list', 'get', 'add'].includes(action)) {
      throw new Error(`workbench.knowledgeResearch: input.action must be one of list/get/add (got ${action})`)
    }
    optionalString('knowledgeResearch', 'input.slug', input.slug)
    optionalString('knowledgeResearch', 'input.topic', input.topic)
    optionalString('knowledgeResearch', 'input.mode', input.mode)
    optionalString('knowledgeResearch', 'input.created', input.created)
    optionalString('knowledgeResearch', 'input.body', input.body)
    optionalStringArray('knowledgeResearch', 'input.dimensions', input.dimensions)
    optionalStringArray('knowledgeResearch', 'input.candidates', input.candidates)
    return services.knowledgeResearch(input as unknown as KnowledgeResearchInput)
  })

  register(C.knowledgeForensic, (args) => {
    const input = requireObject('knowledgeForensic', 'input', args[0])
    const action = requireString('knowledgeForensic', 'input.action', input.action)
    if (!['search', 'extract', 'subagents'].includes(action)) {
      throw new Error(`workbench.knowledgeForensic: input.action must be one of search/extract/subagents (got ${action})`)
    }
    optionalString('knowledgeForensic', 'input.projectPath', input.projectPath)
    optionalString('knowledgeForensic', 'input.keyword', input.keyword)
    optionalString('knowledgeForensic', 'input.session', input.session)
    optionalString('knowledgeForensic', 'input.skill', input.skill)
    if (input.last !== undefined && input.last !== null && (typeof input.last !== 'number' || !Number.isInteger(input.last) || input.last <= 0)) {
      throw new Error('workbench.knowledgeForensic: input.last must be a positive integer when present')
    }
    optionalString('knowledgeForensic', 'input.transcriptPath', input.transcriptPath)
    optionalString('knowledgeForensic', 'input.sessionDir', input.sessionDir)
    return services.knowledgeForensic(input as unknown as KnowledgeForensicInput)
  })

  register(C.featureList, args =>
    services.featureList(requireString('featureList', 'projectId', args[0])))

  register(C.featureStatus, (args) => {
    const input = requireObject('featureStatus', 'input', args[0])
    requireString('featureStatus', 'input.projectId', input.projectId)
    requireString('featureStatus', 'input.featureSlug', input.featureSlug)
    return services.featureStatus(input as unknown as { projectId: string; featureSlug: string })
  })

  // —— M3 prefs 段(任务 3.1):三条偏好动词。Hard Rule 延续 —— 本层只做
  // sender 校验 + 参数形状校验 + 服务调用 + 错误映射;scope 限定地址拆解、
  // 项目存在性、键集/类型校验与事务原子全部在内核服务面(prefs-service),
  // 不信任 renderer 语义。 ——

  /** scope 形状校验:'global' | { project } | { feature }(限定地址语义归内核)。 */
  const requirePrefScope = (verb: string, value: unknown): PrefScope => {
    if (value === 'global') return value
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const scope = value as { project?: unknown; feature?: unknown }
      const hasProject = scope.project !== undefined
      const hasFeature = scope.feature !== undefined
      if (hasProject === hasFeature) {
        throw new Error(`workbench.${verb}: scope must be 'global', { project }, or { feature } (exactly one tier field)`)
      }
      if (hasProject) {
        return { project: requireString(verb, 'scope.project', scope.project) }
      }
      return { feature: requireString(verb, 'scope.feature', scope.feature) }
    }
    throw new Error(`workbench.${verb}: scope must be 'global', { project }, or { feature } (got ${typeof value})`)
  }

  register(C.getPrefs, args => services.getPrefs(requirePrefScope('getPrefs', args[0])))

  register(C.setPrefs, (args) => {
    const scope = requirePrefScope('setPrefs', args[0])
    if (!Array.isArray(args[1])) {
      throw new Error(`workbench.setPrefs: entries must be an array (got ${typeof args[1]})`)
    }
    const entries: PrefEntry[] = args[1].map((entry, index) => {
      const record = requireObject('setPrefs', `entries[${String(index)}]`, entry)
      return {
        key: requireString('setPrefs', `entries[${String(index)}].key`, record.key),
        value: record.value,
      }
    })
    return services.setPrefs(scope, entries)
  })

  register(C.clearPrefOverride, args =>
    services.clearPrefOverride(requirePrefScope('clearPrefOverride', args[0]), requireString('clearPrefOverride', 'key', args[1])))

  // —— M3 stages 读段(任务 3.2):三条阶段动词。Hard Rule 延续 —— 本层
  // 只做 sender 校验 + 参数形状校验 + 服务调用 + 错误映射;期望清单判定、
  // 门态与资产索引读取全部在内核服务面(stages-service,确定性代码),
  // 不信任 renderer 语义。 ——

  register(C.checkStageArtifacts, (args) => {
    const input = requireObject('checkStageArtifacts', 'input', args[0])
    requireString('checkStageArtifacts', 'input.projectId', input.projectId)
    requireString('checkStageArtifacts', 'input.featureSlug', input.featureSlug)
    return services.checkStageArtifacts(input as unknown as { projectId: string; featureSlug: string })
  })

  register(C.getStageGate, args =>
    services.getStageGate(
      requireString('getStageGate', 'projectId', args[0]),
      requireString('getStageGate', 'featureSlug', args[1]),
    ))

  register(C.listStageAssets, args =>
    services.listStageAssets(
      requireString('listStageAssets', 'projectId', args[0]),
      requireString('listStageAssets', 'featureSlug', args[1]),
    ))

  // —— M3 dispatch 段(任务 3.3):五条编排动词。Hard Rule 延续 —— 本层
  // 只做 sender 校验 + 参数形状校验 + 服务调用 + 错误映射;可派发集校验
  // (状态/依赖)、产物检查消费、预合成契约查、审批审计与 ⇔ 不变式全部
  // 在内核服务面(dispatch-service),不信任 renderer 语义(T1);
  // dispatchTasks/redispatch 的 Promise 拒绝经 register 的 then 链同码封装。 ——

  register(C.dispatchTasks, (args) => {
    const input = requireObject('dispatchTasks', 'input', args[0])
    requireString('dispatchTasks', 'input.projectId', input.projectId)
    if (!Array.isArray(input.taskKeys) || input.taskKeys.some(key => typeof key !== 'string' || key === '')) {
      throw new Error('workbench.dispatchTasks: input.taskKeys must be a non-empty array of non-empty board addresses')
    }
    if (input.acknowledgeMissing !== undefined && typeof input.acknowledgeMissing !== 'boolean') {
      throw new Error(`workbench.dispatchTasks: input.acknowledgeMissing must be a boolean when present (got ${typeof input.acknowledgeMissing})`)
    }
    return services.dispatchTasks(input as unknown as DispatchTasksInput, requireString('dispatchTasks', 'actor', args[1]))
  })

  register(C.redispatch, args =>
    services.redispatch(requireString('redispatch', 'dispatchId', args[0]), requireString('redispatch', 'actor', args[1])))

  register(C.getDispatches, args =>
    services.getDispatches(requireString('getDispatches', 'projectId', args[0])))

  register(C.listApprovals, args =>
    services.listApprovals(requireString('listApprovals', 'projectId', args[0])))

  register(C.decideApproval, (args) => {
    const input = requireObject('decideApproval', 'input', args[0])
    requireString('decideApproval', 'input.approvalId', input.approvalId)
    if (typeof input.approve !== 'boolean') {
      throw new Error(`workbench.decideApproval: input.approve must be a boolean (got ${typeof input.approve})`)
    }
    return services.decideApproval(input as unknown as DecideApprovalInput, requireString('decideApproval', 'actor', args[1]))
  })

  // —— M3 dispatch host 回调段(任务 3.5):renderer relay 替 host 半身
  // (dispatch-launch/approval-bridge)转发的回调面;语义/事务在内核
  // dispatch-service,通道面零特权(T1 延续:不信任 renderer 语义)。 ——

  register(C.receiveApproval, (args) => {
    const input = requireObject('receiveApproval', 'input', args[0])
    requireString('receiveApproval', 'input.dispatchId', input.dispatchId)
    if (input.sessionId !== undefined && typeof input.sessionId !== 'string') {
      throw new Error(`workbench.receiveApproval: input.sessionId must be a string when present (got ${typeof input.sessionId})`)
    }
    if (input.payload === undefined) {
      throw new Error('workbench.receiveApproval: input.payload is required (the approval request body)')
    }
    return services.receiveApproval(input as unknown as ReceiveApprovalVerbInput)
  })

  register(C.notifySessionStarted, args =>
    services.notifySessionStarted(
      requireString('notifySessionStarted', 'dispatchId', args[0]),
      requireString('notifySessionStarted', 'sessionId', args[1]),
    ))

  register(C.notifyLaunchFailed, args =>
    services.notifyLaunchFailed(
      requireString('notifyLaunchFailed', 'dispatchId', args[0]),
      requireString('notifyLaunchFailed', 'error', args[1]),
    ))

  // 订阅/退订:需要 event.sender(webContents)做登记,独立于 args 路径。
  const registerSenderVerb = (
    channel: WorkbenchVerbChannel,
    verb: string,
    action: (sender: WorkbenchEventSender) => void,
  ): void => {
    handle(channel, (event) => {
      assertWorkbenchSender(channel, event)
      try {
        const sender = event.sender
        if (sender === undefined) {
          throw new Error(`workbench.${verb}: invoking event carried no sender webContents`)
        }
        action(sender)
      } catch (error) {
        throw toWorkbenchIpcError(error, channel)
      }
    })
  }

  registerSenderVerb(C.subscribeEvents, 'subscribeEvents', sender => subscriptions.subscribe(sender))
  registerSenderVerb(C.unsubscribeEvents, 'unsubscribeEvents', sender => subscriptions.unsubscribe(sender))
}
