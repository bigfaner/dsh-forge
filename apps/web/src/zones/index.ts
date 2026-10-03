// zones/ barrel（定位：基础——三区结构骨架：容器、视图互换机制、页签跟随）。
// 边界：禁 import views/、flows/（依赖铁律① 基础↛业务）；域内容一律经 WorkbenchZoneSlots 槽位注入。
export * from './dock.js'
export * from './dock-kit.js'
export * from './slots.js'
export * from './WorkbenchZones.js'
