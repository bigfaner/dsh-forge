// ForgeWorkspaceStore——每工作区任务库（forge.db）惰性多句柄生命周期（任务 1.2；tech-design
// §交互二 + Layer Placement「forge/workspace/ 共享基建」）。定位：业务（共享基建）。
//
// 惰性首开链（每库每进程首次触达）：openDatabase（**参数化传入工作区迁移序列**——Hard Rule，
// 中央 MIGRATIONS 硬编码 import 勿照抄；db/ 句柄唯一落点）→ 版本门（FORGE_DB_SCHEMA_VERSION
// 独立版本线）→ 单事务/版本迁移 → 结构健全性检查（版本 + PRAGMA foreign_key_check + 表在场，
// 恒轻量——不开库全库派生复检）。
//
// 失败 = 工作区隔离（不抛断用户流程）：typed ERR_WORKSPACE_DB_UNAVAILABLE + 工作区
// app_key_logs 记账（scope: tasks——中央 ck_akl_scope 四值不含，写中央必炸 CHECK）+
// 该工作区隔离（fail-fast 同一 error 实例，单事件单条不重复记账），其余库照常。
// 记账降级口径：句柄已关（openDatabase 内部失败类：损坏/版本门拒绝）库不可写 → child 控制台
// （stdio 继承回流宿主——alignWorkspaceTitle 同径）；句柄在手（健全性检查失败类）写后关闭。
//
// 库文件缺席 → 新建 v1（P1 存量工作区升级 M2 首次触达补建；与注册新建径同构——交互二/三）；
// onFirstCreate 协作者挂点 = 发现面只读扫描（1.3 实现接线），失败 fail-soft 不隔离不抛。
//
// 句柄生命周期 = 进程内常驻；store.dispose 统一关闭（3.4 接插件 disposer host 侧收口）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '../../db/index.js'
import { errMessage } from '../../util.js'
import { recordWorkspaceKeyLog } from './app-key-logs.js'
import { type WorkspaceDbUnavailableData, WorkspaceDbUnavailableError } from './errors.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'

/**
 * 工作区库目录解析器（projectId → 派生目录 {tasksHome}/{flatten}@{hash8}）。
 * 1.4 接 deriveDir 单源 + 中央 projects 行装配；测试注入临时目录。
 */
export type WorkspaceDirResolver = (projectId: string) => string

/**
 * 首建协作者挂点（库文件缺席补建径）：新库 v1 落成后调用（发现面只读扫描——1.3 实现）。
 * 失败 = fail-soft：不隔离不抛（库已开且健全，任务域照常）。
 */
export type WorkspaceFirstCreateHook = (projectId: string, db: Database.Database) => void

export interface WorkspaceStoreDeps {
  /** 工作区库目录解析（projectId → dir） */
  readonly resolveDir: WorkspaceDirResolver
  /** 首建协作者（可选；1.3 发现面扫描接线） */
  readonly onFirstCreate?: WorkspaceFirstCreateHook
}

export interface ForgeWorkspaceStore {
  /** 惰性开库（幂等：已开返回常驻句柄；已隔离 fail-fast 抛同一 error 实例） */
  ensureOpen(projectId: string): Database.Database
  /** 进程内常驻句柄统一关闭（幂等；dispose 后 ensureOpen 重开新句柄） */
  dispose(): void
}

/** 库文件名（部署：{tasksHome}/{flatten}@{hash8}/forge.db——schema.sql 头注） */
const FORGE_DB_FILENAME = 'forge.db'

/** 结构健全性检查·表在场清单（九表 = 七域表 + schema_meta + app_key_logs 基建表；字母序） */
const EXPECTED_TABLES: readonly string[] = [
  'app_key_logs',
  'feature_documents',
  'features',
  'proposals',
  'schema_meta',
  'task_edges',
  'task_records',
  'task_session_links',
  'tasks',
]

/** 隔离处置文案（记账 data_json 与 typed error message 同源单份） */
const ISOLATED_DISPOSITION = '工作区隔离——本进程内该工作区任务域不可用，其余工作区照常'

/**
 * 结构健全性检查（开库断言，恒轻量）：版本 + foreign_key_check + 表在场。
 * 不做全库派生复检（写时增量断言 / validateFeatureTasks 归任务域两层，职责分层）。
 */
