// 消息面事件折叠条目组节点数据面（定位：业务——loop-event-delivery 1.9；壳树自持纯模块）。
// 边界纪律（1.17 forge-progress-data 先例）：守卫归唯一 runtime 消费者（壳树视图），
// client 树零引用（定义面数据透传 unknown 不窄读）。
// 数据纪律：形状防御（client-plugin forgeEventGroupDefinition.buildViewNode data 窄收投影
// 镜像——仅投影视图所需字段，实态缺 turnId 等未投影位；他形不猜不抛，组件 null 收口零残留）。

/** 组内单条事件条目（client-plugin ForgeEventEntry 窄收投影镜像） */
export interface ForgeEventEntryData {
  readonly id: string
  readonly seq: number
  readonly time: number
  readonly badge: string
  readonly title: string
  readonly summary: string
  readonly text: string
}

/** 组块节点 data（buildViewNode data 窄收投影镜像） */
export interface ForgeEventGroupData {
  readonly key: string
  readonly firstSeq: number
  readonly lastSeq: number
  /** 最新组（组块默认展开；前组默认收起） */
  readonly isLatest: boolean
  readonly entries: readonly ForgeEventEntryData[]
  /** 组内 'forge/progress' 事件条目（1.2 循环进度卡数据源；旧缓存缺省） */
  readonly progress?: readonly ForgeProgressEntryData[]
}

/** 组内单条 'forge/progress' 事件条目（client-plugin ForgeProgressEntry 窄收投影镜像——实态含 turnId，此处不投影） */
export interface ForgeProgressEntryData {
  readonly seq: number
  readonly sourceSlug: string
  readonly status: string
  readonly verb: string
  readonly taskKey?: string
  readonly taskTitle?: string
  /** 执行专家键（claim 时点解析；旧缓存/未解析 = 缺省） */
  readonly expertKey?: string
  readonly scenario?: string
  readonly note?: string
  /** 处置 attempt 序号（triage 处置族专用——载荷字段镜像，缺席/畸形 = 缺省） */
  readonly attempt?: number
  readonly at: number
}

/** 条目守卫（逐位形状防御） */
function isForgeEventEntryData(value: unknown): value is ForgeEventEntryData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['id'] === 'string' &&
    typeof raw['seq'] === 'number' &&
    Number.isFinite(raw['seq']) &&
    typeof raw['time'] === 'number' &&
    Number.isFinite(raw['time']) &&
    typeof raw['badge'] === 'string' &&
    typeof raw['title'] === 'string' &&
    typeof raw['summary'] === 'string' &&
    typeof raw['text'] === 'string'
  )
}

/** 'forge/progress' 条目守卫（client-plugin progressEntryOf 窄收镜像——畸形弃行不抛） */
export function isForgeProgressEntryData(value: unknown): value is ForgeProgressEntryData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['seq'] === 'number' &&
    Number.isFinite(raw['seq']) &&
    typeof raw['sourceSlug'] === 'string' &&
    raw['sourceSlug'] !== '' &&
    typeof raw['status'] === 'string' &&
    typeof raw['verb'] === 'string' &&
    (raw['taskKey'] === undefined || typeof raw['taskKey'] === 'string') &&
    (raw['taskTitle'] === undefined || typeof raw['taskTitle'] === 'string') &&
    (raw['expertKey'] === undefined || typeof raw['expertKey'] === 'string') &&
    (raw['scenario'] === undefined || typeof raw['scenario'] === 'string') &&
    (raw['note'] === undefined || typeof raw['note'] === 'string') &&
    (raw['attempt'] === undefined || (typeof raw['attempt'] === 'number' && Number.isInteger(raw['attempt']) && raw['attempt'] >= 1)) &&
    typeof raw['at'] === 'number' &&
    Number.isFinite(raw['at'])
  )
}

/** 组块数据守卫（client-plugin forgeEventGroupDefinition.buildViewNode data 同语义镜像） */
export function isForgeEventGroupData(value: unknown): value is ForgeEventGroupData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['key'] === 'string' &&
    typeof raw['firstSeq'] === 'number' &&
    Number.isFinite(raw['firstSeq']) &&
    typeof raw['lastSeq'] === 'number' &&
    Number.isFinite(raw['lastSeq']) &&
    typeof raw['isLatest'] === 'boolean' &&
    Array.isArray(raw['entries']) &&
    raw['entries'].every((entry) => isForgeEventEntryData(entry)) &&
    (raw['progress'] === undefined ||
      (Array.isArray(raw['progress']) && raw['progress'].every((entry) => isForgeProgressEntryData(entry))))
  )
}

