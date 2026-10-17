// @dsh-forge/git-worktree —— 会话绑定面：挂靠事件写入 + 读尾部反查 + 预铸挂靠会话。
// 写入配方依据（探针实测）：.forge/docs/probes/worktree-attach-event/probe-report.md §5——
//   Session.append() 无 ignorable 通道；唯一合法直写 = SessionHandle.append（原样接受完整事件对象，
//   仅校验 JSON 快照 + seq 连续性）。写入面不校验未知类型：漏写 ignorable:true 会把整条会话日志
//   永久毒化（open 即 SessionFormatUnsupportedError）。因此本模块是自定义事件唯一写入口：
//   信封构造收敛在模块内部（不导出），强制 ignorable:true、seq 自管理（先读 cursor 再追加）。
//   唯一写入时点 = 预铸（preseedWorktreeSession）——活会话写句柄被官方 agent loop 独占
//   （单写者铁律），建后补写在结构上不可行。
import { randomUUID } from 'node:crypto'
import { SESSION_FORMAT_VERSION, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionHandle } from '@deepseek-ai/dsh-session-persistence'
import { assertSessionCwdMatches } from './seal-guard.js'

/** 挂靠事件类型词表项（未知类型 + ignorable:true → 持久化读回 / surface 重放 / v3→v4 迁移均安全跳过） */
export const WORKTREE_ATTACH_EVENT_TYPE = 'forge/worktree-attach' as const

/** 官方词表扩展通道（merge-extensible）：仅补类型面——Session.append() 不因此成为 ignorable 通道 */
declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'forge/worktree-attach': WorktreeAttachData
  }
}

/** 挂靠事件载荷：会话绑定反查的数据源（JSON 可序列化） */
export interface WorktreeAttachData {
  /** 挂靠 worktree 绝对路径（canonical 口径） */
  readonly worktreePath: string
  /** 挂靠分支（一 worktree 一分支） */
  readonly branch: string
}

/** 落盘的挂靠事件（信封强制 ignorable:true） */
export interface WorktreeAttachEvent extends WorktreeAttachData {
  /** 事件在日志中的序号（自管理：存储 next-seq） */
  readonly seq: number
}

/** 会话读句柄工厂（host 装配层注入：`sessionPersistence.open(id, 'read')`） */
export interface SessionReadHandleFactory {
  openRead(sessionId: string): Promise<SessionHandle>
}

/**
 * 在调用方已持有的写句柄上落一条挂靠事件（append + flush；close 由调用方负责）。
 * 模块内部面——不导出（信封构造不外泄：调用方只能给「绑定语义」）。
 */
async function appendAttachEvent(
  handle: Pick<SessionHandle, 'read' | 'append' | 'flush'>,
  binding: WorktreeAttachData,
): Promise<WorktreeAttachEvent> {
  const worktreePath = requireNonEmpty(binding?.worktreePath, 'worktreePath')
  const branch = requireNonEmpty(binding?.branch, 'branch')
  const events = (await handle.read()).events
  const nextSeq = events.length > 0 ? events[events.length - 1]!.seq + 1 : 0
  const event = {
    type: WORKTREE_ATTACH_EVENT_TYPE,
    seq: SessionSeq(nextSeq),
    time: Date.now(),
    data: { worktreePath, branch },
    ignorable: true as const,
  }
  await handle.append([event])
  await handle.flush() // flush 才承诺落盘（探针 §5 配方）
  return { seq: nextSeq, worktreePath, branch }
}

/**
 * 挂靠事件 type 双形态识别：官方 v3→v4 迁移（dsh-session-format-v3-to-v4
 * lib/index.js:1304）把未知事件 type 改写为 `plugin:${type}`——迁移后的旧会话读回为
 * plugin:forge/worktree-attach，按字面读即绑定反查失效。双形态等价识别。
 */
export function isWorktreeAttachEventType(type: string): boolean {
  return type === WORKTREE_ATTACH_EVENT_TYPE || type === `plugin:${WORKTREE_ATTACH_EVENT_TYPE}`
}

/**
 * 读尾部挂靠事件（会话绑定反查）：从全会话事件中取最近一条 forge/worktree-attach。
 * 会话恢复路径对未知 + ignorable 事件安全跳过（不入 surface），但事件随日志保留，重读即得。
 */