function assertStructureSound(db: Database.Database): void {
  const version = db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v
  if (version !== FORGE_DB_SCHEMA_VERSION) {
    throw new Error(`工作区库结构健全性检查失败：schema 版本 ${String(version)} ≠ 支持上限 ${FORGE_DB_SCHEMA_VERSION}`)
  }
  const violations = db.pragma('foreign_key_check') as unknown[]
  if (!Array.isArray(violations) || violations.length > 0) {
    throw new Error(`工作区库结构健全性检查失败：foreign_key_check 命中违例行`)
  }
  const tables = db
    .prepare<unknown[], { name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all()
    .map((r) => r.name)
  if (tables.length !== EXPECTED_TABLES.length || tables.some((t, i) => t !== EXPECTED_TABLES[i])) {
    throw new Error(
      `工作区库结构健全性检查失败：表在场不符（期望九表 [${EXPECTED_TABLES.join(', ')}]，实际 [${tables.join(', ')}]）`,
    )
  }
}

/** 首建协作者执行（fail-soft：库已开且健全——协作者失败不隔离不抛，记账 scope=workspace 基建域） */
function runFirstCreate(deps: WorkspaceStoreDeps, projectId: string, db: Database.Database): void {
  if (deps.onFirstCreate === undefined) return
  try {
    deps.onFirstCreate(projectId, db)
  } catch (cause) {
    try {
      recordWorkspaceKeyLog(db, {
        level: 'error',
        scope: 'workspace',
        data: {
          projectId,
          error: errMessage(cause),
          disposition: '首次建库协作者失败——已跳过（工作区库保持可用，任务域照常）',
        },
      })
    } catch (logCause) {
      console.warn(
        `首建协作者失败记账降级（库不可写）：${projectId}——${errMessage(cause)}；记账失败：${errMessage(logCause)}`,
      )
    }
  }
}

/** 建 ForgeWorkspaceStore（装配单例：句柄表 + 隔离表 + 首建协作者闭包） */
export function createWorkspaceStore(deps: WorkspaceStoreDeps): ForgeWorkspaceStore {
  const handles = new Map<string, Database.Database>()
  const isolated = new Map<string, WorkspaceDbUnavailableError>()

  return {
    ensureOpen(projectId: string): Database.Database {
      const open = handles.get(projectId)
      if (open !== undefined) return open
      const failure = isolated.get(projectId)
      if (failure !== undefined) throw failure // 隔离 fail-fast（同一实例）

      const dir = deps.resolveDir(projectId)
      const file = join(dir, FORGE_DB_FILENAME)
      const fileAbsent = !existsSync(file)
      let db: Database.Database | undefined
      try {
        // Hard Rule：工作区迁移序列参数化传入（独立版本线）——db/ 句柄唯一落点复用
        db = openDatabase(file, { migrations: WORKSPACE_MIGRATIONS, schemaVersion: FORGE_DB_SCHEMA_VERSION })
        assertStructureSound(db)
      } catch (cause) {
        throwIsolated(isolated, projectId, dir, db, cause)
      }
      // 句柄先入表再跑首建协作者：协作者失败 fail-soft，健全句柄不弃（AC3/AC4 分层）
      handles.set(projectId, db)
      if (fileAbsent) runFirstCreate(deps, projectId, db)
      return db
    },

    dispose(): void {
      for (const db of handles.values()) db.close()
      handles.clear()
      isolated.clear()
    },
  }
}

/**
 * 隔离收口（never 返回——调用点即 throw 点）：标记隔离 → best-effort 记账 → 关句柄 → typed throw。
 * 先标记隔离（fail-fast 同一实例；单事件单条——重复触达不重复记账），记账自身失败降级 child 控制台。
 */
function throwIsolated(
  isolated: Map<string, WorkspaceDbUnavailableError>,
  projectId: string,
  dir: string,
  db: Database.Database | undefined,
  cause: unknown,
): never {
  const data: WorkspaceDbUnavailableData = { projectId, dir, error: errMessage(cause), disposition: ISOLATED_DISPOSITION }
  const error = new WorkspaceDbUnavailableError(data, cause)
  isolated.set(projectId, error)
  if (db !== undefined && db.open) {
    // 句柄在手（结构健全性检查失败类）：记账写工作区库（scope=tasks）后关闭。
    // 记账可炸——误指中央形态库时 app_key_logs 命中 ck_akl_scope 四值 CHECK（AC 对偶证明），降级不吞 typed error。
    try {
      recordWorkspaceKeyLog(db, { level: 'error', scope: 'tasks', data })
    } catch (logCause) {
      console.warn(
        `工作区库隔离记账降级（库不可写）：${projectId} @ ${dir}——${errMessage(cause)}；记账失败：${errMessage(logCause)}`,
      )
    }
    db.close()
  } else {
    // 句柄已关（openDatabase 内部失败类）→ 库不可写，降级 child 控制台（stdio 继承回流宿主）
    console.warn(`工作区库隔离（记账降级 child 控制台——库不可写）：${projectId} @ ${dir}——${errMessage(cause)}`)
  }
  throw error
}
