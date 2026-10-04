// shell/ barrel（定位：基础——壳接入：boot 消费、carrier）。
// 边界：禁 import views/、flows/（依赖铁律① 基础↛业务）。
// fix-25：视图态机（view-state/use-shell-view）退役——中区互换 = 官方 layout 面板径
// （main keyed roster + selectPanel），产品视图镜像锚归工作台壳宿主（workbench/ShellHost）。
export * from './bridge.js'
export * from './carrier.js'
export * from './boot.js'
