// 自持存储自启（index.ts 装配消费）：按 paths.autoStartDbFile 判定自启（config 显式/
// 宿主数据域锚在场），开库 + 建注册表 + 首启轻量种子迁移（migrate.ts——旧库只读、幂等、
// 失败不阻载）。开库失败 fail-soft 降级（不阻载插件）；迁移埋点经装配期注入的诊断发射面
// （diag.ts——AGENTS §7 禁直落 console）。
import type Database from 'better-sqlite3'
import { openKnowledgeDatabase } from './open.js'
import { autoStartDbFile, type KnowledgeStorageConfig, type KnowledgeStorageEnv } from './paths.js'
import { createKnowledgeRegistry, type KnowledgeRegistry } from './registry.js'
import { runSeedMigration, type SeedMigrationResult } from './migrate.js'
import { emitStorageDiag, storageDiag, type DiagEmitter } from './diag.js'

/** 自持存储句柄（装配持有，disposer 调 close） */
export interface SelfHostedStorage {
  readonly db: Database.Database
  readonly registry: KnowledgeRegistry
  /** 首启种子迁移终态（诊断/测试消费；自启缺席 = undefined） */
  readonly migration: SeedMigrationResult | undefined
  close(): void
}

/** 自启入参（emit = 装配期注入诊断发射面——缺席走 diag.ts 兜底） */
export interface StartSelfHostedStorageOptions extends KnowledgeStorageConfig {
  readonly emit?: DiagEmitter
  readonly env?: KnowledgeStorageEnv
}

/**
 * 自启入口：锚缺席（裸环境）或开库失败 → undefined（fail-soft 不阻载）。
 * 成功 → 打开的库 + 注册表面 + 种子迁移终态（调用方并入 disposer close）。
 */
export function startSelfHostedStorage(
  config: StartSelfHostedStorageOptions = {},
  env: KnowledgeStorageEnv = process.env,
): SelfHostedStorage | undefined {
  const file = autoStartDbFile(config, env)
  if (file === undefined) return undefined
  try {
    const db = openKnowledgeDatabase(file)
    let migration: SeedMigrationResult | undefined
    try {
      migration = runSeedMigration(db, { legacyStateDb: config.legacyStateDb, emit: config.emit })
    } catch (cause) {
      // 迁移面意外异常兜底记账（不静默）；不阻载——自持库照常交出
      emitStorageDiag(
        config.emit,
        storageDiag('error', 'knowledge-migrate', `种子迁移意外异常：${String(cause)}`, {
          stack: cause instanceof Error ? cause.stack : undefined,
        }),
      )
      migration = undefined
    }
    return {
      db,
      registry: createKnowledgeRegistry(db),
      migration,
      close: () => db.close(),
    }
  } catch (cause) {
    // fail-soft：自持库缺席不阻载（双态供数兜底）；开库失败不静默——error 级记账
    emitStorageDiag(
      config.emit,
      storageDiag('error', 'knowledge-migrate', `自持库开库失败：${String(cause)}`, {
        stack: cause instanceof Error ? cause.stack : undefined,
      }),
    )
    return undefined
  }
}
