// components/ barrel（定位：基础——领域无关组件：吃令牌、零业务逻辑、不发起 RPC）。
// 边界：禁 import views/、flows/（依赖铁律① 基础↛业务）；Markdown 渲染唯一入口 = MarkdownDoc
// （产品内禁直用 MarkdownText——tests/structure/web-shell.test.ts 机械 pin）。
export * from './EmptyState.js'
export * from './ErrorBar.js'
export * from './HeatBadge.js'
export * from './MarkdownDoc.js'
export * from './ModeChip.js'
export * from './SkeletonRows.js'
export * from './StateChip.js'
export * from './time-label.js'
