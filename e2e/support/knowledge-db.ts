// e2e 知识面自持库访问面（knowledge-stage1-foundation 1.8——core 知识域退役后 kb 预置
// 通道）：打开 knowledge 插件自持库 + 热度事件预置/索引零行化（entries 按 ws_path 键、
// recall_logs 携 project_id——插件 schema 口径；WAL 活写兼容 app 在场）。
// fix-1（1.13 收口）：注册行预置 + config.projects 绑定叠层——A2 后两级解析
// （projectId→wsPath 走 config.projects 纯静态注入（Q19），wsPath→注册行走自持注册表）
// 对 e2e 运行期注册项目两头皆空，供数恒 fail（「项目不存在」）；预置正道 = 自持库落
// 注册行（ws_path canonical 键——registry.ts 同口径 SQL）+ boot 外部叠层携带绑定表
// （projectId uuid 运行期产物，静态 config 须在已知 uuid 后经第二次 boot 注入）。
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

/**
 * 预置自持注册行（projects 表——ws_path canonical（realpath）键 + knowledge_dir 列；
 * SQL/键口径镜像 packages/plugins/knowledge/src/storage/registry.ts upsert）。
 * 1.8 后新注册项目的注册行进表径现仅种子迁移——e2e 预置通道由此承接。
 */
export function seedKnowledgeRegistryRow(db: SeedDb, wsPath: string, knowledgeDir: string): void {
  const key = realpathSync(wsPath)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (ws_path, knowledge_dir, created_at, updated_at) VALUES (?, ?, ?, ?)
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
