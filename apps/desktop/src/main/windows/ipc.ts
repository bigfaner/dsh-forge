// windows/ipc — dsh-forge:window-* 动词注册(任务 4.2;tech-design
// §Interfaces·Interface 5「新 shell 动词组,非 workbench 前缀」)。
//
// Hard Rule 执行(workbench/ipc/handlers.ts 同款纪律):本层只做 sender
// 校验 + 参数形状校验 + 服务调用 + 域错误封装,零内联业务;每动词一条
// 白名单通道(channels.ts),未注册通道由 Electron 拒绝,注册通道由
// assertWindowSender 拒绝(ERR_IPC_SENDER_REJECTED log + plain reject,
// M1 惯例)。
//
// 错误封装:WindowManagementError(ERR_WINDOW_NOT_FOUND /
// ERR_WINDOW_OPEN_FAILED)→ WindowIpcError(message = JSON 序列化
// `{ code, message, detail? }`,渲染层可直接 parse —— workbench 面同款
// 形态);形状契约错 = 调用方契约错,plain Error 直抛不进封装路径。

import { shellLog } from '../log.ts'
import { SHELL_APP_ORIGIN } from '../protocol/constants.ts'
import { WINDOW_VERB_CHANNELS, type WindowVerbChannel } from './channels.ts'
import type { OpenDetachedInput } from './detached.ts'
import type { RegistryWebContents } from './registry.ts'
import type { WindowRole } from './role.ts'

/** 域错误沿动词面的 reject 形态(message 即封装 JSON,渲染层 parse 回对象)。 */
export class WindowIpcError extends Error {
  constructor(readonly envelope: { code: string; message: string; detail?: string }) {
    super(JSON.stringify(envelope))
    this.name = 'WindowIpcError'
  }
}

/** 最小事件形状(Electron IpcMainInvokeEvent 子集,测试注入假体)。 */
export interface WindowVerbEvent {
  readonly senderFrame?: { readonly url: string } | undefined
  /** windowGetRole 的身份键(该动词独有;其余动词不消费)。 */
  readonly sender?: RegistryWebContents | undefined
}

/** ipcMain.handle seam(Electron ipcMain in production;假登记器在测试)。 */
export type WindowHandleRegistrar = (
  channel: WindowVerbChannel,
  listener: (event: WindowVerbEvent, ...args: unknown[]) => unknown,
) => void

/**
 * Sender frame validation shared by every window verb handler. Rejects (throw)
 * AND logs any frame that is not the dsh-app://app/ main document —— 主窗与
 * detached 窗同源,同一条规则即覆盖两窗(M1 assertVerbSender 同款纪律)。
 */
export function assertWindowSender(channel: WindowVerbChannel, event: WindowVerbEvent): void {
  const frameUrl = event.senderFrame?.url ?? ''
  if (!frameUrl.startsWith(`${SHELL_APP_ORIGIN}/`)) {
    shellLog.error({
      code: 'ERR_IPC_SENDER_REJECTED',
      message: 'rejected window verb IPC from an unowned frame',
      data: { channel, frameUrl },
    })
    throw new Error(`dsh-forge: rejected ${channel} IPC from an unowned frame`)
  }
}

/** 窗口动词服务面(生产 = detached manager + role 解析;测试注入观测)。 */
export interface WindowVerbServices {
  readonly openDetached: (input: OpenDetachedInput) => { windowId: string }
  readonly getRole: (sender: RegistryWebContents | undefined) => WindowRole | null
  readonly recall: (windowId: string) => void
}

const DOMAIN_CODE_PATTERN = /^ERR_[A-Z0-9_]+$/

/**
 * 错误映射(workbench toWorkbenchIpcError 同款纪律):①携带合法 `ERR_*`
 * code 的域错误(WindowManagementError 及等价形态)→ 同码封装
 * `{ code, message, detail? }`;②未知异常 → ERR_WINDOW_OPEN_FAILED 兜底
 * 封装 + log(tech-design §Error Handling「窗口面」口径:开窗失败 toast/log)。
 */
