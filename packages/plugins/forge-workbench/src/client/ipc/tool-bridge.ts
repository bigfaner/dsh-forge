/**
 * client/ipc/tool-bridge — renderer 桥的 client 半身(任务 2.1;T2)。
 *
 * 桥形态(spike-1 §2 跳 2',倒向桥):host 半身 ForgeToolBridgeService 暴露
 * `calls` stream + `answer` 单向面;本模块在 renderer 侧 ——
 *   1. NAMESPACE MOUNT — 经 `ctx.remote.$mount` 挂 `forgeToolBridge` 命名空间
 *      (5.11 先例的手写 TypertRemoteContribution 形态:直接描述符,
 *      wire 字段 = host 方法参数名原词,strict 手写 codec 入参校验,src-json
 *      结果;`calls` = mode:'stream' + cancellation signal 尾参)。
 *   2. CALL PUMP — 打开 calls 流,逐帧 dispatch 到 I1 白名单动词
 *      (window.dshForge.workbench.*),应答经 answer 单向回传。动词映射 =
 *      **封闭 switch**(无通配/无反射 —— Hard Rule T4:渲染进程被攻破面的
 *      最大能力 = 既定动词集);读动词不携带 actor,写动词原样透传
 *      `session:<id>`(内核记 updated_by 审计)。
 *   3. 生命周期 — 与插件同寿命;无 preload 桥(jsdom/hostless)或无 remote
 *      服务 = no-op(host 侧宽限/预算降级链兜底,禁静默语义不破);流断开 =
 *      延时重开(连接丢失自愈),帧处理互不阻塞(逐帧独立 answer)。
 *
 * 错误规约:动词 reject(任意形态)→ normalizeWorkbenchVerbError 折成
 * `{ code, message, detail? }` 封装应答 —— 业务拒绝(files 项目走 CLI 提示
 * 等)按 ok:false 原码回传 host,由工具面值化呈现;host 侧 transport 失败
 * (含本泵缺席导致的宽限/预算超时)→ ERR_TOOL_BRIDGE_UNAVAILABLE 上抛会话。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  InvocationDescriptor, InvocationParameterDescriptor, TypertClientRemote,
  TypertRemoteContribution, TypertSchema,
} from '@deepseek-ai/dsh-typert-protocol'
import type {
  ForgeToolBridgeAnswer, ForgeToolBridgeCall,
} from '../../host/forge-tools/bridge-core'
import type {
  KnowledgeFactInput, KnowledgeForensicInput, KnowledgeLessonInput, KnowledgeResearchInput,
  PrefScope, ReceiveApprovalInput, StageSummarizeInput, TaskAddInput, TaskClaimInput, TaskGetInput,
  TaskQueryInput, TaskReopenInput, TaskStatus, TaskSubmitInput, TaskTransitionInput,
} from '../ipc-types'
import { getWorkbenchIpcBridge, normalizeWorkbenchVerbError, type WorkbenchIpcBridge } from './workbench'

/** The plugin's npm identity (contribution bookkeeping; 5.11 seat 同源). */
const PACKAGE = '@dsh-forge/plugin-forge-workbench'

/** 流断开后的重开延时(连接丢失自愈;短于 host 侧宽限+重试预算的组合)。 */
const REOPEN_DELAY_MS = 500

// ---------------------------------------------------------------------------
// 1. The namespace mount (the hand-written Typert contribution)
// ---------------------------------------------------------------------------

/** ForgeToolBridgeAnswer 的边界 schema(ok 分支带 value,失败分支带封装字段)。 */
const ANSWER_SCHEMA: TypertSchema<ForgeToolBridgeAnswer> = {
  parse(value: unknown): ForgeToolBridgeAnswer {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('expected the ForgeToolBridgeAnswer object')
    }
    const source = value as Record<string, unknown>
    if (typeof source.callId !== 'string' || typeof source.ok !== 'boolean') {
      throw new TypeError('answer fields callId:string and ok:boolean are required')
    }
    for (const field of ['code', 'message', 'detail'] as const) {
      if (source[field] !== undefined && typeof source[field] !== 'string') {
        throw new TypeError(`optional answer field ${field} must be a string when present`)
      }
    }
    return value as ForgeToolBridgeAnswer
  },
}

/** One strict-parameter descriptor (5.11 先例的 jsonParameter 同款)。 */
function jsonParameter(name: string, typeSymbol: string, schema: TypertSchema<unknown>): InvocationParameterDescriptor {
  return {
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol, create: () => schema },
  }
}

