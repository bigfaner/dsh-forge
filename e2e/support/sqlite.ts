// e2e 应用库（state.db）访问面（fix-37 ①⑤ 收编）——openStateDb + MinimalStmt ×4 单源
// + core seed 帮助器转发 + 只读探针。
// 边界口径（fix-37 ⑤ 裁决）：e2e 不再自带私有 schema SQL 拷贝——写面/注入面一律经
// packages/core/src/testutil/db-seeds（core 测试与 e2e 单源）；本文件只保留打开面
// （better-sqlite3 自 packages/core 依赖闭包解析）与只读探针（对账记账断言）。
// busy_timeout = 5000（WAL 活写兼容 app 在场——打开即设，specs 不再逐处 pragma）。
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ROOT } from './launch.js'

export {
  seedProjectRow,
  deleteProjectRowByWsPath,
  deleteProjectRowById,
  driftProjectWorkspaceRef,
  installProjectInsertFailure,
  removeProjectInsertFailure,
  seedWorkspaceIdConflictRow,
  seedUsageEvents,
  clearKnowledgeIndex,
  countReconcileWarnLogs,
  type SeedDb,
} from '../../packages/core/src/testutil/db-seeds.js'

const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))
type SqliteCtor = new (path: string) => import('../../packages/core/src/testutil/db-seeds.js').SeedDb

/** 打开应用库（busy_timeout 预设——WAL 活写兼容 app 在场） */
export function openStateDb(userData: string): import('../../packages/core/src/testutil/db-seeds.js').SeedDb {
  const db = new (requireFromCore('better-sqlite3') as SqliteCtor)(join(userData, 'state.db'))
  db.pragma('busy_timeout = 5000')
  return db
}
