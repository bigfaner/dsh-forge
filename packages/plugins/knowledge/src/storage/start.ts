// 自持存储自启（index.ts 装配消费）：按 paths.autoStartDbFile 判定自启（config 显式/
// 宿主数据域锚在场），开库 + 建注册表。双态缝（阶段①迁移任务前）：自持库此时仅作
// 数据面准备，五通道供数仍走 forgeKnowledge 旧服务；开库失败 fail-soft 降级为纯旧服务
// 形态（不阻载插件）——诊断发射面随 §2.3 埋点任务接入（AGENTS §7 禁直落 console）。
import type Database from 'better-sqlite3'
import { openKnowledgeDatabase } from './open.js'
import { autoStartDbFile, type KnowledgeStorageConfig, type KnowledgeStorageEnv } from './paths.js'
import { createKnowledgeRegistry, type KnowledgeRegistry } from './registry.js'

/** 自持存储句柄（装配持有，disposer 调 close） */
export interface SelfHostedStorage {
  readonly db: Database.Database
  readonly registry: KnowledgeRegistry
  close(): void
}

/**
 * 自启入口：锚缺席（裸环境）或开库失败 → undefined（插件以旧服务双态继续）。
 * 成功 → 打开的库 + 注册表面（调用方并入 disposer close）。
 */
export function startSelfHostedStorage(
  config: KnowledgeStorageConfig = {},
  env: KnowledgeStorageEnv = process.env,
): SelfHostedStorage | undefined {
  const file = autoStartDbFile(config, env)
  if (file === undefined) return undefined
  try {
    const db = openKnowledgeDatabase(file)
    return {
      db,
      registry: createKnowledgeRegistry(db),
      close: () => db.close(),
    }
  } catch {
    // fail-soft 双态：自持库缺席不阻载（旧服务在场供数）；失败记账随埋点任务接入
    return undefined
  }
}
