// forge 目录派生导出（forge-dirs-query-tool §2.8 散点收编 core 面单点）：
// 连接算法单源 = @dsh-forge/path-key joinDirSegment；段名词汇单源 = contracts
// forge-dir-segments 常量；本文件做 core 侧薄组合（plugin-forge 侧同形导出在
// src/forge-paths.ts——两侧零互相依赖，各消费两个单源）。对平台原生拼写输入，
// 派生结果与收编前 node:path join 拼接逐字节等价（等价断言 = dir-segments.test.ts）。
import { FORGE_DIR_SEGMENT, FORGE_DOCS_SEGMENT } from '@dsh-forge/contracts'
import { joinDirSegment } from '@dsh-forge/path-key'

/** forgeDir → 文档根（forgeDir/docs——平台独立连接） */
export function docsRootOfForgeDir(forgeDir: string): string {
  return joinDirSegment(forgeDir, FORGE_DOCS_SEGMENT)
}

/** 工作区根 → forge 目录（workspaceRoot/.forge） */
export function forgeDirOfWorkspace(wsPath: string): string {
  return joinDirSegment(wsPath, FORGE_DIR_SEGMENT)
}

/** 工作区根 → 文档根（workspaceRoot/.forge/docs——两段派生链） */
export function workspaceDocsRoot(wsPath: string): string {
  return docsRootOfForgeDir(forgeDirOfWorkspace(wsPath))
}