/** calls:stream 订阅面(零业务参;signal 尾参 = transport cancellation)。 */
const FORGE_TOOL_BRIDGE_CALLS: InvocationDescriptor = {
  id: `${PACKAGE}#forgeToolBridge/calls`,
  service: 'forgeToolBridge',
  namespace: 'forgeToolBridge',
  method: 'calls',
  mode: 'stream',
  invocation: { kind: 'direct' },
  parameters: [],
  cancellation: { parameter: 'signal' },
  result: { mode: 'src-json' },
}

/** answer:单向应答面(一个 `answer` 参数,strict codec)。 */
const FORGE_TOOL_BRIDGE_ANSWER: InvocationDescriptor = {
  id: `${PACKAGE}#forgeToolBridge/answer`,
  service: 'forgeToolBridge',
  namespace: 'forgeToolBridge',
  method: 'answer',
  invocation: { kind: 'direct' },
  parameters: [jsonParameter('answer', `${PACKAGE}#ForgeToolBridgeAnswer`, ANSWER_SCHEMA)],
  result: { mode: 'src-json' },
}

/** 桥命名空间贡献(挂载后 `ctx.remote.forgeToolBridge.calls/answer` 可调)。 */
export const FORGE_TOOL_BRIDGE_REMOTE_CONTRIBUTION: TypertRemoteContribution = {
  package: PACKAGE,
  descriptors: [FORGE_TOOL_BRIDGE_CALLS, FORGE_TOOL_BRIDGE_ANSWER],
}

// ---------------------------------------------------------------------------
// 2. The closed-verb dispatch (Hard Rule T4: 封闭动词集,无通配/无反射)
// ---------------------------------------------------------------------------

/** 已挂载 forgeToolBridge 命名空间的结构面(duck-checked at read)。 */
interface ForgeToolBridgeNamespace {
  calls(signal: AbortSignal): AsyncIterable<ForgeToolBridgeCall>
  answer(answer: ForgeToolBridgeAnswer): Promise<{ ok: boolean }>
}

/** 帧参数的宽松读取面(形态由 host 工具族 + 内核复验)。 */
interface BridgeCallArgs {
  projectId: string
  taskKey?: string
  featureSlug?: string
  title?: string
  blockers?: string[]
  taskType?: string
  descPath?: string
  to?: TaskStatus
  reason?: string
  recordPath?: string
  status?: TaskStatus
  // —— 知识系 + feature 读族(任务 2.2;形态 = knowledge/feature-read 工具)——
  action?: string
  source?: string
  confidence?: string
  factId?: string
  entry?: Record<string, unknown>
  name?: string
  tags?: string[]
  severity?: string
  created?: string
  body?: string
  slug?: string
  topic?: string
  mode?: string
  dimensions?: string[]
  candidates?: string[]
  projectPath?: string
  keyword?: string
  session?: string
  skill?: string
  last?: number
  transcriptPath?: string
  sessionDir?: string
  // —— 审批桥上行族(任务 3.5;approval_receive/approval_decide 帧字段)——
  dispatchId?: string
  sessionId?: string
  payload?: unknown
  approvalId?: string
  approve?: boolean
  // —— stage 写族(任务 4.1;stage_summarize 帧字段)——
  stage?: string
  goal?: string
  summary?: string
  // —— proposal 读族(任务 5.3;proposal_list/proposal_show 帧字段)——
  kind?: string
}

/**
 * 一帧 → I1 白名单动词的封闭映射(写动词透传 actor 审计;读动词不携带;
 * task_list = 无过滤 task_query,forge CLI task list 同义)。封闭集外的
 * 动词 = 类型面不可达,防御分支显式拒绝(T4 —— 桥不是透传面)。
 *
 * 知识系族(任务 2.2)按 action 判写:fact/lesson/research 的 add = 写
 * 动作(actor 透传桥面;内核按 forge 数据面消费 —— 文件形态无作者槽,
 * 不落盘),list/get/summary = 读动作不携带;forensic/feature 全只读。
 */
