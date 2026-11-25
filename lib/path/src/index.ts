// @dsh-forge/lib-path —— 公共 path 子包（plugin-project 1.6 归并到位）：路径比对归一键
// （path-key）+ normalize 单源 + derive-dir 派生（hash8 承载 node:crypto——仅 node 消费面）
// + forge 目录段派生。浏览器安全子面走 '@dsh-forge/lib-path/path-key'（零 node 内建）。
export * from './path-key.js'
export * from './derive-dir.js'
export * from './dir-segments.js'
export * from './forge-dirs.js'
export * from './project-key.js'
