// 消息面事件折叠条目组节点数据面（定位：业务——loop-event-delivery 1.9；壳树自持纯模块）。
// 边界纪律（1.17 forge-progress-data 先例）：守卫归唯一 runtime 消费者（壳树视图），
// client 树零引用（定义面数据透传 unknown 不窄读）。
// 数据纪律：形状防御（client-plugin forgeEventGroupDefinition.buildViewNode data 形状
// 同语义镜像——他形不猜不抛，组件 null 收口零残留）。

/** 组内单条事件条目（client-plugin ForgeEventEntry 形状镜像） */
export interface ForgeEventEntryData {
  readonly id: string
  readonly seq: number
  readonly time: number
  readonly badge: string
  readonly title: string
  readonly summary: string
  readonly text: string
}

/** 组块节点 data（buildViewNode data 形状镜像） */
export interface ForgeEventGroupData {
  readonly key: string
  readonly firstSeq: number
  readonly lastSeq: number
  /** 最新组（组块默认展开；前组默认收起） */
  readonly isLatest: boolean
  readonly entries: readonly ForgeEventEntryData[]
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
    raw['entries'].every((entry) => isForgeEventEntryData(entry))
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
  阻塞: 'blk',
  受阻: 'blk',
  挂起: 'blk',
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

/** 组头来源标识（条目原文 `任务源: ` 行值，剥徽记前缀与 `（…）` 修饰——原型 `[forge·调度] {slug}` 同语；全组缺席 = ''） */
export function forgeEventGroupSource(entries: readonly ForgeEventEntryData[]): string {
  for (const entry of entries) {
    // 徽记与 `任务源:` 可同行（`[forge·X] 任务源: feat-x`）——先剥徽记前缀再取值
    const match = /(?:^|\n)\s*(?:\[forge·[^\]]+\]\s*)?任务源:\s*(.+)/.exec(entry.text)
    if (match !== null) {
      return match[1]!
        .replace(/（[^）]*）/g, '')
        .trim()
    }
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
