// 会话视图槽占用者族（定位：业务装配——官方 conversation.view roster 的产品页签）。
// 壳侧死面退役（disc-2，arch 评审 Major 1）：'dswf-recall' 召回页签注册与视图本体
// （ForgeRecallView/RecallTab）已随 knowledge 族注册面迁 @dsh-forge/project
// （ui/knowledge-face.ts + ui/knowledge/RecallTab.tsx）——壳侧零登记零本体；本文件仅余
// ShellHost/anchored-projects 消费的 kit 观察钩子窄类型（跨入口类型面豁免——runtime
// import 互禁仅约束值面）。对话 tab = 官方 'chat' 登记项直用；轨迹 tab = 官方
// 'trajectory' 登记项直用（fix-29：产品 'dswf-trajectory' 复刻退役）。
import './session.css'

/** 官方 kit 观察钩子窄面（上游 SnapshotSelectorHook 消费切片——结构同型镜像，禁 import 上游运行期包） */
export type KitSelectorHook = (selector: (state: never) => unknown) => unknown
