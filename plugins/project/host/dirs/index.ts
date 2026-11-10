// host/dirs barrel（plugin-project 1.12 目录事实面归拢——提案 §一裁决 3）：anchors /
// init / audit / doc-style / DirFactsPort provider 单一出口。消费面经
// `@dsh-forge/project/host-dirs` 子路径出口 import（package.json exports 单源）。
export * from './anchors.js'
export * from './init.js'
export * from './audit.js'
export * from './doc-style.js'
export * from './dir-facts.js'
