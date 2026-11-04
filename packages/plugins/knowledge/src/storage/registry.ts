// 自持注册表（A2 第二弹）：wsPath canonical（realpath 归一）为键、knowledge_dir 列。
// 路径归一含 realpath 维（判例 c773c09f——sessionCreate cwd 仅盘符/大小写归一会漂移：
// 注册表键必须 realpath 化，不可只走 path-key normalizeFsPath 比对口径）。
// 写路径 = BEGIN IMMEDIATE 短事务 upsert（并发纪律见 concurrency.ts）；读路径直读。
// config 静态注入（KnowledgePluginConfig.projects 绑定表）为另一径——本表是注册行
// 读写径（种子迁移任务自此承接 core projects.knowledge_dir）。
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from './concurrency.js'

/** 注册行（projects 表行投影；projectId 可空——v3 前行/种子迁移行无值） */
export interface RegistryRow {
  readonly wsPath: string
  readonly knowledgeDir: string
  readonly projectId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * wsPath canonical（realpath 归一）：可达则 realpath（磁盘真值拼写——盘符大小写/
 * 8.3 短名/symlink/junction 全展开）；缺席/不可达 fail-soft 回退词法 resolve
 *（core 注册链 canonicalizeDir 同口径）。
 */
export function canonicalWsPath(wsPath: string): string {
  try {
    return realpathSync(wsPath)
  } catch {
    return resolve(wsPath)
  }
}

/** 注册表读写面（工厂内一次性构造 prepared 语句，方法零再准备） */
export interface KnowledgeRegistry {
  /** 注册/更新（wsPath realpath 归一后 upsert；返回落库行。projectId 缺席 = 保留既有列值——种子迁移等不洗掉动态注册值） */
  upsert(wsPath: string, knowledgeDir: string, projectId?: string): RegistryRow
  /** 按键查行（入参同样 realpath 归一——变体拼写命中 canonical 键） */
  findByWsPath(wsPath: string): RegistryRow | undefined
  /** 按 API 级 projectId 查行（fix-2 一级解析动态化回查面；无值/未命中 → undefined） */
  findByProjectId(projectId: string): RegistryRow | undefined
  /** 全量注册行 */
  list(): readonly RegistryRow[]
}

/** 建注册表（句柄由 open.ts 唯一产出） */
export function createKnowledgeRegistry(db: Database.Database): KnowledgeRegistry {
  const select = db.prepare<[string], { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }>(
    `SELECT ws_path, knowledge_dir, project_id, created_at, updated_at FROM projects WHERE ws_path = ?`,
  )
  const selectByProjectId = db.prepare<[string], { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }>(
    `SELECT ws_path, knowledge_dir, project_id, created_at, updated_at FROM projects WHERE project_id = ?`,
  )
  const listAll = db.prepare<unknown[], { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }>(
    `SELECT ws_path, knowledge_dir, project_id, created_at, updated_at FROM projects ORDER BY ws_path`,
  )
  const upsertStmt = db.prepare(
    `INSERT INTO projects (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ws_path) DO UPDATE SET knowledge_dir = excluded.knowledge_dir,
       project_id = COALESCE(excluded.project_id, projects.project_id),
       updated_at = excluded.updated_at`,
  )

  const toRow = (r: { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }): RegistryRow => ({
    wsPath: r.ws_path,
    knowledgeDir: r.knowledge_dir,
    projectId: r.project_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })

  return {
    upsert(wsPath, knowledgeDir, projectId) {
      const key = canonicalWsPath(wsPath)
      const now = new Date().toISOString()
      withImmediateTransaction(db, () => {
        upsertStmt.run(key, knowledgeDir, projectId ?? null, now, now)
      })
      return toRow(select.get(key)!)
    },
    findByWsPath(wsPath) {
      const row = select.get(canonicalWsPath(wsPath))
      return row === undefined ? undefined : toRow(row)
    },
    findByProjectId(projectId) {
      const row = selectByProjectId.get(projectId)
      return row === undefined ? undefined : toRow(row)
    },
    list() {
      return listAll.all().map(toRow)
    },
  }
}
