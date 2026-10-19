// 同文重复行折叠计数（app-observability 方案 12③ 噪音治理——供 renderer 转发面
// 消费，如 changes.summary 404 轮询噪音源）：连续同文（同 process/level/event/message）
// 行折叠为单行 + repeat 计数；键切换或时间窗越过时 flush 收口。纯逻辑无定时器
// （时钟注入，timer-free——不制造孤儿句柄，Windows commit 纪律）。
import type { DiagLine } from './appender.js'

/** 折叠输出行：DiagLine + repeat（= 折叠掉的重复行数，首次行无 repeat 字段） */
export type FoldedLine = DiagLine & { repeat?: number }

/** 折叠判键（同文 = 同进程 + 同级 + 同类别 + 同消息；stack 不入键——同文异栈折叠计数） */
export function foldKeyOf(line: DiagLine): string {
  return `${line.process}|${line.level}|${line.event}|${line.message}`
}

export interface LineFolderOptions {
  /** 折叠时间窗（ms——窗口越过分次收口；缺省 60s） */
  windowMs?: number
  /** 时钟注入（缺省系统时钟） */
  now?: () => number
  /** 收口出口（折叠行 / 单行经此落消费面——appender 或 renderer 转发器） */
  flush: (line: FoldedLine) => void
}

/**
 * 有状态折叠器：push 逐行喂入，重复行计数不上抛；flush() 显式收口（转发面轮次边界）。
 */
export class LineFolder {
  readonly #windowMs: number
  readonly #now: () => number
  readonly #flush: (line: FoldedLine) => void
  #key: string | undefined
  #line: DiagLine | undefined
  #count = 0
  #windowStart = 0

  constructor(options: LineFolderOptions) {
    this.#windowMs = options.windowMs ?? 60_000
    this.#now = options.now ?? (() => Date.now())
    this.#flush = options.flush
  }

  /** 喂入一行：与当前折叠键同文且未越窗 → 计数；否则先收口上一组 */
  push(line: DiagLine): void {
    const key = foldKeyOf(line)
    const now = this.#now()
    if (this.#key === key && now - this.#windowStart < this.#windowMs) {
      this.#count += 1
      return
    }
    this.#emit()
    this.#key = key
    this.#line = line
    this.#count = 1
    this.#windowStart = now
  }

  /** 显式收口（当前组立即落消费面） */
  flush(): void {
    this.#emit()
  }

  #emit(): void {
    const line = this.#line
    if (line === undefined) return
    const out: FoldedLine =
      this.#count > 1 ? { ...line, repeat: this.#count - 1 } : line
    try {
      this.#flush(out)
    } finally {
      this.#line = undefined
      this.#key = undefined
      this.#count = 0
    }
  }
}
