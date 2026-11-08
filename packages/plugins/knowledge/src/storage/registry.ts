// 自持注册表（A2 第二弹）：wsPath canonical（realpath 归一）为键、knowledge_dir 列。
// 路径归一含 realpath 维（判例 c773c09f——sessionCreate cwd 仅盘符/大小写归一会漂移：
// 注册表键必须 realpath 化，不可只走 path-key normalizeFsPath 比对口径）。
// 写路径 = BEGIN IMMEDIATE 短事务 upsert（并发纪律见 concurrency.ts）；读路径直读。
// config 静态注入（KnowledgePluginConfig.projects 绑定表）为另一径——本表是注册行
// 读写径（种子迁移任务自此承接 core projects.knowledge_dir）。
import { mkdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from './concurrency.js'
import { KNOWLEDGE_REGISTER_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from './diag.js'

/** 注册行（knowledge_registry 表行投影——v4 由 projects 改名；projectId 可空——v3 前行/种子迁移行无值） */
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

// ── 全局库（stage④ 1.4 SC-1）：ws_path = canonical(<data>/knowledge-global/)——
// 常量导出（knowledge_domains 与 rebuild 逐注册行扫描的关联键同源） ──

/** 全局库目录段（宿主数据域根下的固定子目录） */
export const KNOWLEDGE_GLOBAL_DIR_SEGMENT = 'knowledge-global'

/** 全局库 ws_path/knowledge_dir 派生：<data>/knowledge-global/（canonical 化在注册时点做） */
export function globalKnowledgeDir(dataRoot: string): string {
  return resolve(dataRoot, KNOWLEDGE_GLOBAL_DIR_SEGMENT)
}

/** 全局行注册终态 */
export type GlobalRegisterOutcome = 'registered' | 'exists' | 'nested-conflict' | 'unwritable'

/** 注册表读写面（工厂内一次性构造 prepared 语句，方法零再准备） */
export interface KnowledgeRegistry {
  /** 注册/更新（wsPath realpath 归一后 upsert；返回落库行。projectId 缺席 = 保留既有列值——种子迁移等不洗掉动态注册值） */
  upsert(wsPath: string, knowledgeDir: string, projectId?: string): RegistryRow
  /** 按键查行（入参同样 realpath 归一——变体拼写命中 canonical 键） */
  findByWsPath(wsPath: string): RegistryRow | undefined
  /** 按 API 级 projectId 查行（fix-2 一级解析动态化回查面；无值/未命中 → undefined） */
  findByProjectId(projectId: string): RegistryRow | undefined
  /**
   * 注销注册行（v6 应用层级联——全库零 FK 口径下手删，提案 §2.2）：单事务删
   * knowledge_registry 行 + 该 ws_path 全部 knowledge_domains 域行；返回行是否曾存在。
   */
  remove(wsPath: string): boolean
  /** 全量注册行 */
  list(): readonly RegistryRow[]
  /**
   * 全局库装配期自启注册（SC-1——幂等，boot 时序先于服务消费——判例 5e5592dc）：
   * · 目录不可写（mkdir/写探针失败）→ fail-soft 'unwritable' + warn 埋点，不阻断装配；
   * · 互不嵌套校验：全局目录与任一既有项目 knowledge_dir 前缀嵌套 → 'nested-conflict'
   *   + warn 埋点跳过（不覆盖既有注册）；
   * · 键已存在（含手动注册变体拼写收敛）→ 'exists'（ON CONFLICT DO NOTHING 语义，
   *   knowledge_dir 不一致时 warn 埋点）；
   * · 否则 INSERT … ON CONFLICT(ws_path) DO NOTHING 落行 → 'registered' + info 埋点。
   */
  registerGlobalIfAbsent(knowledgeDir: string, emit?: DiagEmitter): GlobalRegisterOutcome
}

/** 建注册表（句柄由 open.ts 唯一产出） */
export function createKnowledgeRegistry(db: Database.Database): KnowledgeRegistry {
  const select = db.prepare<[string], { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }>(
    `SELECT ws_path, knowledge_dir, project_id, created_at, updated_at FROM knowledge_registry WHERE ws_path = ?`,
  )
  const selectByProjectId = db.prepare<[string], { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }>(
    `SELECT ws_path, knowledge_dir, project_id, created_at, updated_at FROM knowledge_registry WHERE project_id = ?`,
  )
  const listAll = db.prepare<unknown[], { ws_path: string; knowledge_dir: string; project_id: string | null; created_at: string; updated_at: string }>(
    `SELECT ws_path, knowledge_dir, project_id, created_at, updated_at FROM knowledge_registry ORDER BY ws_path`,
  )
  const upsertStmt = db.prepare(
    `INSERT INTO knowledge_registry (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ws_path) DO UPDATE SET knowledge_dir = excluded.knowledge_dir,
       project_id = COALESCE(excluded.project_id, knowledge_registry.project_id),
       updated_at = excluded.updated_at`,
  )
  const insertGlobalStmt = db.prepare(
    `INSERT INTO knowledge_registry (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ws_path) DO NOTHING`,
  )

  /** 前缀嵌套判定（双分隔符口径——collectEntryIdsUnderDir 同形）：a 严格处于 b 目录树下 */
  function nestedIn(a: string, b: string): boolean {
    const na = a.replace(/[\\/]+$/, '')
    const nb = b.replace(/[\\/]+$/, '')
    return na.startsWith(`${nb}\\`) || na.startsWith(`${nb}/`)
  }

  /** 目录可写探针：递归建 + 临时文件写删（mkdir 成功不代表可写——探针为准）；失败 = false */
  function writableProbe(dir: string): boolean {
    try {
      mkdirSync(dir, { recursive: true })
      const probe = resolve(dir, '.knowledge-global-probe')
      writeFileSync(probe, 'probe', 'utf8')
      unlinkSync(probe)
      return true
    } catch {
      return false
    }
  }

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
    remove(wsPath) {
      const key = canonicalWsPath(wsPath)
      return withImmediateTransaction(db, () => {
        db.prepare(`DELETE FROM knowledge_domains WHERE ws_path = ?`).run(key)
        return db.prepare(`DELETE FROM knowledge_registry WHERE ws_path = ?`).run(key).changes > 0
      })
    },
    list() {
      return listAll.all().map(toRow)
    },
    registerGlobalIfAbsent(knowledgeDir, emit) {
      if (!writableProbe(knowledgeDir)) {
        emitStorageDiag(
          emit,
          storageDiag('warn', KNOWLEDGE_REGISTER_EVENT, `全局库目录不可写，注册跳过（fail-soft 不阻载）：${knowledgeDir}`),
        )
        return 'unwritable'
      }
      const key = canonicalWsPath(knowledgeDir)
      // 互不嵌套校验：与任一既有注册行 knowledge_dir 前缀嵌套 → 跳过（warn 埋点可观测）
      const existing = listAll.all()
      if (existing.some((r) => nestedIn(key, r.knowledge_dir) || nestedIn(r.knowledge_dir, key))) {
        emitStorageDiag(
          emit,
          storageDiag('warn', KNOWLEDGE_REGISTER_EVENT, `全局库目录与既有注册行互嵌套，注册跳过：${knowledgeDir}`),
        )
        return 'nested-conflict'
      }
      const now = new Date().toISOString()
      const changes = withImmediateTransaction(db, () =>
        insertGlobalStmt.run(key, knowledgeDir, null, now, now).changes,
      )
      if (changes === 0) {
        const row = select.get(key)
        if (row !== undefined && row.knowledge_dir !== knowledgeDir) {
          emitStorageDiag(
            emit,
            storageDiag('warn', KNOWLEDGE_REGISTER_EVENT, `全局库注册行已存在且 knowledge_dir 不一致，保留既有行：${row.knowledge_dir}`),
          )
        }
        return 'exists'
      }
      emitStorageDiag(
        emit,
        storageDiag('info', KNOWLEDGE_REGISTER_EVENT, `全局库注册行落表：${key}`, { cwd: key }),
      )
      return 'registered'
    },
  }
}