function invokeVerb(bridge: WorkbenchIpcBridge, call: ForgeToolBridgeCall): Promise<unknown> {
  const args = call.args as unknown as BridgeCallArgs
  switch (call.verb) {
    case 'task_add':
      return bridge.taskAdd(args as unknown as TaskAddInput, call.actor)
    case 'task_claim':
      return bridge.taskClaim(args as unknown as TaskClaimInput, call.actor)
    case 'task_transition':
      return bridge.taskTransition(args as unknown as TaskTransitionInput, call.actor)
    case 'task_submit':
      return bridge.taskSubmit(args as unknown as TaskSubmitInput, call.actor)
    case 'task_reopen':
      return bridge.taskReopen(args as unknown as TaskReopenInput, call.actor)
    case 'task_get':
      return bridge.taskGet(args as unknown as TaskGetInput)
    case 'task_query':
      return bridge.taskQuery(args as unknown as TaskQueryInput)
    case 'task_list':
      return bridge.taskQuery({ projectId: args.projectId })
    case 'knowledge_fact':
      // add 的 actor 审计位随帧走(ForgeToolBridgeCall.actor),不进 IPC 面
      // —— forge 文件数据面无作者槽(Hard Rule 不新增语义),内核不落盘。
      return bridge.knowledgeFact(args as unknown as KnowledgeFactInput)
    case 'knowledge_lesson':
      return bridge.knowledgeLesson(args as unknown as KnowledgeLessonInput)
    case 'knowledge_research':
      return bridge.knowledgeResearch(args as unknown as KnowledgeResearchInput)
    case 'knowledge_forensic':
      return bridge.knowledgeForensic(args as unknown as KnowledgeForensicInput)
    case 'feature_list':
      return bridge.featureList(args.projectId as string)
    case 'feature_status':
      return bridge.featureStatus({
        projectId: args.projectId as string,
        featureSlug: args.featureSlug as string,
      })
    case 'pref_get':
      return bridge.getPrefs(prefScopeOf(args))
    // —— stage 写族(任务 4.1):forge_stage_summarize 的内核写腿(资产
    //    文件无作者槽,actor 不进 IPC 面 —— 知识系 add 同口径)。 ——
    case 'stage_summarize':
      return bridge.stageSummarize({
        projectId: args.projectId as string,
        featureSlug: args.featureSlug as string,
        stage: args.stage as StageSummarizeInput['stage'],
        goal: args.goal as string,
        summary: args.summary as string,
      })
    // —— proposal 读族(任务 5.3):forge_proposal_list/show 的内核读腿
    //    (只读 —— 不携带 actor 写审计,feature 读族同口径;kind 缺省
    //    proposal,host 工具面已做白名单断言)。 ——
    case 'proposal_list':
      return bridge.getProposalBoard(args.projectId as string)
    case 'proposal_show':
      return bridge.readProposalDoc({
        projectId: args.projectId as string,
        slug: args.slug as string,
        kind: (args.kind ?? 'proposal') as 'proposal' | 'eval',
      })
    // —— 审批桥上行族(任务 3.5):host approval-bridge 的内核端口腿。
    //    approval_receive = 审批事件入列(插 pending + awaiting 联动);
    //    approval_decide = cancelled 核销腿(actor='kernel',decideApproval
    //    (approve=false) 形态 —— spike-2 §4-5 方案 (a))。两者皆非模型
    //    工具帧(host 内部端口),actor 语义 = 帧自带审计主体。 ——
    case 'approval_receive':
      return bridge.receiveApproval(args as unknown as ReceiveApprovalInput)
    case 'approval_decide':
      return bridge.decideApproval(
        { approvalId: args.approvalId as string, approve: args.approve === true },
        call.actor,
      )
    default: {
      const unreachable: never = call.verb
      return Promise.reject(new Error(`forge tool bridge: unknown verb ${String(unreachable)}`))
    }
  }
}

/**
 * pref_get 帧的 tier 组合(任务 3.1):两参缺省 = 全局;仅 projectId =
 * 项目级;projectId + featureSlug = feature 级(限定地址
 * `<projectId>/<featureSlug>` 在本面组合 —— host 工具面已做白名单断言,
 * 此处只承映射)。featureSlug 无 projectId = 不可达组合,防御拒绝。
 */
function prefScopeOf(args: BridgeCallArgs): PrefScope {
  if (args.featureSlug !== undefined) {
    if (typeof args.projectId !== 'string' || args.projectId === '') {
      // host 工具面已挡的不可达组合:防御拒绝(dispatch 的 catch 折成封装应答)。
      throw new Error('forge tool bridge: pref_get featureSlug requires projectId')
    }
    return { feature: `${args.projectId}/${args.featureSlug}` }
  }
  if (args.projectId !== undefined) return { project: args.projectId }
  return 'global'
}

/**
 * 一帧的完整应答:动词 reject(任意形态)经 normalizeWorkbenchVerbError 折成
 * `{ code, message, detail? }` 封装 —— 业务拒绝原码回传 host(files 项目走
 * CLI 提示等,由工具面值化呈现),成功 → ok:true + value。
 */
