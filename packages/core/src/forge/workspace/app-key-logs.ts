// 工作区库 app_key_logs 关键日志写入（任务 1.2）——与中央 forge/key-logs.ts 同纪律、异形状：
// 工作区表无 message 列、data_json NOT NULL、scope 仅任务域两值（'tasks' | 'workspace'——
// 中央 ck_akl_scope 四值不含，写中央必炸 CHECK，故随库自带；schema.sql [基建] APP_KEY_LOGS）。
// 纪律沿袭（TECH-error-002）：仅记关键一致性事件（异常/失败/自动修复），成功路径一律不记；
// 单事件单条——处置结果并入同条 data_json，不记过程流水；一律 prepared statements；
// 写仅经 store 产出的工作区句柄（openDatabase 参数化——db/ 句柄唯一落点）。
import type Database from 'better-sqlite3'

/** 仅关键级别（无 info 流水；工作区表 ck_wkl_level） */
export type WorkspaceKeyLogLevel = 'warn' | 'error'

/** 工作区关键日志记名域（工作区表 ck_wkl_scope 两值：任务域 + 工作区基建域） */
export type WorkspaceKeyLogScope = 'tasks' | 'workspace'

export interface WorkspaceKeyLogEntry {
  level: WorkspaceKeyLogLevel
  scope: WorkspaceKeyLogScope
  /** 结构化附载（必填——工作区表无 message 自由文本列，data_json NOT NULL） */
  data: Record<string, unknown>
}

/** 写一条工作区关键日志（单语句原子写入，prepared statement） */
export function recordWorkspaceKeyLog(db: Database.Database, entry: WorkspaceKeyLogEntry): void {
  db.prepare(
    `INSERT INTO app_key_logs (level, scope, data_json, created_at) VALUES (?, ?, ?, ?)`,
  ).run(entry.level, entry.scope, JSON.stringify(entry.data), new Date().toISOString())
}
