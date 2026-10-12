// loop · 运行时登记表（S1b——decisions #12/#18：进程内活循环 → 任务源/主会话/in-flight/
// worker 子会话）。进程内不持久化、重启即空 = S3 启动对账（reconcileInterrupted）的判据之③；
// 终态（settled/halted/stopped）即登记表删除——新实例 = guard 计数复位（对齐原 skill
// 「halted 无自解锁、新会话复位」语义的键参数化形态，guardKey = LoopInstanceId）。
// LoopInstanceId：启动时 crypto.randomUUID() 生成（每次启动 = 新实例）；作用 = 登记表键 +
// guard 粘性载体 + stop/替换定位。持久痕迹 = claim 记录循环来源标记（S3 已落地，非本表职责）。
import type { TaskRef } from '@dsh-forge/contracts'

/** 循环实例 id（UUID——decisions #18：登记表键 + guard 粘性载体 + stop/替换定位） */
export type LoopInstanceId = string

/** 任务源（decisions #21 用词——feature 目录 | 提案 slug；ContainerRef 同形结构子集） */
export interface LoopSourceRef {
  readonly kind: 'feature' | 'proposal'
  readonly slug: string
}

/** in-flight 行（v1 恒 ≤1——集合建模留并行缝：字段面为未来多行集合的行形状） */
export interface LoopInFlight {
  /** 任务自然键（agent 面） */
  readonly taskRef: TaskRef
  /** 呈现键 'slug/localId'（叙述/日志口径） */
  readonly taskKey: string
  /** uuid 代理主键（停止时 in-flight 真化 interrupted 走 S3 transitionTask 面的锚） */
  readonly taskId: string
  /** 任务名（叙述任务行） */
  readonly title: string
  /** worker 子会话 id（对账锚；spawn 完成即回填——claim 与 spawn 之间的窗口为 undefined） */
  workerSessionId?: string
}

/** 活循环行（登记表值——字段完整面：任务源/主会话/in-flight/worker 子会话） */
export interface LoopRecord {
  readonly id: LoopInstanceId
  readonly source: LoopSourceRef
  /** 主会话（发起会话——叙述目的地 + claim/links 身份锚 + stop 作用域键，decisions #20） */
  readonly ownerSessionId: string
  readonly projectId: string
  inFlight?: LoopInFlight
}

/** 登记表面（进程内唯一——装配单例持有；驱动器经 deps 注入共享） */
export interface LoopRegistry {
  register(record: LoopRecord): void
  get(id: LoopInstanceId): LoopRecord | undefined
  /** 终态注销（幂等——不存在零效应） */
  remove(id: LoopInstanceId): void
  /** 同源占用读数（2026-10-12 多会话并行裁决——start 门控：同一任务源进程内至多一个活循环） */
  bySource(source: LoopSourceRef): LoopRecord | undefined
  /** 全量活循环读数（多会话并行——指令层候选过滤/同源占用判定的观察径） */
  all(): readonly LoopRecord[]
  /** stop 作用域读数（ownerSessionId = 敲指令会话——decisions #20 仅停本会话循环） */
  byOwner(ownerSessionId: string): LoopRecord | undefined
}

/** 建登记表（纯内存 Map——重启即空；无持久化径） */
export function createLoopRegistry(): LoopRegistry {
  const loops = new Map<LoopInstanceId, LoopRecord>()
  return {
    register(record): void {
      loops.set(record.id, record)
    },
    get(id): LoopRecord | undefined {
      return loops.get(id)
    },
    remove(id): void {
      loops.delete(id)
    },
    bySource(source): LoopRecord | undefined {
      for (const record of loops.values()) {
        if (record.source.kind === source.kind && record.source.slug === source.slug) return record
      }
      return undefined
    },
    all(): readonly LoopRecord[] {
      return [...loops.values()]
    },
    byOwner(ownerSessionId): LoopRecord | undefined {
      for (const record of loops.values()) {
        if (record.ownerSessionId === ownerSessionId) return record
      }
      return undefined
    },
  }
}
