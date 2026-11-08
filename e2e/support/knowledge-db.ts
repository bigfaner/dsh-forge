// e2e 知识面自持库访问面（knowledge-stage1-foundation 1.8——core 知识域退役后 kb 预置
// 通道）：打开 knowledge 插件自持库 + 热度事件预置/索引零行化（recall_logs 携
// project_id；WAL 活写兼容 app 在场）。
// fix-1（v4 schema 对齐）：注册表 projects → knowledge_registry（含 v3 project_id 列）；
// knowledge_entries 改全局 slug id 键（无 ws_path 列）——热度预置按 title 查 rowid
//（recall_logs.entry_id = 新表 rowid——service.ts ENTRY_COLUMNS 同口径），索引零行化
// 按注册行 knowledge_dir 域清 entries/versions/fts（service.projectEntryIds 同口径 JS
// 前缀匹配——两级解析第二级仍走自持注册表 canonical 键）。
// v7 对齐（stage④ 1.3——判例 293aecba/44bd7579：夹具 schema 与实库版本同步升级）：
// DDL v7 = registry.scope + recall_logs 七新列（feedback/feedback_note/feedback_at/
// turn_seq/trigger_snap/score/content_snap）+ ck_krl_verb 四值（search/read-abstract/
// read/browse）。热度终式（SC-5，用户裁决 2026-11-20）= read 1.0、其余动词 0、
// feedback=-1 计 0——热度预置事件 verb 恒 'read'（采纳事件），score 落 1.0。
import { realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ROOT } from './launch.js'
import { resolveKnowledgeDbFile } from '../../packages/plugins/knowledge/src/storage/paths.js'
import type { SeedDb } from '../../packages/core/src/testutil/db-seeds.js'

const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))
type SqliteCtor = new (path: string) => SeedDb

/**
 * 打开 knowledge 插件自持库（路径解析单源 = 插件 storage/paths.ts——e2e 净化态实际落位
 * 为 DSH_HOME 派生 {userData}/dsh-home/knowledge/knowledge.db：main.ts `??=` 缺省隔离注入
 * DSH_HOME、DSH_FORGE_TASKS_HOME 在 e2e 未设；先前误按 tasksHome 派生位开库 = 目录不存在）。
 */
export function openKnowledgeDb(userData: string): SeedDb {
  const file = resolveKnowledgeDbFile(
    {},
    {
      DSH_FORGE_TASKS_HOME: process.env.DSH_FORGE_TASKS_HOME,
      DSH_HOME: join(userData, 'dsh-home'),
    },
  )
  const db = new (requireFromCore('better-sqlite3') as SqliteCtor)(file)
  db.pragma('busy_timeout = 5000')
  return db
}

/**
 * 预置采纳事件 ×count（v7 schema 对齐——条目全局 slug 键，按 title 查 rowid；热度终式
 * read = 1.0 为唯一计热动词——search/read-abstract/browse 过程动词零贡献；条目不在索引 =
 * fail-loud）。score 落 1.0（read 行写径口径）。
 */
export function seedUsageEventsByTitle(
  db: SeedDb,
  o: { readonly projectId: string; readonly entryTitle: string; readonly count: number; readonly domainSnap?: string },
): void {
  const entry = db
    .prepare('SELECT rowid AS id FROM knowledge_entries WHERE title = ?')
    .get(o.entryTitle) as { id: number } | undefined
  if (entry === undefined) throw new Error(`seedUsageEventsByTitle：条目不在索引（${o.entryTitle}）`)
  const insert = db.prepare(
    `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, title_snap, domain_snap, hit_count, score, created_at)
     VALUES (?, ?, 'e2e-seed-session', 'read', ?, ?, ?, 1, 1.0, ?)`,
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

/**
 * 索引零行化（v4——kb 阶段②显式触发重建通道，fact KNOWLEDGE_INDEX_REBUILD 认可载体）：
 * 按注册行 knowledge_dir 域清该项目的 entries/versions/fts 三缓存行（rebuild 白名单同集，
 * 业务账零波及）——countProjectEntries 归零 → listEntries 内联重建。
 */
export function clearKnowledgeIndexByWsPath(db: SeedDb, wsPath: string): void {
  const key = realpathSync(wsPath)
  const row = db
    .prepare('SELECT knowledge_dir FROM knowledge_registry WHERE ws_path = ?')
    .get(key) as { knowledge_dir: string } | undefined
  if (row === undefined) throw new Error(`clearKnowledgeIndexByWsPath：注册行不在表（${key}）`)
  const dir = row.knowledge_dir.replace(/[\\/]+$/, '')
  const versions = db
    .prepare('SELECT id, file_path FROM knowledge_entry_versions')
    .all() as { id: string; file_path: string }[]
  for (const v of versions) {
    if (!v.file_path.startsWith(`${dir}/`) && !v.file_path.startsWith(`${dir}\\`)) continue
    db.prepare('DELETE FROM knowledge_fts WHERE id = ?').run(v.id)
    db.prepare('DELETE FROM knowledge_entry_versions WHERE id = ?').run(v.id)
    db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(v.id)
  }
}

/**
 * 预置自持注册行（v4：knowledge_registry 表——ws_path canonical（realpath）键 + knowledge_dir
 * + project_id 可空列；SQL/键口径镜像 packages/plugins/knowledge/src/storage/registry.ts upsert）。
 * 运行期注册径由服务面承接——e2e 预置通道用于 boot 停机窗落行。
 */
export function seedKnowledgeRegistryRow(db: SeedDb, wsPath: string, knowledgeDir: string): void {
  const key = realpathSync(wsPath)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO knowledge_registry (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(ws_path) DO UPDATE SET knowledge_dir = excluded.knowledge_dir, updated_at = excluded.updated_at`,
  ).run(key, knowledgeDir, now, now)
}

/** YAML 双引号标量转义（boot overlay 同口径——路径含反斜杠/冒号） */
function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * knowledge 插件 config.projects 静态绑定叠层（DSH_FORGE_PATCH_FILES → launchHost overlay
 * 消费）：两级解析第一级（Q19 纯 config 静态注入口径）的 e2e 注入口。projectId 为运行期
 * 注册产物（uuid）——须注册后经携带绑定的下一次 boot 生效（patch 行按 row id 整体替换
 * config，与 boot overlay core 行同缝）。返回路径供调用侧 finally 清理。
 */
export function writeKnowledgeBindingsOverlay(
  bindings: readonly { readonly wsPath: string; readonly projectId: string }[],
): string {
  const target = join(tmpdir(), `dsh-forge-e2e-kn-bindings-${process.pid}-${Math.random().toString(36).slice(2, 8)}.yml`)
  const lines = [
    '# e2e knowledge 绑定叠层：config.projects 静态注入（Q19 口径——运行期注册 uuid 经叠层携带）',
    '- id: dsh-forge-knowledge',
    '  config:',
    '    projects:',
  ]
  for (const b of bindings) {
    lines.push(`      - wsPath: ${yamlQuote(b.wsPath)}`, `        projectId: ${yamlQuote(b.projectId)}`)
  }
  writeFileSync(target, `${lines.join('\n')}\n`, 'utf8')
  return target
}
