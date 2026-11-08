// 会话上下文解析与绑定表（定位：业务——Interface 3「projectId 由会话上下文解析」执行面）。
// 两步：
//   ① exec → { sessionId, cwd, turnSeq?, triggerText? }：官方 dsh-tool-fs sessionCwd 同型
//     （会话头承载工作区根），sessionId 缺省空串 = 无会话上下文（contracts SearchQuery 注释
//     口径）；turnSeq/triggerText 为会话归因派生（roundtable2 B2 终裁——官方核销卷
//     proposals/knowledge-stage4-recall-scope/review/session-events-verification.md）：
//     sessionContextOf 唯一派生点，每调用期现派生零缓存（事件日志是活流式状态，memoize
//     供 stale turn），fail-soft 双 NULL + warn diag（bug 0520cbaf——禁静默吞）；
//     web/RPC 径无 session 恒双 NULL（正常降级，零 warn）。
//   ② cwd → projectId：绑定表解析（装配期 config 静态供给）。用户裁决 Q19（2026-11-19）：
//      bindingsFile 绑定表文件与刷新缝退役——projectId→wsPath 映射改纯 config 静态注入
//     （本文件静态表为唯一数据源，无文件读取、无运行期刷新）。
// 两级解析（projectId→wsPath→注册行）第一级 = createWsPathResolver（同表反向）；
// 第二级 = storage/registry.ts findByWsPath（canonical 键）。
import { normalizeFsPath } from '@dsh-forge/path-key'
import { KNOWLEDGE_DERIVE_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from '../storage/diag.js'
import type { SessionEventFace, ToolExecFace, ToolSessionEventsFace } from './faces.js'

/** 会话上下文（tool 执行点可解析的全部会话身份） */
export interface ToolSessionContext {
  /** dsh 会话 id（recall_logs 分组键；无 agent 上下文 = 空串，不进任何会话 tab） */
  readonly sessionId: string
  /** 会话工作区根（官方 session.header.cwd）；非 agent 调用无此值 */
  readonly cwd: string | undefined
  /** 最近 turn/start 的 turn 序（派生失败/events 缺席 = 键缺席——禁显式 undefined，bug 7db97a7c） */
  readonly turnSeq?: number
  /** 本轮 queued message 文本（source.kind === 'user'——inject/goal 等合成上下文排除） */
  readonly triggerText?: string
}

/** 会话 cwd → projectId 绑定行（插件 config.projects 表项——纯静态注入） */
export interface ProjectBinding {
  /** 工作区 canonical path（自持注册表 ws_path 键同口径） */
  readonly wsPath: string
  /** 应用生成 project uuid（projects.id） */
  readonly projectId: string
}

/** cwd → projectId 解析器 */
export type ProjectIdResolver = (cwd: string) => string | undefined

/** projectId → wsPath 解析器（两级解析第一级） */
export type WsPathResolver = (projectId: string) => string | undefined

/**
 * 绑定表 → cwd 解析器。语义：归一后整串相等（会话 cwd = 工作区根，非前缀匹配）；
 * 无绑定/不匹配 → undefined（调用方决定失败口径）。纯内存表（Q19：绑定表文件退役）。
 */
export function createProjectResolver(bindings: readonly ProjectBinding[]): ProjectIdResolver {
  const table = new Map<string, string>()
  for (const b of bindings) table.set(normalizeFsPath(b.wsPath), b.projectId)
  return (cwd: string) => table.get(normalizeFsPath(cwd))
}

/**
 * 绑定表 → projectId 反查解析器（服务面两级解析第一级：projectId → wsPath）。
 * 未命中 → undefined（服务面 requireProject fail-loud 收口）。
 */
export function createWsPathResolver(bindings: readonly ProjectBinding[]): WsPathResolver {
  const table = new Map<string, string>()
  for (const b of bindings) table.set(b.projectId, b.wsPath)
  return (projectId: string) => table.get(projectId)
}

/** content 块数组 → 文本（type 'text' 块按序拼接；无文本块 = undefined） */
function textOfContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const parts = content
    .filter((b): b is { type: 'text'; text: string } => {
      const o = b as Record<string, unknown> | null
      return typeof o === 'object' && o !== null && o['type'] === 'text' && typeof o['text'] === 'string'
    })
    .map((b) => b.text)
  const joined = parts.join('\n')
  return joined === '' ? undefined : joined
}

