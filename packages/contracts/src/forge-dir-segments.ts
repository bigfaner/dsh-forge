// forge 目录段名常量单源（forge-dirs-query-tool §2.8——三族散点收编的跨包词汇单源）。
// 定位：契约层零逻辑铁律——本文件只承载段名常量；平台独立连接与派生函数单源 =
// @dsh-forge/path-key joinDirSegment（core 与 plugin-forge 共依），段名在此单点声明、
// 连接算法在 path-key 单点实现，消费面两侧组合（core workspace/dir-segments、
// plugin-forge forge-paths 派生导出）。

/** 工作区 forge 目录段名（workspaceRoot/.forge） */
export const FORGE_DIR_SEGMENT = '.forge'

/** forge 文档根段名（forgeDir/docs） */
export const FORGE_DOCS_SEGMENT = 'docs'

/** 容器库内日志目录段名（{taskHome}/logs/{slug}/{localId}——FORGE_LOGS_DIR 跨包单源） */
export const FORGE_LOGS_DIR = 'logs'
