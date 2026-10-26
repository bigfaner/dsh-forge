---
title: 对话面复用官方 chat-view 预设会话（返工判例）
summary: 首轮按 AC 自建消息 Modal 被用户裁决返工：召唤面改 openWorkspace + agentPresets.select('hr') 复用官方 chat-view，面板零对话面，联动走既有刷新通道——「语义近似自建」必被 AGENTS §3.1 对齐纪律打回。
keywords: [chat-view, agentPresets, 官方对齐, 返工, 召唤]
domainPath: .knowledge/examples/
来源容器: expert-squad
来源任务: 1.21 fix-9（D-7，phase-4-summary.md）
bug id: 无
---

# 对话面复用官方 chat-view 预设会话

## 判例

- 首轮：按任务 AC 实现面板内自建消息 Modal（`5b58a8ad`）。
- 返工：fix-9 移除自建 Modal，召唤 = `openWorkspace` + `agentPresets.select('hr')`，复用官方 chat-view 预设会话（`68e03bfc`）；e2e 断言迁移到官方会话语义。
- 判据提炼：凡是「打开一段对话/会话」类交互，先核销官方同语义机械（chat-view、Modal、dialog 形态），产品层只做组合与注入；写 AC 时同步核销，避免 AC 本身要求自建。
