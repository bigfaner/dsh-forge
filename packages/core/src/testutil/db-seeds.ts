// 测试/夹具 seed 帮助器（fix-37 ⑤）——projects 行种入与 e2e 注入面单源。
// 收编动机：e2e 曾直写 core 私有 schema SQL（compensation INSERT/UPDATE/DELETE projects）
// 与 core 测试（project-service / reconcile-queries 的 seedRow）互为拷贝——本模块成为唯一源
// （core 测试与 e2e support 双消费；e2e 经 e2e/support/sqlite.ts 相对源引——包 manifest 面
// 零变化，本目录仍不进任何生产 import 图）。e2e 侧无 @types/better-sqlite3——入参取结构化
// 最小面（better-sqlite3 Database 结构兼容）。
// （知识域表 seed 帮助器已随 core 知识域退役移除——1.8；知识面 e2e 预置走插件自持库。）
//
// 注入语义随行注记（取舍）：③ 应用库写入失败注入 = INSERT 触发器恒 ABORT
// （fix-27 起 ws_path 冲突行已被服务面自愈消费，触发器为唯一残余注入面）；
// WAL 活写兼容 app 在场（busy_timeout 由打开侧设置）。
import { join } from 'node:path'

/** 语句最小面（run/get/all——better-sqlite3 Statement 结构兼容） */
export interface SeedStmt {
  run(...args: unknown[]): unknown
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}

/** 结构化最小面（prepare/exec/pragma/close——better-sqlite3 Database 结构兼容） */
export interface SeedDb {
  prepare(sql: string): SeedStmt
  exec(sql: string): unknown
  pragma(source: string): unknown
  close(): unknown
}

/** 种入时间基准（ISO——reconcile 断言面 T0 同值） */
export const SEED_TS = '2026-01-01T00:00:00.000Z'

export interface SeedProjectRowInput {
  readonly id: string
  readonly workspaceId: string
  readonly wsPath: string
  readonly name?: string
  readonly archived?: 0 | 1
  readonly forgeDir?: string
  readonly knowledgeDir?: string
  readonly createdAt?: string
  readonly updatedAt?: string
}

/**
 * 种入 projects 行（直接 SQL——对账/查询/挂接场景的输入面，与 registry 桩状态解耦编排；
 * forge/knowledge 目录缺省按 wsPath 派生、name 缺省取 id、时间缺省 SEED_TS）。
 */
export function seedProjectRow(db: SeedDb, o: SeedProjectRowInput): void {
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    o.id,
    o.workspaceId,
    o.wsPath,
    o.name ?? o.id,
    o.forgeDir ?? join(o.wsPath, '.forge'),
    o.knowledgeDir ?? join(o.wsPath, '.knowledge'),
    o.archived ?? 0,
    o.createdAt ?? SEED_TS,
    o.updatedAt ?? SEED_TS,
  )
}

/** 活删应用侧行（按 ws_path——挂接态预置：registry 在场 / 应用库零行；WAL 活写兼容） */
export function deleteProjectRowByWsPath(db: SeedDb, wsPath: string): void {
  db.prepare('DELETE FROM projects WHERE ws_path = ?').run(wsPath)
}

/** 活删应用侧行（按 id——假未绑定账本行注入：删应用侧行保 dsh 侧工作区） */
export function deleteProjectRowById(db: SeedDb, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

/**
 * 漂移预置（注入契约）：projects.workspace_id 与 registry 实际注册失配
 * （fix-18 home 翻转遗留同型——返回 run 结果供「UPDATE 命中」断言）。
 */
export function driftProjectWorkspaceRef(db: SeedDb, projectId: string, bogusWorkspaceId: string): unknown {
  return db.prepare('UPDATE projects SET workspace_id = ? WHERE id = ?').run(bogusWorkspaceId, projectId)
}

/** fix-27 后 ③ 应用库写入失败注入载体：INSERT 触发器恒 ABORT（WAL 活写兼容 app 在场） */
export function installProjectInsertFailure(db: SeedDb): void {
  db.exec(
    `CREATE TRIGGER IF NOT EXISTS e2e_fail_projects_insert BEFORE INSERT ON projects BEGIN SELECT RAISE(ABORT, 'e2e 注入：③ 应用库写入失败'); END`,
  )
}

/** 注入复位（DROP TRIGGER——「上一次已完整补偿」的干净前置） */
export function removeProjectInsertFailure(db: SeedDb): void {
  db.exec('DROP TRIGGER IF EXISTS e2e_fail_projects_insert')
}

/**
 * 预置 workspace_id 占位行（挂接分支 ③ 失败注入载体——fix-27 后 ws_path 冲突面已自愈，
 * 唯一残余冲突 = workspace_id UNIQUE：他行占住既有工作区 id；路径随机错开不进左栏）。
 */
export function seedWorkspaceIdConflictRow(db: SeedDb, workspaceId: string): void {
  const other = `Z:\\dsh-forge-e2e-other-${Math.random().toString(36).slice(2, 10)}`
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at)
     VALUES (?, ?, ?, 'seed-own', ?, 0, ?, 0, ?, ?)`,
  ).run(
    `seed-${Math.random().toString(36).slice(2, 10)}`,
    workspaceId,
    other,
    `${other}\\.forge`,
    `${other}\\.knowledge`,
    new Date().toISOString(),
    new Date().toISOString(),
  )
}

/**
 * 预置使用事件（kb Setup fixture 通道）与索引零行化已随 core 知识域退役移除
 * （knowledge-stage1-foundation 1.8——知识面数据归插件自持库）。
 */

/** 只读探针：对账修复记账行数（scope=reconcile warn——boot 自动对账实证面） */
export function countReconcileWarnLogs(db: SeedDb): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM app_key_logs WHERE scope = 'reconcile' AND level = 'warn'`)
    .get() as { n: number }
  return row.n
}
