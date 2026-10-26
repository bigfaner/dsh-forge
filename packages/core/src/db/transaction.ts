// 事务助手——多语句写入的原子边界（better-sqlite3 事务：BEGIN/COMMIT/ROLLBACK + 嵌套安全）。
import type Database from 'better-sqlite3'

/** 在单事务中执行 fn：成功整体提交，抛错整体回滚（回滚后异常原样上抛）。 */
export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn)()
}

/**
 * 异步事务变体（manual BEGIN IMMEDIATE——better-sqlite3 db.transaction 仅收同步 fn）：
 * fn 可 await 注入的异步取用面（如 claim 链档案取用面），异常整体回滚（回滚失败不吞
 * 原异常）。仅 claim 使用（唯一含异步取数步骤的写动词）；与同步 withTransaction 互不嵌套。
 */
export async function withAsyncTransaction<T>(db: Database.Database, fn: () => Promise<T>): Promise<T> {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = await fn()
    db.exec('COMMIT')
    return result
  } catch (cause) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 事务已终结（回滚路径自身故障）——原异常优先上抛
    }
    throw cause
  }
}
