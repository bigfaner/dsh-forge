// 知识目录 config 解析（knowledge-plugin-migration 1.5 提案项 4 host 侧）：
// KnowledgePluginConfig.knowledgeDir —— 字面量（全项目单目录）或 per-project map
// （键 = 项目工作区目录 projectDir/wsPath）。resolveKnowledgeDir 纯函数零 IO 三态：
//   · 显式：非空字面量（trim 归一）/ map 命中值 → 该值；
//   · 缺省：config 缺席 / knowledgeDir 缺席 / map 未命中 → {projectDir}/.knowledge；
//   · 非法：空串/空白字面量、命中值空、config 劣形（非字符串非对象）→ undefined
//     （消费点 fail-soft 回退缺省 + warn 埋点——不静默，AGENTS §7）。
// 物化时序（AC2）：本解析不做任何建目录 IO——消费点（registerProjectRow /
// registerKnowledge 读时 mkdir recursive）承担 WYSIWYG + ACL 时序，不在 apply 期预建。
import { joinDirSegment } from '@dsh-forge/lib-path'

/** 缺省目录段（{projectDir}/.knowledge——与 lib-path deriveKnowledgeDir 客户端派生同字面） */
export const KNOWLEDGE_DIR_DEFAULT_SEGMENT = '.knowledge'

/** knowledgeDir 配置形态：全项目字面量 或 per-project map（键 = projectDir/wsPath） */
export type KnowledgeDirSetting = string | Readonly<Record<string, string>>

/** 缺省派生单源（消费点回退径与解析缺省态同字面） */
export function defaultKnowledgeDirOf(projectDir: string): string {
  return joinDirSegment(projectDir, KNOWLEDGE_DIR_DEFAULT_SEGMENT)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 知识目录解析纯函数（三态——显式/缺省/非法；fake 注入单测三态矩阵见
 * tests/knowledge-dir.test.ts）。零 IO：不 canonical 化不落盘——canonical 化与物化
 * 均归消费点（storage/registry canonicalWsPath + 读时 mkdir recursive）。
 */
export function resolveKnowledgeDir(
  config: { readonly knowledgeDir?: KnowledgeDirSetting } | undefined,
  projectDir: string,
): string | undefined {
  const setting = config?.knowledgeDir
  if (setting === undefined) return defaultKnowledgeDirOf(projectDir)
  if (typeof setting === 'string') return setting.trim() !== '' ? setting.trim() : undefined
  if (typeof setting !== 'object' || setting === null) return undefined
  const hit = (setting as Readonly<Record<string, string>>)[projectDir]
  if (hit === undefined) return defaultKnowledgeDirOf(projectDir)
  return isNonEmptyString(hit) ? hit.trim() : undefined
}
