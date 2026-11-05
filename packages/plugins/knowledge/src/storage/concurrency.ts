// 并发纪律（总纲 §2.10）：WAL + busy_timeout（open.ts PRAGMA 面）+ 短事务 + rebuild 单飞。
// · withImmediateTransaction：BEGIN IMMEDIATE 立即取写锁的短事务（同步窗口铁律——
//   better-sqlite3 单连接，fn 内不得 await；与 core db/transaction.ts 同纪律）；
// · createSingleFlightMutex：进程内互斥（rebuild 单飞——同键临界区串行，跨键互不阻塞）。
import type Database from 'better-sqlite3'

/** busy_timeout 毫秒（open.ts PRAGMA 消费同一常量——锁竞争等持有者落盘） */
export const BUSY_TIMEOUT_MS = 5000

/**
 * BEGIN IMMEDIATE 短事务：入口即取写 RESERVED 锁（并发写者排队等 busy_timeout），
 * fn 抛错整体回滚。fn 必须同步（跨 await 的事务窗口向并发暴露未闭合事务——铁律）。
 */
export function withImmediateTransaction<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn).immediate()
}

/** 进程内单飞互斥（键粒度：同键串行、异键并行） */
export interface SingleFlightMutex {
  /** 同键调用串行（后者等前者 settle），fn 异常原样向调用方传播、不毒化队列 */
  run<T>(key: string, fn: () => Promise<T>): Promise<T>
}

/** 建单飞互斥（rebuild 单飞承载——调用方以资源键（如 wsPath/projectId）键控） */
export function createSingleFlightMutex(): SingleFlightMutex {
  const tails = new Map<string, Promise<unknown>>()
  return {
    run(key, fn) {
      const run = (tails.get(key) ?? Promise.resolve()).then(fn, fn)
      // 失败不毒化队列：tail 只看 settle 不看结果
      tails.set(
        key,
        run.then(
          () => undefined,
          () => undefined,
        ),
      )
      return run
    },
  }
}
