// forge 域两测试（project-service / reconcile-queries）共享行读取（fix-35 收编：
// readRows/keyLogs/ProjectRow 两份同构拷贝单源——与 fix-34 registry-stub 同目录同口径，
// 本目录不进任何生产 import 图）。
import type Database from 'better-sqlite3'

/** projects 全列行（snake_case 存储形状——断言直接对存储态） */
export interface ProjectRow {
  id: string
  workspace_id: string
  ws_path: string
  name: string
  forge_dir: string
  forge_dir_external: number
  knowledge_dir: string
  archived: number
  created_at: string
  updated_at: string
}

export const readRows = (db: Database.Database): ProjectRow[] =>
  db.prepare<unknown[], ProjectRow>(`SELECT * FROM projects`).all()

/** app_key_logs 行（data_json 随行——记账断言取结构化附载） */
export interface ForgeKeyLogRow {
  level: string
  scope: string
  message: string
  data_json: string | null
}

export const keyLogs = (db: Database.Database): ForgeKeyLogRow[] =>
  db.prepare<unknown[], ForgeKeyLogRow>(`SELECT level, scope, message, data_json FROM app_key_logs ORDER BY id`).all()
