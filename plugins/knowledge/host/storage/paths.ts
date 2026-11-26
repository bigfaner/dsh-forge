// 自持库路径解析（forge-dirs-unification §2.4——落点改基座取值）：forge 根由官方
// dshHomePath 服务现查（dshHomePath('forge')，消费点现查不缓存——AGENTS 1.6）；服务
// 缺席降级 ~/.dsh/forge + onDegraded 留痕（含「dshHomePath 缺席」字样）；knowledge 的
// 库文件与全局目录均由该 forge 根派生。
//   · 单装缺省库文件：{forgeRoot}/db/knowledge/knowledge.db（= 基座 forge.db +
//     knowledge/knowledge.db——库文件位置由配置决定，不设目录键）；
//   · config.dbFile 显式照用（组合安装 patch 下发 / 测试替代宿主，裁决① 2026-11-19）。
// 路径归一含 realpath 维（判例 c773c09f）：注册表键归一见 registry.ts canonicalWsPath——
// 本文件只做缺省派生，不做比对归一。
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** 官方 dshHomePath 函数类型（type-only import——官方包类型依赖，运行期经 cordis 服务现查） */
export type DshHomePathService = typeof dshHomePath

/** 防御读取缝：每次消费点现查（反射 get dshHomePath 服务），缺席/非函数/抛 = undefined */
export type DshHomePathProbe = () => string | undefined

/** 库文件所在目录段（forge.db 下的 knowledge 子目录——库文件位置由配置决定，不设目录键） */
export const KNOWLEDGE_DB_DIR_SEGMENT = 'knowledge'

/** 库文件名（单文件应用级库——全表同库） */
export const KNOWLEDGE_DB_FILE_NAME = 'knowledge.db'

/** config 可配路径子面（KnowledgePluginConfig 存储子域结构兼容） */
export interface KnowledgeStorageConfig {
  readonly dbFile?: string
  /** 旧 core state.db 路径（种子迁移源——config 注入；缺席 = 常规路径零迁移） */
  readonly legacyStateDb?: string
}

function nonEmpty(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * forge 根解析（§2.4 单点）：dshHomePath('forge') 服务现查 > 降级 ~/.dsh/forge
 * （onDegraded 输出含「dshHomePath 缺席」字样的 warn 留痕——降级不静默）。
 */
export function resolveForgeRootOf(
  probe?: DshHomePathProbe,
  onDegraded?: (message: string) => void,
): string {
  const viaService = probe?.()
  if (nonEmpty(viaService)) return viaService as string
  const fallback = join(homedir(), '.dsh', 'forge')
  onDegraded?.(`dshHomePath 缺席——forge 根降级 ${fallback}`)
  return fallback
}

/** 库文件完整解析：config.dbFile 显式优先（照用）；缺省 = {forgeRoot}/db/knowledge/knowledge.db */
export function resolveKnowledgeDbFile(
  config: KnowledgeStorageConfig = {},
  forgeRoot: string,
): string {
  if (nonEmpty(config.dbFile)) return resolve(config.dbFile as string)
  return join(forgeRoot, 'db', KNOWLEDGE_DB_DIR_SEGMENT, KNOWLEDGE_DB_FILE_NAME)
}

/**
 * 自启判定（双态缝——自持库为唯一供数面）：config.dbFile 显式、或 dshHomePath 服务
 * 现查在场才自启；双缺（裸测试/无宿主环境）不自启——不向 ~/.dsh 兜底路径静默落盘
 * （服务缺席但 dbFile 显式的降级 warn 由装配面 onDegraded 承担；core forgeKnowledge
 * 旧服务已随 1.8 退役）。
 */
export function autoStartDbFile(
  config: KnowledgeStorageConfig = {},
  probe?: DshHomePathProbe,
): string | undefined {
  if (nonEmpty(config.dbFile)) return resolveKnowledgeDbFile(config, '')
  const forgeRoot = probe?.()
  if (nonEmpty(forgeRoot)) return resolveKnowledgeDbFile(config, forgeRoot as string)
  return undefined
}
