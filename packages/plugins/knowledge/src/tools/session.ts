// 会话上下文解析（定位：业务——Interface 3「projectId 由会话上下文解析」的执行面）。
// 两步：
//   ① exec → { sessionId, cwd }：官方 dsh-tool-fs sessionCwd 同型（会话头承载
//      工作区根），sessionId 缺省空串 = 无会话上下文（contracts SearchQuery 注释口径）。
//   ② cwd → projectId：绑定表解析（装配期 config 供给）。Interface 2 七法不含
//      路径反查、Hard Rule 禁第二 core 服务——绑定数据经插件 config 进入（P1 装配缝，
//      DF003「调用缝为设计期定缝项」），插件不触 core 实现。
// 4.2 动态面：projectId 是运行期注册产物（randomUUID）——静态 config.projects 之外，
// bindingsFile（host 装配方维护的绑定表文件，boot/注册后全量刷新）在 tool 执行点
// 惰性读取（fail-soft：读失败按无该源处理），文件条目优先于静态表（装配方最新事实）。
// 无 watch 无缓存直投——SC2 纪律域为 UI 状态副本，本缝是装配配置数据逐写逐读。
import { readFileSync } from 'node:fs'
// fix-30：比对归一口径收编 @dsh-forge/path-key 单一来源（core 注册链同源消费——
// 同一变体拼写在 core 命中既有行 ⟺ 在此命中绑定行，消「同源数据两种归一口径」分裂）
import { normalizeFsPath } from '@dsh-forge/path-key'
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

/** 路径归一（比对用）：@dsh-forge/path-key 同源（fix-30 前本文件私有的 normalizePath 收编单一来源） */

/**
 * 绑定表 → 解析器。语义：归一后整串相等（会话 cwd = 工作区根，非前缀匹配）；
 * 无绑定/不匹配 → undefined（调用方决定失败口径）。
 * bindingsFile 在场时执行点惰性读取（文件条目优先；读/解析失败按无该源降级不抛）。
 */
export function createProjectResolver(
  bindings: readonly ProjectBinding[],
  bindingsFile?: string,
): ProjectIdResolver {
  const table = new Map<string, string>()
  for (const b of bindings) table.set(normalizeFsPath(b.wsPath), b.projectId)
  if (bindingsFile === undefined) {
    return (cwd: string) => table.get(normalizeFsPath(cwd))
  }
  return (cwd: string) => readBindingsFile(bindingsFile).get(normalizeFsPath(cwd)) ?? table.get(normalizeFsPath(cwd))
}

/** 绑定表文件单次读取（fail-soft：任何失败返回空表——调用回落静态表） */
function readBindingsFile(file: string): Map<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      version?: unknown
      projects?: unknown
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) return new Map()
    const table = new Map<string, string>()
    for (const row of parsed.projects) {
      if (typeof row !== 'object' || row === null) continue
      const { wsPath, projectId } = row as { wsPath?: unknown; projectId?: unknown }
      if (typeof wsPath === 'string' && typeof projectId === 'string') {
        table.set(normalizeFsPath(wsPath), projectId)
      }
    }
    return table
  } catch {
    return new Map()
  }
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
