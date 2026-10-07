// 事件发射面（任务 3.4；tech-design Interface 3 + 图 5 节点 A/B）：tool 执行只经本 sink
// emit 事件（零日志代码纪律——落盘归监听器唯一写者）；sink 同时承载「事件 → 工作区」
// 映射闭包（3.3 装配方职责移交 3.4）：tool 执行点持有会话 cwd（官方 session.header.cwd），
// prepare 先行解析并按 sessionId 记忆容器库目录（{tasksHome}/{flatten}@{hash8}——经注入
// resolveDir 闭包调用 core deriveTaskStoreDir 单源，插件不复制派生逻辑）；监听器
// resolveContainerDir 经 dirOf 消费同一记忆。失败语义：解析失败/缺席 = 不记忆（监听器
// fail-soft 丢行——日志缺席不拖垮工具执行闭包）；emit 面零吞（bus 信封守卫 fail-loud）。
// 时间戳单源 Date.now()（信封 ts epoch 毫秒）。
import type { ForgePluginEvent } from '@dsh-forge/contracts'
import type { ForgeEventBus } from './bus.js'
import type { ForgeToolFailure } from '../tools/format.js'
import type { ToolSessionContext } from '../tools/session.js'

/** sink 依赖（bus = 3.3 装配单例；resolveDir = core deriveTaskStoreDir 包装闭包） */
export interface ForgeEventSinkDeps {
  readonly bus: ForgeEventBus
  /** cwd → 容器库目录（core 单源派生；异常/缺席 = undefined——fail-soft 不记忆） */
  resolveDir(workspaceDir: string): Promise<string | undefined>
}

/**
 * tool 面事件发射器（emit 直通总线 + 会话目录记忆）。
 * prepare 契约：每次 tool 执行的首个 emit 前 await（首调解析后记忆，后续 no-op）；
 * 同会话后续事件（含 worker 会话自身 emit——子会话继承父工作目录）命中记忆。
 */
export interface ForgeEventSink {
  /** 发射（bus 直通——信封守卫 fail-loud 由总线承担） */
  emit(event: ForgePluginEvent): void
  /** 记忆会话 → 容器库目录（幂等；cwd 缺席/解析失败 = 不记忆） */
  prepare(session: ToolSessionContext): Promise<void>
  /** 监听器消费面：sessionId → 容器库目录（未知 = undefined——fail-soft 丢行） */
  dirOf(sessionId: string): string | undefined
}

/** 建事件发射器（装配单例——与 bus 同生命周期） */
export function createForgeEventSink(deps: ForgeEventSinkDeps): ForgeEventSink {
  const dirs = new Map<string, string>()
  return {
    emit(event): void {
      deps.bus.emit(event)
    },
    async prepare(session): Promise<void> {
      if (session.sessionId === '' || session.cwd === undefined || dirs.has(session.sessionId)) return
      try {
        const dir = await deps.resolveDir(session.cwd)
        if (dir !== undefined && dir !== '') dirs.set(session.sessionId, dir)
      } catch {
        // fail-soft：目录解析失败仅丢该会话日志落位，不影响工具执行
      }
    },
    dirOf(sessionId): string | undefined {
      return dirs.get(sessionId)
    },
  }
}

/**
 * tool-error 事件发射（全 tool 面共用——callToolFace 捕获 typed 错误时经回调触达）。
 * sessionId 空串守卫：无 agent 会话上下文的调用不 emit（信封恒有 sessionId——bus 守卫
 * fail-loud 会拒绝空串；宁可零事件不可断工具）。sink 缺席（旧装配/单测桩）= 零事件降级。
 */
export function emitToolError(
  sink: ForgeEventSink | undefined,
  sessionId: string,
  slug: string,
  verb: string,
  failure: ForgeToolFailure,
): void {
  if (sink === undefined || sessionId === '' || slug === '') return
  sink.emit({
    ts: Date.now(),
    sessionId,
    slug,
    type: 'tool-error',
    payload: { verb, code: failure.code, message: failure.message },
  })
}

/** tool-error 归属 slug 的防御性提取（args 形状未定——typed 错误可能先于参数收窄） */
export function slugOfToolArgs(args: unknown): string {
  if (typeof args !== 'object' || args === null) return '_pool'
  const { slug, source_slug: sourceSlug } = args as { slug?: unknown; source_slug?: unknown }
  if (typeof slug === 'string' && slug !== '') return slug
  if (typeof sourceSlug === 'string' && sourceSlug !== '') return sourceSlug
  return '_pool'
}