export async function dispatchToolBridgeCall(
  bridge: WorkbenchIpcBridge,
  call: ForgeToolBridgeCall,
): Promise<ForgeToolBridgeAnswer> {
  try {
    return { callId: call.callId, ok: true, value: await invokeVerb(bridge, call) }
  } catch (error) {
    const envelope = normalizeWorkbenchVerbError(error)
    return {
      callId: call.callId,
      ok: false,
      code: envelope.code,
      message: envelope.message,
      ...(envelope.detail === undefined ? {} : { detail: envelope.detail }),
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The pump + the installer (plugin-lifetime lifecycle)
// ---------------------------------------------------------------------------

/** 泵参数(测试注入面:流开器 + 应答面拆出)。 */
export interface ToolBridgePumpDeps {
  readonly openStream: (signal: AbortSignal) => AsyncIterable<ForgeToolBridgeCall>
  readonly sendAnswer: (answer: ForgeToolBridgeAnswer) => Promise<unknown>
  readonly bridge: WorkbenchIpcBridge
  /** 重开延时(测试 0);缺省 REOPEN_DELAY_MS。 */
  readonly reopenDelayMs?: number
}

/**
 * 流泵:迭代 calls 帧,逐帧独立 dispatch + answer(慢查询不阻塞后续帧)。
 * 返回停机句柄;流结束/异常 → 延时重开(自愈),停机后不再重开。
 */
export function runToolBridgePump(deps: ToolBridgePumpDeps): { stop(): void } {
  const controller = new AbortController()
  const reopenDelayMs = deps.reopenDelayMs ?? REOPEN_DELAY_MS
  let stopped = false

  const delay = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

  const handle = async (call: ForgeToolBridgeCall): Promise<void> => {
    try {
      const answer = await dispatchToolBridgeCall(deps.bridge, call)
      await deps.sendAnswer(answer)
    } catch {
      // 应答腿失败(连接抖动):host 侧该 call 走预算超时降级,不致命。
    }
  }

  void (async () => {
    while (!stopped) {
      try {
        const stream = await deps.openStream(controller.signal)
        for await (const call of stream) {
          if (stopped || controller.signal.aborted) break
          void handle(call)
        }
      } catch {
        // 载体失败(连接未建立/中断)→ 落入重开节律。
      }
      if (stopped) break
      await delay(reopenDelayMs)
    }
  })()

  return {
    stop(): void {
      stopped = true
      controller.abort()
    },
  }
}

/**
 * 安装 renderer 桥(client apply 调用):preload 桥在场 + `remote` 服务可注入
 * 时挂命名空间并起泵;任一缺席 = no-op(host 侧降级链兜底)。返回拆卸句柄。
 */
export function installToolBridgeClient(ctx: ClientContext): () => void {
  const bridge = getWorkbenchIpcBridge()
  if (bridge === undefined) return () => {} // hostless:无应答面,host 侧降级
  let pump: { stop(): void } | undefined

  ctx.effect(() => {
    if (typeof (ctx as { inject?: unknown }).inject !== 'function') return () => {}
    const fiber = (ctx as unknown as {
      inject(names: string[], body: (ctx: ClientContext) => void): { dispose(): Promise<void> | void }
    }).inject(['remote'], (remoteCtx: ClientContext) => {
      const remote = remoteCtx.get('remote', false) as TypertClientRemote | undefined
      if (remote === undefined || typeof remote.$mount !== 'function') return
      void remote.$mount(FORGE_TOOL_BRIDGE_REMOTE_CONTRIBUTION)
        .then((disposeMount) => {
          const namespace = namespaceOf(remoteCtx)
          if (namespace === undefined) {
            void disposeMount()
            return
          }
          remoteCtx.effect(() => () => {
            pump?.stop()
            void disposeMount()
          }, 'forge-workbench: tool bridge unmount')
          pump = runToolBridgePump({
            bridge,
            openStream: signal => namespace.calls(signal),
            sendAnswer: answer => Promise.resolve(namespace.answer(answer)),
          })
        })
        .catch(() => {
          // 挂载拒绝(贡献冲突/注册面闭合):保持缺席,host 侧降级链兜底。
        })
    })
    return () => {
      pump?.stop()
      void fiber.dispose()
    }
  }, 'forge-workbench: tool bridge')

  return () => {
    pump?.stop()
  }
}

/** 读取已挂载的 forgeToolBridge 命名空间(结构面 duck-checked,缺席 → undefined)。 */
function namespaceOf(ctx: ClientContext): ForgeToolBridgeNamespace | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get('remote.forgeToolBridge', false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as Record<string, unknown>
  return typeof face.calls === 'function' && typeof face.answer === 'function'
    ? candidate as ForgeToolBridgeNamespace
    : undefined
}
