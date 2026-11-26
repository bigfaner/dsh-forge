// e2e 应用库（state.db）访问面（fix-37 ①⑤ 收编）——openStateDb + MinimalStmt ×4 单源
// + core seed 帮助器转发 + 只读探针。
// 边界口径（fix-37 ⑤ 裁决）：e2e 不再自带私有 schema SQL 拷贝——写面/注入面一律经
// packages/core/src/testutil/db-seeds（core 测试与 e2e 单源）；本文件只保留打开面
// （better-sqlite3 自 packages/core 依赖闭包解析）与只读探针（对账记账断言）。
// busy_timeout = 5000（WAL 活写兼容 app 在场——打开即设，specs 不再逐处 pragma）。
// fix-2（8.10 e2e 阻塞修复）：@dsh-forge/lib-db exports 的 "." 仅 import 条件（ESM-only，
// packages/core/node_modules junction → lib/db 重结构后 exports 门收紧）——CJS
// createRequire 报 ERR_PACKAGE_PATH_NOT_EXPORTED。改静态 ESM import（根仓 type=module，
// Playwright 以 ESM 加载 e2e 支撑面，与包导出形态一致）。
import DatabaseDefault from '@dsh-forge/lib-db'
import { join } from 'node:path'

export {
  seedProjectRow,
  deleteProjectRowByWsPath,
  deleteProjectRowById,
  driftProjectWorkspaceRef,
  installProjectInsertFailure,
  removeProjectInsertFailure,
  seedWorkspaceIdConflictRow,
  countReconcileWarnLogs,
  type SeedDb,
} from '../../packages/core/src/testutil/db-seeds.js'

type SqliteCtor = new (path: string) => import('../../packages/core/src/testutil/db-seeds.js').SeedDb
const SqliteDatabase = DatabaseDefault as unknown as SqliteCtor

/** 打开应用库（busy_timeout 预设——WAL 活写兼容 app 在场） */
export function openStateDb(userData: string): import('../../packages/core/src/testutil/db-seeds.js').SeedDb {
  const db = new SqliteDatabase(join(userData, 'state.db'))
  db.pragma('busy_timeout = 5000')
  return db
}

/** 打开 task-loop 域库（{userData}/dsh-home/forge/db/task-loop/task-loop.db——域写点单源
 *  落点，plugins/task-loop host/db/connection.ts dshHome 派生同径；只读断言消费） */
export function openTaskLoopDb(userData: string): import('../../packages/core/src/testutil/db-seeds.js').SeedDb {
  const db = new SqliteDatabase(
    join(userData, 'dsh-home', 'forge', 'db', 'task-loop', 'task-loop.db'),
  )
  db.pragma('busy_timeout = 5000')
  return db
}

/** 打开 task-loop 域库（全量 better-sqlite3 形态——事务 + 泛型 prepare 的账本断言消费面；
 *  只读探针 + 受控初态直插两用，busy_timeout 预设同上） */
export function openTaskLoopDbFull(userData: string): import('@dsh-forge/lib-db').Database {
  const db = new (DatabaseDefault as unknown as new (path: string) => import('@dsh-forge/lib-db').Database)(
    join(userData, 'dsh-home', 'forge', 'db', 'task-loop', 'task-loop.db'),
  )
  db.pragma('busy_timeout = 5000')
  return db
}
