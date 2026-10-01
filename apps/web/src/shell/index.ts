// shell/ barrel（定位：基础——壳接入：boot 消费、carrier、视图态机）。
// 边界：禁 import views/、flows/（依赖铁律① 基础↛业务）；域内容经 zones/ 槽位渲染。
export * from './bridge.js'
export * from './carrier.js'
export * from './boot.js'
export * from './view-state.js'
