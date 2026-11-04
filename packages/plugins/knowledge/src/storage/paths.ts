// 自持库路径解析（裁决① 2026-11-19）：单文件应用级库——config 可配路径；缺省按宿主
// 数据域子目录（插件域派生，dsh desktop / dsh-forge 两形态可用）：
//   · dsh-forge 形态：env DSH_FORGE_TASKS_HOME（= {userData}/forge-workspaces）非空 →
//     数据域根 = dirname（userData）→ {数据域}/knowledge/knowledge.db；
//   · dsh desktop 形态：DSH_HOME（宿主 main.ts `??=` 恒注入）→ {DSH_HOME}/knowledge/knowledge.db；
//   · 兜底：~/.dsh（expert-squad resolveUserExpertsRoot 同构口径）。
// 路径归一含 realpath 维（判例 c773c09f）：注册表键归一见 registry.ts canonicalWsPath——
// 本文件只做缺省派生，不做比对归一（normalizeFsPath 仅盘符/大小写维度，落库键须 realpath）。
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { joinDirSegment } from '@dsh-forge/path-key'

/** 插件域子目录段（宿主数据域下的 knowledge 子目录） */
export const KNOWLEDGE_DATA_DIR_SEGMENT = 'knowledge'

/** 库文件名（单文件应用级库——全表同库） */
export const KNOWLEDGE_DB_FILE_NAME = 'knowledge.db'

/** 宿主环境锚子面（process.env 结构兼容——注入以便测试） */
export interface KnowledgeStorageEnv {
  readonly DSH_FORGE_TASKS_HOME?: string
  readonly DSH_HOME?: string
}

/** config 可配路径子面（KnowledgePluginConfig 存储子域结构兼容） */
export interface KnowledgeStorageConfig {
  readonly dbFile?: string
  /** 旧 core state.db 路径（种子迁移源——config 注入；缺席 = 常规路径零迁移） */
  readonly legacyStateDb?: string
}

function nonEmpty(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim() !== ''
}

/** 缺省数据域根：DSH_FORGE_TASKS_HOME > DSH_HOME > ~/.dsh（两宿主形态 + 兜底） */
export function resolveKnowledgeDataRoot(env: KnowledgeStorageEnv = process.env): string {
  if (nonEmpty(env.DSH_FORGE_TASKS_HOME)) return dirname(env.DSH_FORGE_TASKS_HOME as string)
  if (nonEmpty(env.DSH_HOME)) return env.DSH_HOME as string
  return joinDirSegment(homedir(), '.dsh')
}

/** 库文件完整解析：config.dbFile 显式优先；缺省 = 数据域根/knowledge/knowledge.db */
export function resolveKnowledgeDbFile(
  config: KnowledgeStorageConfig = {},
  env: KnowledgeStorageEnv = process.env,
): string {
  if (nonEmpty(config.dbFile)) return resolve(config.dbFile as string)
  return joinDirSegment(
    joinDirSegment(resolveKnowledgeDataRoot(env), KNOWLEDGE_DATA_DIR_SEGMENT),
    KNOWLEDGE_DB_FILE_NAME,
  )
}

/**
 * 自启判定（双态缝——旧服务在场时以自持库为数据面准备）：config.dbFile 显式、或任一
 * 宿主数据域锚（DSH_FORGE_TASKS_HOME / DSH_HOME）在场才自启；双锚全缺席（裸测试/无宿主
 * 环境）不自启——不向 ~/.dsh 兜底路径静默落盘（core forgeKnowledge 旧服务已随 1.8 退役，
 * 自持库自启即唯一供数面）。
 */
export function autoStartDbFile(
  config: KnowledgeStorageConfig = {},
  env: KnowledgeStorageEnv = process.env,
): string | undefined {
  if (nonEmpty(config.dbFile) || nonEmpty(env.DSH_FORGE_TASKS_HOME) || nonEmpty(env.DSH_HOME)) {
    return resolveKnowledgeDbFile(config, env)
  }
  return undefined
}
