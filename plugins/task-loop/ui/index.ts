// @dsh-forge/task-loop client UI 面出口（包骨架阶段——派发/事件/概览任务面随迁移批落位）。
// 装载契约：exports["./client"] 产物经官方 client-modules 以 classic <script> 装载，
// bundle-client.mjs 生成自注册体（window.__ModuleLoader__.load）；本文件只承担组合
// apply 插件面与类型出口。UI 数据缝（Typert remote mount + ui slots 对接）随迁移批
// 落位——骨架期零缝注册。

/** client 组合插件面（DI 库件形态——官方宿主 apply 消费）。 */
export interface TaskLoopClientPlugin {
  /** entry fiber 依赖表（骨架期零跨服务消费——UI 缝落位时随批声明静态 inject 边）。 */
  inject: readonly string[];
  apply: (ctx: unknown) => void;
}

export const taskLoopClient: TaskLoopClientPlugin = {
  inject: [],
  apply: (ctx: unknown): void => {
    // 骨架期零缝注册——数据缝/插槽对接随迁移批落位（DispatchToolRow / DispatchEventsPanel /
    // 概览 tab 六组件×缝映射正本 ui-slots.md）。
    void ctx;
  },
};

/** 官方 client-modules apply 消费面（组合插件面直通）。 */
export function apply(ctx: unknown): void {
  taskLoopClient.apply(ctx);
}
