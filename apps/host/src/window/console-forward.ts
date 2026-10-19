// renderer console 转发（app-observability 1.2——方案 4 renderer 源半边）：main 侧
// webContents 'console-message' 官方事件 → warn/error 级过滤 → 同文重复行折叠计数
// （12③ 噪音治理——changes.summary 404 轮询不淹没日志）→ 诊断事件域 emit。
// Electron 44 新形事件对象（{level, message, lineNumber, sourceId}）与旧形位置参数
// （event, level:number, message:string）双形态归一（normalize）。
import type { DiagEventPayload } from '../telemetry/diag-events.js'
import { LineFolder } from '../telemetry/line-folder.js'

/** webContents console-message 订阅窄面（真 webContents 结构兼容——测试注入 fake） */
export interface ConsoleMessageFace {
  on(event: 'console-message', listener: (...args: unknown[]) => void): unknown
}

/** 归一化 console-message 行（双 Electron 形态 → {level, message}；级别判定不了 → undefined） */
export function normalizeConsoleMessage(args: readonly unknown[]): { level: 'warn' | 'error'; message: string } | undefined {
  const first = args[0] as Record<string, unknown> | undefined
  if (typeof first === 'object' && first !== null && typeof first['level'] === 'string') {
    const level = first['level']
    const message = first['message']
    // Electron 真机新形 level 枚举 = info|warning|error|debug（bug 84b5216a：'warning' 是
    // warn 的真机拼写——仅认 'warn' 令真机 warn 行全数丢弃、折叠组无异文收口行）
    const warnLevel = level === 'warn' || level === 'warning'
    if ((warnLevel || level === 'error') && typeof message === 'string') return { level: warnLevel ? 'warn' : 'error', message }
    return undefined
  }
  // 旧形：(event, level:number(1=info 2=warn 3=error), message:string, ...)
  const levelNum = args[1]
  const message = args[2]
  if (typeof levelNum === 'number' && typeof message === 'string') {
    if (levelNum === 2) return { level: 'warn', message }
    if (levelNum === 3) return { level: 'error', message }
  }
  return undefined
}

/**
 * 装配 renderer console 转发：warn/error 级行折叠后落诊断事件域（event='console'，
 * process='renderer'）。返回面 = { dispose, flush }——dispose 摘订阅，flush 收口折叠组
 * （退出前消费，防尾部重复计数丢行）。
 */
export function forwardRendererConsole(
  webContents: ConsoleMessageFace,
  emit: (payload: DiagEventPayload) => void,
  clock: () => number = Date.now,
): { dispose: () => void; flush: () => void } {
  const folder = new LineFolder({
    now: clock,
    flush: (line) => {
      emit({
        level: line.level,
        process: 'renderer',
        event: 'console',
        message: line.message,
        ...(line.repeat !== undefined ? { repeat: line.repeat } : {}),
      })
    },
  })
  const listener = (...args: unknown[]): void => {
    try {
      const normalized = normalizeConsoleMessage(args)
      if (normalized === undefined) return
      folder.push({
        timestamp: '',
        level: normalized.level,
        trace_id: '-',
        process: 'renderer',
        message: normalized.message,
        event: 'console',
      })
    } catch {
      // 转发链异常不反压 renderer（红线①同构）
    }
  }
  webContents.on('console-message', listener as never)
  return {
    dispose: () => {
      try {
        ;(webContents as unknown as { removeListener(event: string, listener: unknown): unknown }).removeListener(
          'console-message',
          listener,
        )
      } catch {
        // 摘订阅失败静默（装配面容错）
      }
    },
    flush: () => folder.flush(),
  }
}
