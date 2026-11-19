// bug 三件视图出口（定位：业务视图——1.14 UI 迁入收编面）。壳侧发布面
// （apps/web product-views）经本出口消费 ForgeBugGlyph / ForgeBugPreview /
// ForgeBugChipRestoreOverlay 三组件本体；组件随壳 bundle 渲染（React 单例不变——
// 发布件与官方件共享同一 hook/元素同一性，发布面机械 = 页内全局 __DSH_FORGE_VIEWS__）。
// 纯模型面（bug-source / chip-restore——零 react）另经 exports./client-ui/bug-model 与
// ./client-ui/chip-restore 直供 client 插件 bundle（自含 classic script 内联——不经本出口，
// 避免与壳 entries 产出共享 chunk 破坏 classic 形状 pin）。
export { ForgeBugGlyph, type ForgeBugGlyphProps } from './BugGlyph.js'
export * from './BugPreview.js'
export * from './ChipRestoreOverlay.js'
