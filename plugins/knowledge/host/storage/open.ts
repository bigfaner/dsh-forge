// 自持库初始化（open 唯一落点）：库目录创建显式权限位（判例 cd85fde5——mkdir 随 umask
// 可落 700，须显式 chmod）+ 开库/版本线/迁移一律经 lib/db openDatabase 单源配方（WAL +
// busy_timeout + foreign_keys 三参数逐连接，I4 回读断言不达即拒开）+ 分域版本线（bug
// 34645ce2——版本门只判读 knowledge 域线、版本行按域写，共库形态下异域行零触碰；单装
// 自持库行为零变化）。短事务纪律由 concurrency.ts withImmediateTransaction 承载（写入面单点）。
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '@dsh-forge/lib-db'
import { KNOWLEDGE_DB_SCHEMA_DOMAIN, STORAGE_MIGRATIONS, STORAGE_SCHEMA_VERSION } from './schema.js'

/** 库目录显式权限位（不随 umask——判例 cd85fde5） */
export const KNOWLEDGE_DB_DIR_MODE = 0o755

/** 库目录确保 + 显式权限（mkdir recursive 后 chmod——umask 不可依赖） */
export function ensureKnowledgeDbDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  chmodSync(dir, KNOWLEDGE_DB_DIR_MODE)
}

/**
 * 打开（或创建）自持知识库（lib/db openDatabase 单源——分域版本线配方与 fix-3 task-loop
 * 同源，防第四个消费域再发同族）：
 * - 目录显式权限位（cd85fde5）；
 * - WAL + busy_timeout(BUSY_TIMEOUT_MS) + foreign_keys（lib/db 随连接设置，I4 回读断言）；
 * - 版本门（分域）：knowledge 域线 version 超出 STORAGE_SCHEMA_VERSION → 拒开
 *   （UnsupportedSchemaVersionError，句柄已关）；空库/落后 → 依序单事务应用待补迁移
 *   （每版落 knowledge 域版本行 + 指纹行）——打开幂等。
 */
export function openKnowledgeDatabase(file: string): Database.Database {
  ensureKnowledgeDbDir(dirname(file))
  return openDatabase(file, {
    migrations: STORAGE_MIGRATIONS,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    domain: KNOWLEDGE_DB_SCHEMA_DOMAIN,
  })
}
