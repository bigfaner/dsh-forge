// views/session/ barrel（定位：业务——UF-4 会话面板三 tab：对话注入面 / 轨迹台账 / 召回占位）。
// 边界：禁 import ../knowledge/（依赖铁律③ 同级业务互禁——跨视图经 zones/ 槽位与 rpc/ 解耦）；
// 数据进出全经 props（装配 2.12 持有运行期绑定：官方会话面嵌入 + ChatSnapshot 映射 + 召回 RPC）。
export * from './SessionPanel.js'
export * from './TrajectoryLedger.js'
export * from './transcript.js'
