// 会话上下文解析与绑定表（定位：业务——Interface 3「projectId 由会话上下文解析」执行面）。
// 两步：
//   ① exec → { sessionId, cwd }：官方 dsh-tool-fs sessionCwd 同型（会话头承载
//      工作区根），sessionId 缺省空串 = 无会话上下文（contracts SearchQuery 注释口径）。
//   ② cwd → projectId：绑定表解析（装配期 config 静态供给）。用户裁决 Q19（2026-11-19）：
//      bindingsFile 绑定表文件与刷新缝退役——projectId→wsPath 映射改纯 config 静态注入
//     （本文件静态表为唯一数据源，无文件读取、无运行期刷新）。
// 两级解析（projectId→wsPath→注册行）第一级 = createWsPathResolver（同表反向）；
// 第二级 = storage/registry.ts findByWsPath（canonical 键）。
import { normalizeFsPath } from '@dsh-forge/path-key'
import type { ToolExecFace } from './faces.js'

/** 会话上下文（tool 执行点可解析的全部会话身份） */
export interface ToolSessionContext {
  /** dsh 会话 id（recall_logs 分组键；无 agent 上下文 = 空串，不进任何会话 tab） */
  readonly sessionId: string
  /** 会话工作区根（官方 session.header.cwd）；非 agent 调用无此值 */
  readonly cwd: string | undefined
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
