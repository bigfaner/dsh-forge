// e2e 知识面自持库访问面（knowledge-stage1-foundation 1.8——core 知识域退役后 kb 预置
// 通道）：打开 knowledge 插件自持库 + 热度事件预置/索引零行化（entries 按 ws_path 键、
// recall_logs 携 project_id——插件 schema 口径；WAL 活写兼容 app 在场）。
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ROOT } from './launch.js'
import type { SeedDb } from '../../packages/core/src/testutil/db-seeds.js'

const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))
type SqliteCtor = new (path: string) => SeedDb

/** 打开 knowledge 插件自持库（{userData}/knowledge/knowledge.db——DSH_FORGE_TASKS_HOME 派生数据域缺省位） */
export function openKnowledgeDb(userData: string): SeedDb {
  const db = new (requireFromCore('better-sqlite3') as SqliteCtor)(join(userData, 'knowledge', 'knowledge.db'))
  db.pragma('busy_timeout = 5000')
  return db
}

/** 预置使用事件 ×count（entries 按 canonical ws_path 查条目；条目不在索引 = fail-loud） */
export function seedUsageEventsByWsPath(
  db: SeedDb,
  o: { readonly wsPath: string; readonly projectId: string; readonly entryTitle: string; readonly count: number; readonly domainSnap?: string },
): void {
  const entry = db
    .prepare('SELECT id FROM knowledge_entries WHERE ws_path = ? AND title = ?')
    .get(o.wsPath, o.entryTitle) as { id: number } | undefined
  if (entry === undefined) throw new Error(`seedUsageEventsByWsPath：条目不在索引（${o.entryTitle}）`)
  const insert = db.prepare(
    `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, title_snap, domain_snap, hit_count, created_at)
     VALUES (?, ?, 'e2e-seed-session', 'search', ?, ?, ?, 1, ?)`,
  )
  for (let i = 0; i < o.count; i++) {
    insert.run(
      o.projectId,
      `e2e-seed-call-${i}`,
      entry.id,
      o.entryTitle,
      o.domainSnap ?? '前端',
      new Date().toISOString(),
    )
  }
}

/** 索引零行化（kb 阶段②显式触发重建通道——fact KNOWLEDGE_INDEX_REBUILD 认可载体） */
export function clearKnowledgeIndexByWsPath(db: SeedDb, wsPath: string): void {
  db.prepare('DELETE FROM knowledge_entries WHERE ws_path = ?').run(wsPath)
}
