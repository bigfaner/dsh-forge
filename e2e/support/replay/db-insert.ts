// 5.1 备选通道：forge.db 直插（AC2——core testutil 形制，e2e/support/sqlite.ts 先例扩展）。
// 用途（tech-design §录制-回放）：@500 造数（5.3 SC2 性能面）与不可经动词构造的受控
// 初态（漂移/隔离场景）——主径（测试钩子动词直调）之外的数据注入面。
// 形制纪律（fix-37 ⑤ 同口径——e2e 不带私有 schema SQL 拷贝）：
//   · 打开/建库/迁移一律经 core openDatabase + WORKSPACE_MIGRATIONS 参数化传入
//     （独立版本线 FORGE_DB_SCHEMA_VERSION——与 ForgeWorkspaceStore.ensureOpen 同链）；
//   · 派生目录 = core deriveTaskStoreDir 单源（{tasksHome}/{flatten}@{hash8}）；
//   · 种行 = core forge/tasks harness 同源助手（seedFeature/seedTask/seedEdge/seedLink/
//     seedRecord 再导出）+ 本文件补位 seedProposalRow（core 侧无私共享 seeder——
//     small-domains/proposals.test 私有函数同构）。
// 活写兼容：busy_timeout = 5000（WAL——app 在场并发开库同口径，openStateDb 先例）。
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '../../../packages/core/src/db/index.js'
import { deriveTaskStoreDir } from '../../../packages/core/src/forge/workspace/derive-dir.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from '../../../packages/core/src/forge/workspace/migrations.js'
import { seedEdge, seedFeature, seedLink, seedRecord, seedTask } from '../../../packages/core/src/forge/tasks/harness.js'

export { seedEdge, seedFeature, seedLink, seedRecord, seedTask }

/** 工作区任务库文件路径（{tasksHome}/{flatten}@{hash8}/forge.db——deriveDir 单源消费） */
export function forgeDbPath(tasksHome: string, workspaceDir: string): string {
  return join(deriveTaskStoreDir(tasksHome, workspaceDir), 'forge.db')
}

/**
 * 打开（缺席则建库+迁移）工作区任务库——与 app 内 ForgeWorkspaceStore.ensureOpen 同链
 * （openDatabase + 工作区迁移序列）；busy_timeout 预设（WAL 活写兼容 app 在场）。
 * e2e 消费：注册后直插造数 / 未注册场景的预置库。
 */
export function openForgeDb(tasksHome: string, workspaceDir: string): Database.Database {
  return openForgeDbAt(deriveTaskStoreDir(tasksHome, workspaceDir))
}

/**
 * 按已解析派生目录打开工作区任务库（e2e 主消费面：目录取自产品面单源
 * `forge:projects/deriveTaskStoreDir` 返回体——注册路径 canonical 化与夹具路径拼写
 * 差异不进入 hash 面；同链 openDatabase 幂等——已建库不重迁移）。
 */
export function openForgeDbAt(dir: string): Database.Database {
  const db = openDatabase(join(dir, 'forge.db'), {
    migrations: WORKSPACE_MIGRATIONS,
    schemaVersion: FORGE_DB_SCHEMA_VERSION,
  })
  db.pragma('busy_timeout = 5000')
  return db
}

/** proposals 种行（受控初值——身份与名称分离：id 返回，slug 可撞查询面） */
export function seedProposalRow(
  db: Database.Database,
  o: {
    readonly slug: string
    readonly title?: string
    readonly status?: string
    readonly relPath?: string | null
    readonly author?: string | null
    readonly decidedAt?: string | null
    readonly createdAt?: string
  },
): string {
  const id = `pr-${o.slug}`
  const ts = o.createdAt ?? '2026-01-01T00:00:00.000Z'
  db.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, rel_path, author, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    o.slug,
    o.title ?? `提案 ${o.slug}`,
    o.status ?? 'draft',
    o.relPath ?? null,
    o.author ?? null,
    o.decidedAt ?? null,
    ts,
    ts,
  )
  return id
}
