// @dsh-forge/git-worktree —— 会话绑定面：挂靠事件唯一写入口 + 读尾部反查 + 建会话 meta.cwd 注入。
// 写入配方依据（探针实测）：.forge/docs/probes/worktree-attach-event/probe-report.md §5——
//   Session.append() 无 ignorable 通道；唯一合法直写 = SessionHandle.append（原样接受完整事件对象，
//   仅校验 JSON 快照 + seq 连续性）。写入面不校验未知类型：漏写 ignorable:true 会把整条会话日志
//   永久毒化（open 即 SessionFormatUnsupportedError）。因此本模块是自定义事件唯一写入口：
//   信封构造收敛在模块内部，强制 ignorable:true、seq 自管理（先读 cursor 再追加），
//   不导出任何通用 append / 信封构造器（封装面由 session-attach.test.ts 锁定）。
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionHandle } from '@deepseek-ai/dsh-session-persistence'

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

/** 会话写句柄工厂（host 装配层注入：`sessionPersistence.open(id, 'write')`） */
export interface SessionWriteHandleFactory {
  openWrite(sessionId: string): Promise<SessionHandle>
}

/** 会话读句柄工厂（host 装配层注入：`sessionPersistence.open(id, 'read')`） */
export interface SessionReadHandleFactory {
  openRead(sessionId: string): Promise<SessionHandle>
}

/** 挂靠事件唯一写入口 */
export interface WorktreeAttachWriter {
  /** 为会话写入一条挂靠事件（append + flush 落盘；句柄即开即闭） */
  attach(sessionId: string, binding: WorktreeAttachData): Promise<WorktreeAttachEvent>
}

/**
 * 唯一写入口封装：信封构造不外泄——调用方只能给「绑定语义」，写不出任意自定义事件。
 * seq 自管理：先读全量取 cursor，next-seq = 末事件 seq + 1（两步间不得有其他写入者，写句柄单写者语义）。
 */
export function createWorktreeAttachWriter(handles: SessionWriteHandleFactory): WorktreeAttachWriter {
  return {
    async attach(sessionId: string, binding: WorktreeAttachData): Promise<WorktreeAttachEvent> {
      const worktreePath = requireNonEmpty(binding?.worktreePath, 'worktreePath')
      const branch = requireNonEmpty(binding?.branch, 'branch')
      const handle = await handles.openWrite(sessionId)
      try {
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
      } finally {
        await handle.close()
      }
    },
  }
}

/**
 * 读尾部挂靠事件（会话绑定反查）：从全会话事件中取最近一条 forge/worktree-attach。
 * 会话恢复路径对未知 + ignorable 事件安全跳过（不入 surface），但事件随日志保留，重读即得。
 */
export function latestAttachEvent(events: readonly SessionEvent[]): WorktreeAttachEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type !== WORKTREE_ATTACH_EVENT_TYPE) continue
    const data = event.data as Partial<WorktreeAttachData> | null
    if (typeof data?.worktreePath === 'string' && typeof data?.branch === 'string') {
      return { seq: event.seq, worktreePath: data.worktreePath, branch: data.branch }
    }
  }
  return null
}

/** 读尾部（读句柄面）：反查会话绑定的 worktree 与分支；无挂靠事件返回 null */
export async function readLatestAttach(
  sessionId: string,
  handles: SessionReadHandleFactory,
): Promise<Omit<WorktreeAttachEvent, 'seq'> | null> {
  const handle = await handles.openRead(sessionId)
  try {
    const found = latestAttachEvent((await handle.read()).events)
    return found ? { worktreePath: found.worktreePath, branch: found.branch } : null
  } finally {
    await handle.close()
  }
}

/** 建会话选项的最小结构面（对齐官方 CreateSessionOptions.meta） */
interface SessionCreateMeta {
  readonly meta?: { readonly cwd?: string }
}

/**
 * 建会话 meta.cwd 注入：把所选 worktree 路径折入 CreateSessionOptions.meta.cwd
 * （SessionHeader.cwd 生效、不可变——挂靠即绑定，cwd 建会话时定死）。
 */
export function withWorktreeCwd<O extends SessionCreateMeta>(options: O, worktreePath: string): O {
  requireNonEmpty(worktreePath, 'worktreePath')
  return { ...options, meta: { ...options.meta, cwd: worktreePath } }
}

function requireNonEmpty(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`forge/worktree-attach: ${field} 必须为非空字符串`)
  }
  return value
}