export function latestAttachEvent(events: readonly SessionEvent[]): WorktreeAttachEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined || typeof event.type !== 'string' || !isWorktreeAttachEventType(event.type)) continue
    const data = event.data as Partial<WorktreeAttachData> | null
    if (typeof data?.worktreePath === 'string' && typeof data?.branch === 'string') {
      return { seq: event.seq, worktreePath: data.worktreePath, branch: data.branch }
    }
  }
  return null
}

/** 读尾部（读句柄面）：反查会话绑定的 worktree 与分支；无挂靠事件返回 null。
 *  守护面（cwd 强制）：读得绑定即校验 SessionHeader.cwd ≡ 绑定 worktreePath
 *  （归一比对，seal-guard.assertSessionCwdMatches）——不一致抛 SessionCwdMismatchError
 *  显式报错，不留「绑定 A 树、实际跑在 B 树」的静默漂移。 */
export async function readLatestAttach(
  sessionId: string,
  handles: SessionReadHandleFactory,
): Promise<Omit<WorktreeAttachEvent, 'seq'> | null> {
  const handle = await handles.openRead(sessionId)
  try {
    const found = latestAttachEvent((await handle.read()).events)
    if (found !== null) {
      // SessionHandle.header（官方只读头，固定于 create/open）——fake 替身可缺席（守护只对可判定面生效）
      const headerCwd = (handle as { header?: { cwd?: string } }).header?.cwd
      assertSessionCwdMatches(headerCwd, found.worktreePath)
    }
    return found ? { worktreePath: found.worktreePath, branch: found.branch } : null
  } finally {
    await handle.close()
  }
}

function requireNonEmpty(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`forge/worktree-attach: ${field} 必须为非空字符串`)
  }
  return value
}

/** 预铸面（persistence.create 切片——header 契约：JSON 可序列化 + createdAt 非负安全整数 + version 当前格式版） */
export interface SessionPersistenceCreateFace {
  create(header: {
    readonly id: string
    readonly createdAt: number
    readonly cwd: string
    readonly version: number
    readonly isSeeded: boolean
    /** 官方 SessionHeader.agentPreset（可选）——缺席 = 官方 composeAgent 同径缺失时的零猜测 */
    readonly agentPreset?: string
  }): Promise<SessionHandle>
}

/** 预铸结果：自铸会话 id + 落盘挂靠事件 */
export interface WorktreePreseedResult {
  readonly sessionId: string
  readonly seq: number
  readonly worktreePath: string
  readonly branch: string
}

/** 预铸选项（id 铸造器默认 randomUUID——测试钉固定 id；agentPreset 缺席 = 头缺席零猜测） */
export interface WorktreePreseedOptions {
  readonly mintId?: () => string
  readonly agentPreset?: string
}

/**
 * 预铸挂靠会话（预铸采纳配方的预铸半程）：mint session-<uuid> → persistence.create
 * （cwd 头 = SessionHeader.cwd 定死，官方 adopt 校验 header.cwd 相等）→ 初始写句柄落
 * 挂靠事件（seq 0, ignorable:true）→ flush + close。写句柄即开即闭、零交叠——调用方随后
 * controller.create({sessionId, cwd}) 走官方 adopt/resume，单写者铁律满足。
 * agentPreset 随头定死（官方 composeAgent 经 meta.agentPreset 注入，registry defaultId
 * 兜底——预铸旁路该链必须自携，SessionHeader.agentPreset 是模式标签的唯一只读源）。
 */
export async function preseedWorktreeSession(
  persistence: SessionPersistenceCreateFace,
  binding: WorktreeAttachData,
  options: WorktreePreseedOptions = {},
): Promise<WorktreePreseedResult> {
  const worktreePath = requireNonEmpty(binding?.worktreePath, 'worktreePath')
  const branch = requireNonEmpty(binding?.branch, 'branch')
  const sessionId = options.mintId?.() ?? `session-${randomUUID()}`
  const handle = await persistence.create({
    id: sessionId,
    createdAt: Date.now(),
    cwd: worktreePath,
    version: SESSION_FORMAT_VERSION, // 读取侧 assertVersion 门槛
    isSeeded: false, // v4 header 必填（探针 run2 实测缺拒）
    ...(options.agentPreset === undefined ? {} : { agentPreset: options.agentPreset }),
  })
  try {
    const event = await appendAttachEvent(handle, { worktreePath, branch })
    return { sessionId, ...event }
  } finally {
    await handle.close()
  }
}
