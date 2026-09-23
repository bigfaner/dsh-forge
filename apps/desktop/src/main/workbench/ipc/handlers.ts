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
  DocKind,
  ProjectPatch,
  RecordSessionLinkInput,
  RegisterProjectInput,
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
// 动词注册(16 条白名单通道)
// ---------------------------------------------------------------------------

/**
 * Register every workbench verb on exactly one whitelisted channel. Sender
 * validation runs before the try/catch (M1-style plain rejection, never
 * remapped); everything else is mapped through {@link toWorkbenchIpcError}.
 */
export function installWorkbenchVerbs(
  handle: WorkbenchHandleRegistrar,
  services: WorkbenchVerbServices,
  subscriptions: WorkbenchEventSubscriptions,
): void {
  const register = (channel: WorkbenchVerbChannel, run: (args: readonly unknown[]) => unknown): void => {
    handle(channel, (event, ...args) => {
      assertWorkbenchSender(channel, event)
      try {
        return run(args)
      } catch (error) {
        throw toWorkbenchIpcError(error, channel)
      }
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
