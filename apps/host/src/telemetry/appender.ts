// 统一日志汇 appender（app-observability 方案 4/5/11/12）：`diag/log` 事件域的
// 唯一订阅者——JSONL 行落盘（proposal 字段全集定版）。性能红线（方案 12）全落此层：
// ① 业务路径 fire-and-forget（写失败内存计数，永不反压业务）；
// ② 待写队列上界丢弃 + 计数（防 fs 线程池无界积压，评审 Q-2）；
// ③ 崩溃路径豁免——兜底钩行同步写 / 退出前 flushSync（核心证据行确定落盘，评审 B-1）。
// 留存策略（方案 5）：UTC 日界滚动 app-YYYYMMDD.jsonl、保留 7 天清理、50MB 截断；
// Windows 句柄占用（EBUSY/EPERM）致截断/清理失败 → 跳过本轮 + 下一轮重试，不阻塞应用。
// 实现前提（评审 Note-1）：ctx.emit 同步分发 → 订阅回调内同步完成 ALS 读取与 JSONL
// 序列化，fire-and-forget 只覆盖磁盘写；订阅回调整体 try/catch 包裹（绝不抛回 emit 点）。
import { appendFileSync } from 'node:fs'
import { appendFile, readdir, stat, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { DIAG_EVENT, type DiagEventPayload } from './diag-events.js'
import type { DiagContextStore } from './diag-context.js'

/** JSONL 行（proposal 字段全集——固定字段恒在、可选字段缺席省略） */
export interface DiagLine {
  /** UTC ISO 8601（跨时区/跨机器对齐无歧义） */
  timestamp: string
  level: DiagEventPayload['level']
  /** 无则 `-`（格式不破） */
  trace_id: string
  process: DiagEventPayload['process']
  message: string
  event: string
  stack?: string
  projectId?: string
  sessionId?: string
  cwd?: string
}

/** 运行计数（性能红线语义的观测面——内存态，零磁盘税） */
export interface AppenderCounters {
  /** 红线①：写失败计数（fire-and-forget 丢弃面） */
  writeFailures: number
  /** 红线②：待写队列超上界丢弃计数 */
  queueDropped: number
  /** 句柄占用致截断/清理跳过轮次计数 */
  maintenanceSkipped: number
}

/** 单行字节上限保护（畸形超长行仍受 50MB 截断约束，防单行吃满文件） */
const MAX_LINE_BYTES = 8 * 1024 * 1024

/** fs 驱动缝（DI：写失败/句柄占用注入——验收 9 注入缝，评审 Note-4） */
export interface AppenderDriver {
  append(file: string, data: string): Promise<void>
  appendSync(file: string, data: string): void
  sizeOf(file: string): Promise<number | undefined>
  list(dir: string): Promise<string[]>
  truncate(file: string): Promise<void>
  remove(file: string): Promise<void>
}

const nodeDriver: AppenderDriver = {
  append: (file, data) => appendFile(file, data, 'utf8'),
  appendSync: (file, data) => appendFileSync(file, data, 'utf8'), // 崩溃路径同步写（红线③）
  sizeOf: async (file) => (await stat(file).catch(() => undefined))?.size,
  list: async (dir) => {
    try {
      return await readdir(dir)
    } catch {
      return []
    }
  },
  truncate: (file) => truncate(file, 0),
  remove: (file) => unlink(file),
}

export interface AppenderOptions {
  /** 日志目录（data/logs——app-YYYYMMDD.jsonl 落点） */
  dir: string
  /** ALS 缝（评审 Note-4 DI——缺省不读上下文，trace_id 恒 `-`） */
  als?: DiagContextStore
  /** 单文件截断阈值（字节——50MB 定版） */
  maxFileBytes?: number
  /** 保留天数（7 天定版：今天 + 前 6 天） */
  retentionDays?: number
  /** 待写队列上界（红线②，1000 行定版） */
  maxQueue?: number
  /** fs 驱动注入（缺省 node:fs/promises） */
  driver?: AppenderDriver
  /** 时钟注入（测试可控——缺省系统时钟） */
  now?: () => Date
}

interface QueuedLine {
  line: DiagLine
  serialized: string
}

/** UTC 日界文件名（app-YYYYMMDD.jsonl——与 timestamp 字段同口径） */
export function logFileNameFor(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `app-${y}${m}${d}.jsonl`
}

/** 文件名 → UTC 日序（留存清理判据；非 app-*.jsonl 形态返回 undefined 不清理） */
function dayNumberFromFileName(name: string): number | undefined {
  const m = /^app-(\d{4})(\d{2})(\d{2})\.jsonl$/.exec(name)
  if (m === null) return undefined
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * JSONL appender（唯一订阅者）。
 * 用法：`attachDiagAppender(ctx, { dir })` 后，`ctx.emit('diag/log', payload)` 即落盘。
 */
export class DiagAppender {
  readonly #dir: string
  readonly #als: DiagContextStore | undefined
  readonly #maxFileBytes: number
  readonly #retentionDays: number
  readonly #maxQueue: number
  readonly #driver: AppenderDriver
  readonly #now: () => Date
  readonly #queue: QueuedLine[] = []
  readonly #counters: AppenderCounters = { writeFailures: 0, queueDropped: 0, maintenanceSkipped: 0 }
  #draining = false
  #drainChain: Promise<void> = Promise.resolve()
  #maintenanceDay: number | undefined // 已做过本轮留存的 UTC 日序（每日一轮）
  #skipMaintenance = false // 句柄占用跳过位（下一轮重试）

  constructor(options: AppenderOptions) {
    this.#dir = options.dir
    this.#als = options.als
    this.#maxFileBytes = options.maxFileBytes ?? 50 * 1024 * 1024
    this.#retentionDays = options.retentionDays ?? 7
    this.#maxQueue = options.maxQueue ?? 1000
    this.#driver = options.driver ?? nodeDriver
    this.#now = options.now ?? (() => new Date())
  }

  /** 运行计数（内存态观测面——测试与后续诊断消费） */
  get counters(): Readonly<AppenderCounters> {
    return this.#counters
  }

  /** 当前待写队列深度 */
  get pendingCount(): number {
    return this.#queue.length
  }

  /**
   * 订阅回调（ctx.on(DIAG_EVENT) 消费面）：同步完成 ALS 读取 + 序列化 + 入队，
   * 磁盘写 fire-and-forget。整体 try/catch——订阅回调绝不抛（emit 同步把 listener
   * 异常落回业务 emit 点，将破红线①）。
   */
  handleEvent(payload: DiagEventPayload): void {
    try {
      this.#enqueue(this.buildLine(payload), false)
    } catch {
      this.#counters.queueDropped += 1
    }
  }

  /**
   * 构造 JSONL 行（同步——ALS 上下文只在同步栈内可见，评审 Note-1）。
   * 上下文字段就近合并：ALS store 提供缺省，payload 显式字段优先。
   */
  buildLine(payload: DiagEventPayload): DiagLine {
    const store = this.#als?.getStore()
    const line: DiagLine = {
      timestamp: this.#now().toISOString(),
      level: payload.level,
      trace_id: store?.traceId ?? '-',
      process: payload.process,
      message: payload.message,
      event: payload.event,
    }
    const stack = payload.stack
    if (stack !== undefined) line.stack = stack
    const projectId = payload.projectId ?? store?.projectId
    if (projectId !== undefined) line.projectId = projectId
    const sessionId = payload.sessionId ?? store?.sessionId
    if (sessionId !== undefined) line.sessionId = sessionId
    const cwd = payload.cwd ?? store?.cwd
    if (cwd !== undefined) line.cwd = cwd
    return line
  }

  /** 入队 + 调度（sync = 崩溃路径——绕过队列立即同步写，红线③） */
  #enqueue(line: DiagLine, sync: boolean): void {
    let serialized = JSON.stringify(line)
    if (serialized.length > MAX_LINE_BYTES) {
      // 畸形超长行：裁 message 保字段全集（消息面截断优于证据行整体丢失）
      line.message = `${line.message.slice(0, 1024)}…[truncated]`
      serialized = JSON.stringify(line)
    }
    if (sync) {
      this.#writeSync(line, serialized)
      return
    }
    if (this.#queue.length >= this.#maxQueue) {
      this.#counters.queueDropped += 1 // 红线②：超界丢弃 + 计数，不阻塞业务
      return
    }
    this.#queue.push({ line, serialized })
    this.#drainChain = this.#drainChain.then(() => this.#drain())
  }

  /** 队列排空等待面（观测/测试用——业务路径零消费，红线①不受影响） */
  idle(): Promise<void> {
    return this.#drainChain
  }

  /** 崩溃路径：同步落盘（fs 缺席/失败静默——兜底钩内不允许可达异常） */
  #writeSync(line: DiagLine, serialized: string): void {
    try {
      this.#driver.appendSync(join(this.#dir, logFileNameFor(new Date(line.timestamp))), `${serialized}\n`)
    } catch {
      this.#counters.writeFailures += 1
    }
  }

  /**
   * 红线①：fire-and-forget 串行 drain——写失败内存计数，永不反压业务。
   * 单飞（draining 位）保证单写者顺序与 50MB 判定的线性一致。
   */
  async #drain(): Promise<void> {
    if (this.#draining) return
    this.#draining = true
    try {
      while (this.#queue.length > 0) {
        const item = this.#queue.shift()
        if (item === undefined) break
        await this.#appendItem(item)
      }
    } finally {
      this.#draining = false
    }
  }

  async #appendItem(item: QueuedLine): Promise<void> {
    const file = join(this.#dir, logFileNameFor(new Date(item.line.timestamp)))
    try {
      await this.#maintain(item.line)
      await this.#driver.append(file, `${item.serialized}\n`)
    } catch {
      this.#counters.writeFailures += 1 // 红线①：写失败降级为内存计数
    }
  }

  /**
   * 留存维护（每日一轮 + 截断判定）：句柄占用（EBUSY/EPERM）→ 跳过本轮计一次，
   * 下一轮（下一条写或下一天）重试；失败不上抛（不阻塞写路径）。
   */
  async #maintain(line: DiagLine): Promise<void> {
    const day = dayNumberFromFileName(logFileNameFor(new Date(line.timestamp)))
    if (day === undefined) return
    // 维护轮判定：跨日或上轮被句柄占用跳过（skip 位）→ 重跑清理（下一轮重试语义）
    if (day !== this.#maintenanceDay || this.#skipMaintenance) {
      this.#maintenanceDay = day
      this.#skipMaintenance = false
      await this.#cleanupOldFiles(day)
    }
    await this.#truncateIfNeeded(line)
  }

  /** 保留 7 天清理（今天 + 前 retentionDays-1 天；外部读者占用 → 跳过该文件下轮重试） */
  async #cleanupOldFiles(todayDay: number): Promise<void> {
    let skipped = false
    try {
      const names = await this.#driver.list(this.#dir)
      const cutoff = todayDay - (this.#retentionDays - 1) * 86_400_000
      for (const name of names) {
        const day = dayNumberFromFileName(name)
        if (day === undefined || day >= cutoff) continue
        try {
          await this.#driver.remove(join(this.#dir, name))
        } catch {
          skipped = true // 句柄占用：跳过该文件，下一轮重试
          this.#counters.maintenanceSkipped += 1
        }
      }
    } catch {
      skipped = true
      this.#counters.maintenanceSkipped += 1
    }
    if (skipped) this.#skipMaintenance = true
  }

  /** 50MB 截断（写入前判定；句柄占用 → 跳过本轮截断下轮重试，本行照常追加） */
  async #truncateIfNeeded(line: DiagLine): Promise<void> {
    try {
      const file = join(this.#dir, logFileNameFor(new Date(line.timestamp)))
      const size = await this.#driver.sizeOf(file)
      if (size === undefined || size < this.#maxFileBytes) return
      await this.#driver.truncate(file)
    } catch {
      this.#counters.maintenanceSkipped += 1
    }
  }

  /**
   * 崩溃路径同步行（红线③豁免面）：main 兜底钩消费——绕过队列 appendSync 确定落盘，
   * 也可在退出前作 flush 语义补刀（队列残留同步排空）。
   */
  appendCrashLine(payload: DiagEventPayload): void {
    try {
      this.#enqueue(this.buildLine(payload), true)
    } catch {
      /* 兜底路径不允许可达异常 */
    }
  }

  /** 退出前 flush（红线③ flush 语义）：队列残留按同步写排空（尽力——单文件内有序） */
  flushSync(): void {
    while (this.#queue.length > 0) {
      const item = this.#queue.shift()
      if (item === undefined) break
      this.#writeSync(item.line, item.serialized)
    }
  }
}

/**
 * 装配：appender 挂为 `diag/log` 事件域唯一订阅者（返回退订器）。
 * emit 侧零静态依赖——所有埋点只知 ctx.emit。
 */
export function attachDiagAppender(
  ctx: import('@deepseek-ai/cordis').Context,
  options: AppenderOptions,
): { appender: DiagAppender; dispose: () => boolean } {
  const appender = new DiagAppender(options)
  const dispose = ctx.on(DIAG_EVENT, (payload) => appender.handleEvent(payload))
  return { appender, dispose }
}

export { nodeDriver as defaultAppenderDriver }
