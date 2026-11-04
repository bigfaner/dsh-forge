// 轻量种子迁移（A2，裁决 2026-11-19：存量实测定向）：旧 core state.db → 自持库。
// · 注册行 = 唯一必迁种子（projects.knowledge_dir 全量 → 自持注册表，wsPath canonical
//   化后逐条落行，单事务零半行）；entries 零迁（首用 rebuild 再生——rebuild.ts）；
//   recall_logs best-effort 整体拷贝（失败跳过 + diag 记账——热度史丢失已裁可接受）。
// · 不建冻结只读校验/逐行校验/FK 重映射/回退演练机械；旧表删除归 core 退役任务。
// · 旧库只读打开（readonly 连接——零写回由连接属性承载）；幂等：seed_migration 标记行
//   在场即整体跳过（二次启动零迁移零事件）。
// · 时序 = proposal §2.2：start → 注册行里程碑 → recall（best-effort）→ cutover。
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { withImmediateTransaction } from './concurrency.js'
import { canonicalWsPath } from './registry.js'
import { KNOWLEDGE_MIGRATE_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from './diag.js'

/** 迁移入参（legacyStateDb = config 注入的旧 state.db 路径；emit = 诊断发射面） */
export interface SeedMigrationOptions {
  readonly legacyStateDb?: string
  readonly emit?: DiagEmitter
}

/** 迁移终态（ skipped-* = 常规路径零迁移；migrated = 完整成功；recall-degraded = 注册行完整 + recall 跳过） */
export type SeedMigrationStatus =
  | 'skipped-absent' // 未注入 / 文件不存在（CT-2：无事件常规路径）
  | 'skipped-unreadable' // 文件在场但开库/读注册行失败（跳过 + warn——不中断启动）
  | 'skipped-empty' // 旧库零注册行（CT-2 boundary：判定条件不满足，无事件）
  | 'skipped-done' // 标记行在场（幂等：二次启动零事件零行变更）
  | 'migrated'
  | 'recall-degraded'
  | 'registry-failed' // 必迁种子写失败（fail 事件；注册表零半行，下次启动重试）

export interface SeedMigrationResult {
  readonly status: SeedMigrationStatus
  readonly registryRows: number
  readonly recallRows: number
}

/** recall_logs 拷贝列集（core knowledge_recall_logs 全列快照——id 自增重排，行数等价口径） */
interface LegacyRecallRow {
  readonly project_id: string
  readonly call_id: string
  readonly session_id: string
  readonly verb: string
  readonly entry_id: number | null
  readonly frontmatter_id: string | null
  readonly title_snap: string | null
  readonly domain_snap: string | null
  readonly query_json: string | null
  readonly hit_count: number
  readonly duration_ms: number | null
  readonly created_at: string
}

/**
 * 种子迁移入口（startSelfHostedStorage 首启消费）：按 §2.2 时序执行；一切跳过/失败
 * 路径均有对应诊断事件或属 CT-2 静默常规路径（未注入/零注册行——非失败，无静默失败）。
 */
export function runSeedMigration(
  db: Database.Database,
  opts: SeedMigrationOptions = {},
): SeedMigrationResult {
  if (opts.legacyStateDb === undefined || opts.legacyStateDb.trim() === '') {
    return { status: 'skipped-absent', registryRows: 0, recallRows: 0 }
  }
  const source = resolve(opts.legacyStateDb)
  if (!existsSync(source)) {
    return { status: 'skipped-absent', registryRows: 0, recallRows: 0 }
  }
  const done = db
    .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM seed_migration WHERE source = ?`)
    .get(source)
  if (done !== undefined && done.n > 0) {
    return { status: 'skipped-done', registryRows: 0, recallRows: 0 }
  }

  // 旧库只读打开（零写回——readonly 连接属性承载）
  let legacy: Database.Database
  try {
    legacy = new Database(source, { readonly: true })
  } catch (cause) {
    emitStorageDiag(
      opts.emit,
      storageDiag('warn', KNOWLEDGE_MIGRATE_EVENT, `旧库只读打开失败，跳过种子迁移：${String(cause)}`, {
        cwd: source,
      }),
    )
    return { status: 'skipped-unreadable', registryRows: 0, recallRows: 0 }
  }

  try {
    let legacyProjects: { ws_path: string; knowledge_dir: string }[]
    try {
      legacyProjects = legacy
        .prepare<unknown[], { ws_path: string; knowledge_dir: string }>(
          `SELECT ws_path, knowledge_dir FROM projects`, // 旧 core 库表名（现役正本）——非自持库 v4 改名面
        )
        .all()
    } catch (cause) {
      // 旧库可开但注册行读失败（损坏/锁）——跳过 + warn 记账，不中断启动
      emitStorageDiag(
        opts.emit,
        storageDiag('warn', KNOWLEDGE_MIGRATE_EVENT, `旧库注册行读取失败，跳过种子迁移：${String(cause)}`, {
          cwd: source,
        }),
      )
      return { status: 'skipped-unreadable', registryRows: 0, recallRows: 0 }
    }
    if (legacyProjects.length === 0) {
      return { status: 'skipped-empty', registryRows: 0, recallRows: 0 }
    }

    emitStorageDiag(
      opts.emit,
      storageDiag('info', KNOWLEDGE_MIGRATE_EVENT, `种子迁移开始：注册行 ${legacyProjects.length} 行`, {
        cwd: source,
        projectCount: legacyProjects.length,
      }),
    )

    // ①注册行种子：canonical 化后逐条落自持注册表（单事务——中途失败零半行回滚）
    const upsert = db.prepare(
      `INSERT INTO knowledge_registry (ws_path, knowledge_dir, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(ws_path) DO UPDATE SET knowledge_dir = excluded.knowledge_dir, updated_at = excluded.updated_at`,
    )
    try {
      withImmediateTransaction(db, () => {
        for (const row of legacyProjects) {
          const key = canonicalWsPath(row.ws_path)
          const now = new Date().toISOString()
          upsert.run(key, row.knowledge_dir, now, now)
        }
      })
    } catch (cause) {
      emitStorageDiag(
        opts.emit,
        storageDiag('error', KNOWLEDGE_MIGRATE_EVENT, `注册行种子写失败：${String(cause)}`, {
          cwd: source,
          projectCount: legacyProjects.length,
          stack: cause instanceof Error ? cause.stack : undefined,
        }),
      )
      return { status: 'registry-failed', registryRows: 0, recallRows: 0 }
    }

    emitStorageDiag(
      opts.emit,
      storageDiag('info', KNOWLEDGE_MIGRATE_EVENT, `注册行种子完成：${legacyProjects.length} 行`, {
        cwd: source,
        projectCount: legacyProjects.length,
      }),
    )

    // ②recall_logs best-effort 整体拷贝：失败跳过 + warn 记账（不中断——热度史丢失已裁可接受）
    let recallRows = 0
    let recallCopied = false
    try {
      const legacyRecall = legacy.prepare<unknown[], LegacyRecallRow>(
        `SELECT project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap,
                domain_snap, query_json, hit_count, duration_ms, created_at
         FROM knowledge_recall_logs ORDER BY id`,
      )
      const rows = legacyRecall.all()
      const insertRecall = db.prepare(
        `INSERT INTO knowledge_recall_logs (
           project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap,
           domain_snap, query_json, hit_count, duration_ms, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      // 整体替换式拷贝（幂等：崩溃重跑先清后拷，零重复行）+ 标记行同事务落账
      withImmediateTransaction(db, () => {
        db.prepare(`DELETE FROM knowledge_recall_logs`).run()
        for (const r of rows) {
          insertRecall.run(
            r.project_id,
            r.call_id,
            r.session_id,
            r.verb,
            r.entry_id,
            r.frontmatter_id,
            r.title_snap,
            r.domain_snap,
            r.query_json,
            r.hit_count,
            r.duration_ms,
            r.created_at,
          )
        }
        db.prepare(
          `INSERT INTO seed_migration (source, migrated_at, registry_rows, recall_rows)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(source) DO UPDATE SET migrated_at = excluded.migrated_at, recall_rows = excluded.recall_rows`,
        ).run(source, new Date().toISOString(), legacyProjects.length, rows.length)
      })
      recallRows = rows.length
      recallCopied = true
    } catch (cause) {
      emitStorageDiag(
        opts.emit,
        storageDiag(
          'warn',
          KNOWLEDGE_MIGRATE_EVENT,
          `recall_logs 拷贝段失败，跳过（热度史丢失——已裁可接受）：${String(cause)}`,
          { cwd: source, stack: cause instanceof Error ? cause.stack : undefined },
        ),
      )
      // 注册行完整性优先：标记行仍落账（recall 缺席口径）
      withImmediateTransaction(db, () => {
        db.prepare(
          `INSERT INTO seed_migration (source, migrated_at, registry_rows, recall_rows)
           VALUES (?, ?, ?, 0)
           ON CONFLICT(source) DO UPDATE SET migrated_at = excluded.migrated_at`,
        ).run(source, new Date().toISOString(), legacyProjects.length)
      })
    }

    // ③entries 不迁（零行——首用 rebuild 再生）→ cutover
    emitStorageDiag(
      opts.emit,
      storageDiag(
        'info',
        KNOWLEDGE_MIGRATE_EVENT,
        `种子迁移 cutover：注册行 ${legacyProjects.length}、recall_logs ${recallRows}${recallCopied ? '' : '（跳过）'}、entries 零迁`,
        { cwd: source, projectCount: legacyProjects.length },
      ),
    )
    return {
      status: recallCopied ? 'migrated' : 'recall-degraded',
      registryRows: legacyProjects.length,
      recallRows,
    }
  } finally {
    legacy.close()
  }
}
