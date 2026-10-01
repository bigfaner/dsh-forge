// 事务助手——多语句写入的原子边界（better-sqlite3 事务：BEGIN/COMMIT/ROLLBACK + 嵌套安全）。
import type Database from 'better-sqlite3'

/** 在单事务中执行 fn：成功整体提交，抛错整体回滚（回滚后异常原样上抛）。 */
export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn)()
}
