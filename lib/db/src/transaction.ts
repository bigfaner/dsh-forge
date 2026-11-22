// 事务助手——多语句写入的原子边界（BEGIN/COMMIT/ROLLBACK + 嵌套 SAVEPOINT，经
// lib/db sqlite 适配层的 better-sqlite3 形状 transaction）。
// 同步窗口铁律：fn 内不得 await（SQLite 单连接无互斥面，事务窗口跨 await 会向
// 并发写动词暴露未闭合事务——bug 46f106c5）。
import type Database from './sqlite.js'

/** 在单事务中执行 fn：成功整体提交，抛错整体回滚（回滚后异常原样上抛）。 */
export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn)()
}
