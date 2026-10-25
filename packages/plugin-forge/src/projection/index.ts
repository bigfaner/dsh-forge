// projection barrel（S7——run-tasks-host-command 会话投影键单一出口：unit 工厂 + 键/版本
// 常量 + 类型面）。消费面 = 插件装配方（reflect.get('sessionProjections') 防御读取后
// register——注册表缺席 = 键不注册 fail-soft）。
export {
  createForgeDispatchLoopProjection,
  FORGE_DISPATCH_LOOP_PROJECTION_KEY,
  FORGE_DISPATCH_LOOP_STATE_VERSION,
} from './dispatch-loop.js'
export type {
  ForgeDispatchLoopProjection,
  ForgeDispatchLoopProjectionDefinition,
  ForgeDispatchLoopStatus,
  ForgeDispatchLoopUnitState,
  ForgeProjectionEvent,
  ForgeProjectionSchema,
} from './dispatch-loop.js'
// loop-event-delivery 1.6——进度事件流投影键出口（unit 工厂 + 键/版本/窗口常量 + 类型面）。
export {
  createForgeDispatchEventsProjection,
  FORGE_DISPATCH_EVENTS_PROJECTION_KEY,
  FORGE_DISPATCH_EVENTS_STATE_VERSION,
  FORGE_DISPATCH_EVENTS_WINDOW_SIZE,
} from './dispatch-events.js'
export type {
  ForgeDispatchEventEntry,
  ForgeDispatchEventsProjection,
  ForgeDispatchEventsProjectionDefinition,
  ForgeDispatchEventsUnitState,
} from './dispatch-events.js'