function toWindowIpcError(error: unknown, verb: string): WindowIpcError {
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (error instanceof Error && typeof code === 'string' && DOMAIN_CODE_PATTERN.test(code)) {
    const detail = (error as { detail?: unknown } | null | undefined)?.detail
    return typeof detail === 'string' && detail !== ''
      ? new WindowIpcError({ code, message: error.message, detail })
      : new WindowIpcError({ code, message: error.message })
  }
  const summary = error instanceof Error ? error.message : String(error)
  shellLog.error({
    code: 'ERR_WINDOW_OPEN_FAILED',
    message: `window verb ${verb} failed with an unclassified error`,
    data: { verb, detail: summary },
  })
  return new WindowIpcError({
    code: 'ERR_WINDOW_OPEN_FAILED',
    message: `window verb ${verb} failed`,
    detail: summary,
  })
}

function requireObject(verb: string, arg: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`window.${verb}: ${arg} must be an object (got ${typeof value})`)
  }
  return value as Record<string, unknown>
}

function requireString(verb: string, arg: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`window.${verb}: ${arg} must be a non-empty string (got ${typeof value})`)
  }
  return value
}

/** SessionTarget 浅校验(恰一形态:sessionId | (parent,child,mode) 三元组)。 */
function optionalTarget(verb: string, value: unknown): OpenDetachedInput['target'] {
  if (value === undefined || value === null) return undefined
  const target = requireObject(verb, 'input.target', value)
  const hasSessionId = target.sessionId !== undefined
  const hasTriple = target.parentSessionId !== undefined || target.childSessionId !== undefined || target.mode !== undefined
  if (hasSessionId === hasTriple) {
    throw new Error(`window.${verb}: input.target must be { sessionId } or { parentSessionId, childSessionId, mode } (exactly one shape)`)
  }
  if (hasSessionId) return { sessionId: requireString(verb, 'input.target.sessionId', target.sessionId) }
  const mode = requireString(verb, 'input.target.mode', target.mode)
  if (mode !== 'one-shot' && mode !== 'continuable') {
    throw new Error(`window.${verb}: input.target.mode must be one of one-shot/continuable (got ${mode})`)
  }
  return {
    parentSessionId: requireString(verb, 'input.target.parentSessionId', target.parentSessionId),
    childSessionId: requireString(verb, 'input.target.childSessionId', target.childSessionId),
    mode,
  }
}

/** rect 浅校验(四元有限正数)。 */
function optionalRect(verb: string, value: unknown): OpenDetachedInput['rect'] {
  if (value === undefined || value === null) return undefined
  const rect = requireObject(verb, 'input.rect', value)
  const num = (key: 'x' | 'y' | 'width' | 'height'): number => {
    const raw = rect[key]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new Error(`window.${verb}: input.rect.${key} must be a finite number (got ${typeof raw})`)
    }
    return raw
  }
  const width = num('width')
  const height = num('height')
  if (width <= 0 || height <= 0) {
    throw new Error(`window.${verb}: input.rect width/height must be positive (got ${String(width)}x${String(height)})`)
  }
  return { x: num('x'), y: num('y'), width, height }
}

/** Register the three window verbs on exactly one whitelisted channel each. */
export function installWindowVerbs(handle: WindowHandleRegistrar, services: WindowVerbServices): void {
  const register = (
    channel: WindowVerbChannel,
    run: (event: WindowVerbEvent, args: readonly unknown[]) => unknown,
  ): void => {
    handle(channel, (event, ...args) => {
      assertWindowSender(channel, event)
      try {
        return run(event, args)
      } catch (error) {
        throw toWindowIpcError(error, channel)
      }
    })
  }

  const C = WINDOW_VERB_CHANNELS

  register(C.openDetached, (_event, args) => {
    const input = requireObject('openDetached', 'input', args[0])
    const projectId = requireString('openDetached', 'input.projectId', input.projectId)
    const view = requireString('openDetached', 'input.view', input.view)
    if (view !== 'board' && view !== 'conversation') {
      throw new Error(`window.openDetached: input.view must be one of board/conversation (got ${view})`)
    }
    const target = optionalTarget('openDetached', input.target)
    const rect = optionalRect('openDetached', input.rect)
    return services.openDetached({
      projectId,
      view,
      ...(target === undefined ? {} : { target }),
      ...(rect === undefined ? {} : { rect }),
    })
  })

  // 身份键 = event.sender(webContents);sender 缺席(异常装配)→ null,
  // 渲染层按主窗语义兜底(role.ts 口径)。
  register(C.getRole, event => services.getRole(event.sender))

  register(C.recall, (_event, args) => {
    const input = requireObject('recall', 'input', args[0])
    return services.recall(requireString('recall', 'input.windowId', input.windowId))
  })
}
