// host/dirs barrel（plugin-project 1.12 目录事实面归拢——提案 §一裁决 3）：anchors /
// init / audit / doc-style / DirFactsPort provider 单一出口；host/dirs 源目录保留，
// 无子路径出口（package.json exports 不含 host-dirs），消费面经主出口 import。
export * from './anchors.js'
export * from './init.js'
export * from './audit.js'
export * from './doc-style.js'
export * from './dir-facts.js'