/** 场景章族色（run=进行蓝 / done=完成绿 / blk=阻塞琥珀——prototype evt-kind 同语义） */
export type ForgeEventBadgeTone = 'run' | 'done' | 'blk'

const TONE_BY_BADGE: Readonly<Record<string, ForgeEventBadgeTone>> = {
  启动: 'run',
  领取: 'run',
  恢复: 'run',
  自动处理: 'run',
  自动重试: 'run',
  进行中: 'run',
  完成: 'done',
  结束: 'done',
  停止: 'done',
  循环结束: 'done',
  循环停止: 'done',
  阻塞: 'blk',
  受阻: 'blk',
  挂起: 'blk',
  循环受阻: 'blk',
}

/** 徽记族色映射（未知徽记 = 中性 run 兜底） */
export function forgeEventBadgeTone(badge: string): ForgeEventBadgeTone {
  return TONE_BY_BADGE[badge] ?? 'run'
}

/** 时刻显示（HH:mm——组头时间范围刻度；畸形时间戳 = 空串收口） */
export function forgeEventClock(time: number): string {
  if (!Number.isFinite(time)) return ''
  try {
    const d = new Date(time)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

/** 秒级时刻显示（HH:mm:ss——条目行刻度；畸形时间戳 = 空串收口） */
export function forgeEventClockSeconds(time: number): string {
  if (!Number.isFinite(time)) return ''
  try {
    const d = new Date(time)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return ''
  }
}

/** 循环终态尾饰（结算/停止消息任务源行缀尾——组头只留来源标识，剥徽记前缀 + 括注 + 终态尾饰） */
const SOURCE_TERMINAL_TAIL = /\s*—\s*(?:循环结束|已按你的指令停止)\s*$/

/**
 * 组头来源标识（条目原文 `任务源: ` 行值，剥徽记前缀、`（…）` 修饰与循环终态尾饰
 * （` — 循环结束（…）`/` — 已按你的指令停止`——上一轮结算消息居首时不把「循环结束」
 * 带进组头，循环重开组不误导）；消息任务源行缺席 = 回落取 progress 内条目 sourceSlug
 * （首个非空——纯进度组同显任务源）；全组缺席 = ''）
 */
export function forgeEventGroupSource(entries: readonly ForgeEventEntryData[], progress?: readonly ForgeProgressEntryData[]): string {
  for (const entry of entries) {
    // 徽记与 `任务源:` 可同行（`[forge·X] 任务源: feat-x`）——先剥徽记前缀再取值
    const match = /(?:^|\n)\s*(?:\[forge·[^\]]+\]\s*)?任务源:\s*(.+)/.exec(entry.text)
    if (match !== null) {
      return match[1]!
        .replace(/（[^）]*）/g, '')
        .replace(SOURCE_TERMINAL_TAIL, '')
        .trim()
    }
  }
  for (const entry of progress ?? []) {
    if (entry.sourceSlug !== '') return entry.sourceSlug
  }
  return ''
}

/** 组头计数文案（`N 条 · 今日 HH:mm–HH:mm`——原型 evt-head .count 同语；单条单时点；空组 = ''） */
export function forgeEventGroupCount(entries: readonly ForgeEventEntryData[]): string {
  const first = entries[0]
  const last = entries.at(-1)
  if (first === undefined) return ''
  const range =
    last !== undefined && last.id !== first.id
      ? `${forgeEventClock(first.time)}–${forgeEventClock(last.time)}`
      : forgeEventClock(first.time)
  return `今日 ${range}`
}

// ─────────────────── 循环进度卡聚合（loop-message-consolidation 1.2） ───────────────────

/** 进度状态词（progress 卡任务行状态徽标——面板 DISPATCH_EVENT_STATUS_WORD 同语镜像） */
export const FORGE_PROGRESS_STATUS_WORD: Readonly<Record<string, string>> = {
  running: '执行中',
  completed: '完成',
  blocked: '阻塞',
  interrupted: '已中断',
}

/** 循环级状态词（taskKey 缺席的循环级进度行——与任务级词表分层，一律带「循环」标记） */
export const FORGE_LOOP_STATUS_WORD: Readonly<Record<string, string>> = {
  running: '循环进行中',
  completed: '循环已结束',
  blocked: '循环受阻',
  interrupted: '循环已结束',
}

/** 进度行状态词（任务级 = 裸状态词；循环级（taskKey 缺席）= 带「循环」标记词） */
export function forgeProgressStatusWord(entry: { readonly status: string; readonly taskKey?: string }): string {
  if (entry.taskKey === undefined) return FORGE_LOOP_STATUS_WORD[entry.status] ?? entry.status
  return FORGE_PROGRESS_STATUS_WORD[entry.status] ?? entry.status
}

/** 进度状态族色（执行中=进行蓝 / 完成=完成绿 / 阻塞·中断=琥珀——徽记 tone 族同语义） */
export function forgeProgressStatusTone(status: string): ForgeEventBadgeTone {
  if (status === 'completed') return 'done'
  if (status === 'blocked' || status === 'interrupted') return 'blk'
  return 'run'
}

/**
 * 聚合行（进度卡任务轨单行——最新态条目 + 起止时戳；耗时 = endAt − startAt 取事件时戳）。
 */
export interface ForgeProgressRowData {
  /** 该任务键/循环级最新态条目（后写覆盖） */
  readonly entry: ForgeProgressEntryData
  /** 开始时间 = 该任务键窗口内首事件时戳（循环级 = 自身时戳） */
  readonly startAt: number
  /** 结束时间 = 最新事件时戳 */
  readonly endAt: number
}

/**
 * 进度行聚合（面板 aggregateDispatchRowItems 同口径镜像——纯函数零 RPC）：
 * 每任务键最新态一行（后写覆盖），开始 = 首事件时戳、结束 = 最新时戳；
 * 无任务键的循环级事件收敛为单行最新态；池级 pending 快照（pool/pending）不进行轨。
 * triage 处置条目（triage-progress-row §2.2）走独立聚合键 `triage:{taskKey}`——不劫持
 * 任务行「每任务键最新态」模型，任务终态后写覆盖不吞处置行（同任务键多 attempt 折叠
 * 一行，终态折入 note）。排序 = 循环级单行居首，任务行与处置行按开始时序。
 */
export function forgeProgressRowItems(entries: readonly ForgeProgressEntryData[]): readonly ForgeProgressRowData[] {
  const latest = new Map<string, ForgeProgressRowData>()
  const triage = new Map<string, ForgeProgressRowData>()
  let loop: ForgeProgressRowData | undefined
  for (const entry of entries) {
    if (entry.scenario === 'pool/pending') continue
    if (entry.verb === 'triage' && entry.taskKey !== undefined) {
      const key = `triage:${entry.taskKey}`
      const held = triage.get(key)
      triage.set(key, {
        entry, // 后写覆盖 = 最新 attempt（终态折入 note）
        startAt: held === undefined ? entry.at : Math.min(held.startAt, entry.at),
        endAt: entry.at,
      })
      continue
    }
    if (entry.taskKey === undefined) {
      loop = { entry, startAt: entry.at, endAt: entry.at } // 后写覆盖 = 循环级单行最新态
      continue
    }
    const held = latest.get(entry.taskKey)
    latest.set(entry.taskKey, {
      entry,
      startAt: held === undefined ? entry.at : Math.min(held.startAt, entry.at),
      endAt: entry.at,
    })
  }
  const rows = [...latest.values(), ...triage.values()].sort((a, b) => a.startAt - b.startAt)
  return loop === undefined ? rows : [loop, ...rows]
}

/** 循环终态徽记族（上一轮结束/停止/受阻消息——循环级 running 行在场 = 已被重开覆盖的陈旧事实） */
const LOOP_SUPERSEDED_BADGES: ReadonlySet<string> = new Set(['循环结束', '循环停止', '循环受阻'])

/**
 * 组内可见消息条目（循环重开防误导——循环级最新态为 running 时，上一轮的终态/受阻
 * 消息条目不再呈现（循环行「循环进行中」已是最新事实，陈旧终态行让用户误会循环已结束）；
 * 无 running 循环行（终态组/旧缓存） = 原样全量保留）
 */
export function forgeEventVisibleEntries(
  entries: readonly ForgeEventEntryData[],
  loopRunning: boolean,
): readonly ForgeEventEntryData[] {
  return loopRunning ? entries.filter((entry) => !LOOP_SUPERSEDED_BADGES.has(entry.badge)) : entries
}
