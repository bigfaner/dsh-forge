# 前置核销裁决记录（#3-#7，2026-10-17）

## W2×W3 冲突收口（用户裁决 2026-10-18）

**wrap 识别 typed code 单独放行拒绝**：create-wrap ④ catch 对 `ERR_WORKTREE_CAPABILITY_ABSENT`（W2 fail-closed 确定性拒绝）不再 fail-open——原样上抛呈现（官方 createFailed toast / RpcClientError Toast 链，依 #5 文案语义映射）；其余瞬态异常（RPC 不通、判非 git）维持 fail-open。W2 fail-closed 与 W3 fail-open 各归其位。#5「改道链任何失败 = fail-open」口径自本裁决起收敛为「瞬态失败 = fail-open；typed 拒绝码 = 单独放行」。typed 信封错误经 unwrapRpcEnvelope 以 RpcClientError 形态（code/message/data）保真透传，保证拒绝码可达 wrap ④ 判定点。

| # | 项 | 裁决 |
|---|---|---|
| 3 | adopt / fork 改道边界 | **adopt 径直通，fork 不在 wrap 面。** 带 `sessionId` 的 `create`（官方 reuseBlank 采纳）= 官方复用既有会话，改道无意义——① 直通 original（真机实证其真实形态：reuseOrCreateBlank 采纳径 opts 携 `{workspaceId, sessionId}`）。fork 经 `sessions.fork` / `agents.create`，结构性不经过 `create` 方法；worker/fork 重路由排除已在 guard 侧落地（`header.parentSession` 排除）。wrap 改道仅限无 `sessionId` 的全新创建且资格门命中。 |
| 4 | 跨分支确认重锚交互 | **确认面整体移到点选时点（1.19 语义回归），闩锁平移随行。** wrap 安装后处于官方 create 调用内部——不得中途插框（wrapped 无 UI、无等待）。跨分支确认框 + 1.34 确认闩锁 +「不再提示」从 arm 编排链退役，重锚为点选行时点确认；host 选中记忆只落已确认目标，wrap 消费已确认态。 |
| 5 | 错误文案语义映射 | **零映射、零新增词汇——全走官方现成链。** 改道链（`forge:worktree/session-create` RPC）任何失败 = ④ fail-open 透传官方 original，**不产生 createFailed、不向官方 toast 注入 forge 文案**；createFailed 面仅由官方 original 自身失败触发：`creationFailureMessage` Host 拒绝态 → `"{code}: {message}"`、其他 → `error.message`，toast = 官方词典「新建会话失败：{message}」（真机实证，见 probe-real-device-wrap）。未来 forge typed error 呈现（W2）走 RpcClientError 现成链，与 wrap 面无交集。 |
| 6 | D1 拆分 | **两案独立裁决，不捆绑。** 「能力缺席显式拒绝」（W2 fail-closed 收口：git 入口探针判定 + typed error 拒绝）与「瞬态异常是否按 D1-c 收紧封存面」分别决策；瞬态 fail-open 分支全部保留现状。本案（W3 wrap + guard 兜底）不预设任一案结论。 |
| 7 | mobile-ui × 本案联动钉 | **通道先行、本案零阻塞；判定单源 host；语义钉 = 契约测试。** `/remote/__rpc` allowlist 扩充归 mobile-ui 提案 host 侧改动落地，本案不前置依赖；`agentPreset` 已是 `WorktreeSessionCreateRequest` 类型化字段（纯 JSON 字符串直传，contracts DTO 单源，无独立编码面——过桥序列化核对通过）。移动端 hero 首选预铸 + 失败回退官方 `session.create` 与桌面 wrap ④ 出口同语义（fail-open），git 判定/模式随档在 host `doSessionCreate` 逐次现跑；联动交付钉 = 共享分流核心契约测试 + 移动端 hero 预铸优先契约钉（归 mobile-ui 工程实现，本案落契约）。 |

探针证据：`probe-boot-timing.md`（#1）、`probe-real-device-wrap.md`（#2）；过程产物（探针脚本/RPC 留痕/截图）在 forge logs `session-binding-guarantee/1.1/001-boot-timing` 与 `002-real-wrap`（留盘不进 git）。
