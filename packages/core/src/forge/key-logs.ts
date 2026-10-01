// app_key_logs 关键日志写入（定位：业务——ER APP_KEY_LOGS 的 forge 域用法面）。
// 纪律：仅记关键一致性事件（异常/失败/自动修复/孤儿发现），成功路径一律不记；
// 单事件单条——处置结果并入同条 data_json，不记过程流水。2.2 定义 scope=compensation 用法，
// reconcile（2.3）/ index / recall（3.x）同面复用。SQLite 写仅经 db/ 句柄（单写路径）。
import type Database from 'better-sqlite3'

/** 仅关键级别（无 info 流水；ER CHECK level IN ('warn','error')) */
export type KeyLogLevel = 'warn' | 'error'
/** 关键日志记名域（ER CHECK scope 四值） */
export type KeyLogScope = 'compensation' | 'reconcile' | 'index' | 'recall'

export interface KeyLogEntry {
  level: KeyLogLevel
  scope: KeyLogScope
  message: string
  /** 结构化附载（workspaceId / projectId / 失败原因 / 处置结果——结果并入同条） */
  data?: Record<string, unknown>
}

/** 写一条关键日志（单语句原子写入，prepared statement） */
export function recordKeyLog(db: Database.Database, entry: KeyLogEntry): void {
  db.prepare(
    `INSERT INTO app_key_logs (level, scope, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(entry.level, entry.scope, entry.message, entry.data ? JSON.stringify(entry.data) : null, new Date().toISOString())
}
