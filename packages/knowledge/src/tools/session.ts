// 会话上下文解析（定位：业务——Interface 3「projectId 由会话上下文解析」的执行面）。
// 两步：
//   ① exec → { sessionId, cwd }：官方 dsh-tool-fs sessionCwd 同型（会话头承载
//      工作区根），sessionId 缺省空串 = 无会话上下文（contracts SearchQuery 注释口径）。
//   ② cwd → projectId：绑定表解析（装配期 config 供给）。Interface 2 七法不含
//      路径反查、Hard Rule 禁第二 core 服务——绑定数据经插件 config 进入（P1 装配缝，
//      DF003「调用缝为设计期定缝项」），插件不触 core 实现。
import type { ToolExecFace } from './faces.js'

/** 会话上下文（tool 执行点可解析的全部会话身份） */
export interface ToolSessionContext {
  /** dsh 会话 id（recall_logs 分组键；无 agent 上下文 = 空串，不进任何会话 tab） */
  readonly sessionId: string
  /** 会话工作区根（官方 session.header.cwd）；非 agent 调用无此值 */
  readonly cwd: string | undefined
}

/** 会话 cwd → projectId 绑定行（插件 config.projects 表项） */
export interface ProjectBinding {
  /** 工作区 canonical path（projects.ws_path 同口径） */
  readonly wsPath: string
  /** 应用生成 project uuid（projects.id） */
  readonly projectId: string
}

/** cwd → projectId 解析器 */
export type ProjectIdResolver = (cwd: string) => string | undefined

/** 路径归一（比对用）：反斜杠 → 正斜杠、去尾分隔符；win32 大小写不敏感 */
function normalizePath(p: string): string {
  const slashed = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const platform = (globalThis as { process?: { platform?: string } }).process?.platform
  return platform === 'win32' ? slashed.toLowerCase() : slashed
}

/**
 * 绑定表 → 解析器。语义：归一后整串相等（会话 cwd = 工作区根，非前缀匹配）；
 * 无绑定/不匹配 → undefined（调用方决定失败口径）。
 */
export function createProjectResolver(bindings: readonly ProjectBinding[]): ProjectIdResolver {
  const table = new Map<string, string>()
  for (const b of bindings) table.set(normalizePath(b.wsPath), b.projectId)
  return (cwd: string) => table.get(normalizePath(cwd))
}

/** exec → 会话上下文（无 agent / 无 session → sessionId 空串 + cwd undefined） */
export function sessionContextOf(exec: ToolExecFace): ToolSessionContext {
  const session = exec.agent?.session
  if (session === undefined) return { sessionId: '', cwd: undefined }
  // 官方读取位 header.cwd；顶层 cwd 为结构兼容位（真实现不携带）
  const cwd = session.header?.cwd ?? session.cwd
  return { sessionId: session.id, cwd }
}

/** 会话未绑定项目的统一失败信息（agent 可读——回落常规检索原语的触发口径） */
export function unboundSessionError(session: ToolSessionContext): Error {
  return new Error(
    session.cwd === undefined
      ? 'knowledge tools: no session workspace in this call context — the knowledge base cannot be located'
      : `knowledge tools: workspace ${session.cwd} is not bound to a registered project`,
  )
}
