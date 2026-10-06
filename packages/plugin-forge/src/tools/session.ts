// 会话上下文解析与 cwd 路由（定位：业务——Interface 8「exec ctx 解析 cwd→projectId
// 与 sessionId」的执行面；knowledge session.ts 同型平移，差异在失败口径：
// 未命中 = typed ERR_WORKSPACE_NOT_REGISTERED（错误码锚 contracts ERROR_CODES），
// 而非 knowledge 的可回落检索文案——forge 动词无回落原语，无路由即拒）。
// 两步：
//   ① exec → { sessionId, cwd }：官方 dsh-tool-fs sessionCwd 同型（会话头承载
//      工作区根），sessionId = claim/submit 的执行会话键（records.session_id /
//      links 写源；无 agent 上下文 = 空串）。
//   ② cwd → projectId：绑定表解析（cwd 数据缝 = bindingsFile 机制——host 维护
//      {wsPath,projectId} JSON，boot overlay 注入插件行 config，注册后增量刷新；
//      生产端 3.4）。Interface 1/3 服务面不含路径反查、Hard Rule 禁 core 实现
//      import——绑定数据经插件 config 进入，插件不触 core 实现。
// bindingsFile 在 tool 执行点惰性读取（fail-soft：读失败按无该源处理），文件条目
// 优先于静态表（装配方最新事实）；无 watch 无缓存直投（逐写逐读）。
// 归一口径收编 @dsh-forge/path-key 单一来源（fix-30：与 core 注册链同源——同一
// 变体拼写在 core 命中既有行 ⟺ 在此命中绑定行）。
import { readFileSync } from 'node:fs'
import { normalizeFsPath } from '@dsh-forge/path-key'
import type { ToolExecFace } from '../faces.js'

/** 会话上下文（tool 执行点可解析的全部会话身份） */
export interface ToolSessionContext {
  /** dsh 会话 id（claim = 派发会话 / submit = 执行会话；无 agent 上下文 = 空串） */
  readonly sessionId: string
  /** 会话工作区根（官方 session.header.cwd）；非 agent 调用无此值 */
  readonly cwd: string | undefined
}

/** 会话 cwd → projectId 绑定行（插件 config.projects 表项；bindingsFile 行同形） */
export interface ProjectBinding {
  /** 工作区 canonical path（projects.ws_path 同口径） */
  readonly wsPath: string
  /** 应用生成 project uuid（projects.id） */
  readonly projectId: string
}

/** cwd → projectId 解析器 */
export type ProjectIdResolver = (cwd: string) => string | undefined

/** ERR_WORKSPACE_NOT_REGISTERED 附载（tool 面 cwd 无匹配项目——cwd 缺席/不匹配两形） */
export interface WorkspaceNotRegisteredData {
  /** 会话 cwd（无 agent 会话上下文时缺省） */
  readonly cwd?: string
}

/**
 * tool 面 cwd 无匹配项目（tech-design §Error Handling 表 400 行）。
 * code 字面量锚定 @dsh-forge/contracts ERROR_CODES；类定义落位插件侧
 * （contracts 不持运行期名映射；插件禁 import core——core 侧无同名类，跨面以 code 判别）。
 */
export class WorkspaceNotRegisteredError extends Error {
  readonly code = 'ERR_WORKSPACE_NOT_REGISTERED' as const
  readonly data: WorkspaceNotRegisteredData

  constructor(data: WorkspaceNotRegisteredData) {
    super(
      data.cwd === undefined
        ? 'forge tools: no session workspace in this call context — the forge project cannot be located'
        : `forge tools: workspace ${data.cwd} is not bound to a registered project`,
    )
    this.name = 'WorkspaceNotRegisteredError'
    this.data = data
  }
}

/** 运行期判别（code 承载——跨 IPC / 序列化附载后仍可识别） */
export function isWorkspaceNotRegisteredError(e: unknown): e is WorkspaceNotRegisteredError {
  return (
    typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'ERR_WORKSPACE_NOT_REGISTERED'
  )
}

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

/**
 * 会话 → projectId（六 tool 共用路由口）。
 * cwd 缺席或绑定表未命中 → WorkspaceNotRegisteredError（ERR_WORKSPACE_NOT_REGISTERED）。
 */
export function requireProjectId(resolver: ProjectIdResolver, session: ToolSessionContext): string {
  if (session.cwd === undefined) throw new WorkspaceNotRegisteredError({})
  const projectId = resolver(session.cwd)
  if (projectId === undefined) throw new WorkspaceNotRegisteredError({ cwd: session.cwd })
  return projectId
}

/**
 * 会话 → 执行会话 id（claim/submit 写源键——links upsert 与 records.session_id）。
 * 无 agent 会话（空串）→ 拒：空会话键会落不可归属的 link/record 行（防御收窄）。
 */
export function requireSessionId(session: ToolSessionContext): string {
  if (session.sessionId === '') {
    throw new Error('forge tools: no agent session in this call context — claim/submit record the executing session id')
  }
  return session.sessionId
}
