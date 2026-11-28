// forge 目录派生导出（forge-dirs-query-tool §2.8 散点收编单点）：
// 连接算法单源 = 本包 joinDirSegment；段名词汇单源 = lib-api forge-dir-segments 常量；
// 本文件做薄组合（plugin-forge 侧同形导出在 src/forge-paths.ts——两侧零互相依赖，
// 各消费两个单源）。plugin-project 1.6 下沉 @dsh-forge/lib-path（自
// packages/core/src/forge/workspace/dir-segments.ts git mv 迁入，零语义改动）。
// 对平台原生拼写输入，派生结果与收编前 node:path join 拼接逐字节等价
//（等价断言 = dir-segments.test.ts）。
import { FORGE_DIR_SEGMENT, FORGE_DOCS_SEGMENT } from '@dsh-forge/lib-api/forge-dir-segments'
import { joinDirSegment } from './path-key.js'

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