/**
 * 会话归因派生（纯函数——sessionContextOf 唯一消费点）：
 * ① 倒序找最近一条 turn/start → turnSeq = data.turn；
 * ② 自锚向后扫，首个 source.kind === 'user' 的 user/message → triggerText（queued
 *    message 原文；inject/goal 等合成上下文按 source kind 排除；遇下一条 turn/start
 *    防御性止扫）；产物键缺席式（无显式 undefined）。
 */
export function deriveTurnContext(events: readonly SessionEventFace[]): { turnSeq?: number; triggerText?: string } {
  let anchor = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]!.type === 'turn/start') {
      anchor = i
      break
    }
  }
  if (anchor === -1) return {}
  const turnData = events[anchor]!.data as { turn?: unknown } | null
  const turnSeq = typeof turnData === 'object' && turnData !== null && typeof turnData.turn === 'number' ? turnData.turn : undefined
  for (let i = anchor + 1; i < events.length; i += 1) {
    const ev = events[i]!
    if (ev.type === 'turn/start') break
    if (ev.type !== 'user/message') continue
    const d = ev.data as { source?: { kind?: unknown }; content?: unknown } | null
    if (typeof d !== 'object' || d === null || d.source?.kind !== 'user') continue
    const triggerText = textOfContent(d.content)
    return { ...(turnSeq !== undefined ? { turnSeq } : {}), ...(triggerText !== undefined ? { triggerText } : {}) }
  }
  return turnSeq !== undefined ? { turnSeq } : {}
}

/**
 * exec → 会话上下文（无 agent / 无 session → sessionId 空串 + cwd undefined + 派生缺席）。
 * 有 session 而 events 缺席/派生抛 → 双 NULL + warn diag（fail-soft 不静默——bug 0520cbaf；
 * 不阻断召回主链）。emit 缺席时经 emitStorageDiag console 兜底，同禁静默。
 */
export function sessionContextOf(exec: ToolExecFace, emit?: DiagEmitter): ToolSessionContext {
  const session = exec.agent?.session
  if (session === undefined) return { sessionId: '', cwd: undefined }
  // 官方读取位 header.cwd；顶层 cwd 为结构兼容位（真实现不携带）
  const cwd = session.header?.cwd ?? session.cwd
  // 事件日志取数缝（bug 派生缝缺失——真机双 NULL 根因）：官方 Session 的同步读位是
  // session.snapshotEvents() 方法直挂（eventsSnapshot private，无 events 属性）——
  // events 子面缺席时回落 session.snapshotEvents 结构兼容位；两者皆缺席才降级双 NULL。
  const eventsFace =
    session.events ??
    (typeof (session as { snapshotEvents?: unknown }).snapshotEvents === 'function'
      ? { snapshotEvents: (session as { snapshotEvents: ToolSessionEventsFace['snapshotEvents'] }).snapshotEvents.bind(session) }
      : undefined)
  if (eventsFace === undefined) {
    emitStorageDiag(
      emit,
      storageDiag('warn', KNOWLEDGE_DERIVE_EVENT, `会话归因派生降级（双 NULL）：events 子面缺席（session ${session.id}）`),
    )
    return { sessionId: session.id, cwd }
  }
  try {
    return { sessionId: session.id, cwd, ...deriveTurnContext(eventsFace.snapshotEvents()) }
  } catch (cause) {
    emitStorageDiag(
      emit,
      storageDiag('warn', KNOWLEDGE_DERIVE_EVENT, `会话归因派生失败（双 NULL fail-soft，召回主链不受阻）：${String(cause)}`),
    )
    return { sessionId: session.id, cwd }
  }
}

/** 会话未绑定项目的统一失败信息（agent 可读——回落常规检索原语的触发口径） */
export function unboundSessionError(session: ToolSessionContext): Error {
  return new Error(
    session.cwd === undefined
      ? 'knowledge tools: no session workspace in this call context — the knowledge base cannot be located'
      : `knowledge tools: workspace ${session.cwd} is not bound to a registered project`,
  )
}
