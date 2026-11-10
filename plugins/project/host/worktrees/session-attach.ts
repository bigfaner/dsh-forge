// @dsh-forge/git-worktree —— 会话绑定留痕面：forge/worktree-bind ignorable 事件（append + 读尾部 + 词表注册）。
// 机制依据（binding-derivation §2.2——绑定推导制留痕）：绑定事实 = header.cwd（推导即真），
// 留痕事件只携带 branch 漂移警示数据源（创建时刻快照），不承载归属。写入走官方
// Session.append 公开追加（进程内直调——官方先例 model/selection；wire 面无 append，
// host 进程是唯一写点），活会话写句柄归官方 agent loop 的单写者铁律不触及。
//
// ignorable 分类实现（#35 定罪修复同径）：Session.append 的信封构造无 ignorable 设置口，
// 而持久化读路径对「构建未知且无 ignorable 标记」的事件类型拒绝解读整本日志——因此激活
// 即向官方导出的 KNOWN_SESSION_EVENT_TYPES 运行期注册（公开 Set 追加，幂等，零 dsh 源码
// 修改）：本构建确实理解该类型（host append、读侧漂移校验双侧在场），注册即把事实告知
// 词汇表。非模型面边界不因注册改变（MESSAGE_PROJECTION_EVENT_TYPES 不含本类型）。
import { KNOWN_SESSION_EVENT_TYPES, type SessionEvent } from '@deepseek-ai/dsh-session'

/** 留痕事件类型词表键（SessionEventMap 合并键 = 读侧判别字面量，双侧同源） */
export const WORKTREE_BIND_EVENT_TYPE = 'forge/worktree-bind' as const

/** 官方词表扩展通道（merge-extensible，packages/plugin-forge/src/progress/index.ts 同款型法） */
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** forge worktree 绑定留痕（非模型面：不在 SurfaceEventType 集内，零回合唤醒）。 */
    'forge/worktree-bind': WorktreeBindData
  }
}

/** 留痕事件载荷：创建时刻快照（branch 漂移警示数据源——JSON 可序列化） */
export interface WorktreeBindData {
  /** 绑定 worktree 展示名（归属由 header.cwd 承载，展示名不参与判定） */
  readonly worktreeName: string
  /** 创建时刻分支快照（一 worktree 一分支） */
  readonly branch: string
}

/** 落盘的留痕事件（读侧反查结果） */
export interface WorktreeBindEvent extends WorktreeBindData {
  readonly seq: number
}

/** 官方活会话 append 消费窄面（Session 结构化切片——Session.append 进程内直调） */
export interface WorktreeBindAppendTarget {
  append(type: typeof WORKTREE_BIND_EVENT_TYPE, data: WorktreeBindData): unknown
}

/** 会话读句柄工厂（host 装配层注入：`sessionPersistence.open(id, 'read')`） */
export interface SessionReadHandleFactory {
  openRead(sessionId: string): Promise<{ read(): Promise<{ events: readonly SessionEvent[] }>; close(): Promise<void> }>
}

/**
 * 读侧词汇注册（幂等）：'forge/worktree-bind' 登入官方 KNOWN_SESSION_EVENT_TYPES——
 * append / 读侧首次消费前调用。官方类型刻意 ReadonlySet（first-party 目录禁手编纪律），
 * 运行时实为可变 Set——插件注册是就地追加语义（registerProgressEventVocabulary 先例）。
 */
export function registerWorktreeBindVocabulary(): void {
  ;(KNOWN_SESSION_EVENT_TYPES as Set<string>).add(WORKTREE_BIND_EVENT_TYPE)
}

/**
 * 在活会话上落一条 forge/worktree-bind 留痕（Session.append 进程内直调）。
 * 失败原样上抛——fail-soft 与诊断 emit 由调用方承担（AC：append 失败 fail-soft +
 * emitDiag('session-bind', warn)）。data 为创建时刻快照，事件不承载归属语义。
 */
export function appendWorktreeBind(target: WorktreeBindAppendTarget, data: WorktreeBindData): void {
  registerWorktreeBindVocabulary()
  const worktreeName = requireNonEmpty(data?.worktreeName, 'worktreeName')
  const branch = requireNonEmpty(data?.branch, 'branch')
  target.append(WORKTREE_BIND_EVENT_TYPE, { worktreeName, branch })
}

/**
 * 留痕事件 type 双形态识别：官方 v3→v4 迁移把构建未知事件 type 改写为 `plugin:${type}`
 * （dsh-session-format-v3-to-v4）——迁移后的旧会话读回为 plugin:forge/worktree-bind，
 * 按字面读即漂移警示失效。双形态等价识别。
 */
export function isWorktreeBindEventType(type: string): boolean {
  return type === WORKTREE_BIND_EVENT_TYPE || type === `plugin:${WORKTREE_BIND_EVENT_TYPE}`
}

/**
 * 读尾部留痕事件（branch 漂移警示数据源）：从全会话事件中取最近一条 forge/worktree-bind。
 * 会话恢复路径对未知 + ignorable 事件安全跳过（不入 surface），事件随日志保留，重读即得。
 */
export function latestWorktreeBindEvent(events: readonly SessionEvent[]): WorktreeBindEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined || typeof event.type !== 'string' || !isWorktreeBindEventType(event.type)) continue
    const data = event.data as Partial<WorktreeBindData> | null
    if (typeof data?.worktreeName === 'string' && typeof data?.branch === 'string') {
      return { seq: event.seq, worktreeName: data.worktreeName, branch: data.branch }
    }
  }
  return null
}

/** 读尾部（读句柄面）：反查会话留痕快照；无留痕返回 null（惰性补写的判定源）。 */
export async function readLatestWorktreeBind(
  sessionId: string,
  handles: SessionReadHandleFactory,
): Promise<Omit<WorktreeBindEvent, 'seq'> | null> {
  registerWorktreeBindVocabulary()
  const handle = await handles.openRead(sessionId)
  try {
    const found = latestWorktreeBindEvent((await handle.read()).events)
    return found ? { worktreeName: found.worktreeName, branch: found.branch } : null
  } finally {
    await handle.close()
  }
}

function requireNonEmpty(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`forge/worktree-bind: ${field} 必须为非空字符串`)
  }
  return value
}
