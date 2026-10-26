---
title: AC 与用户裁决冲突时 blocked 上报取证
summary: 任务 AC 与后续用户裁决返工冲突时，不自行取舍实现口径——先取证落盘（spec-conflict.md），以 blocked 结算上报，待以现行实现口径重新结算收口。
keywords: [AC 冲突, 用户裁决, blocked, 取证, 重新结算]
domainPath: .knowledge/lessons/
来源容器: expert-squad
来源任务: 1.21（D-7，phase-4-summary.md）
bug id: 无
---

# AC 与用户裁决冲突时 blocked 上报取证

## 判例

1.21 AC 要求面板内自建消息 Modal；随后 fix-9 用户裁决返工移除自建 Modal、改走官方 chat-view 预设会话。任务以原 AC 无法自洽结算。

## 处置

1. 取证写入任务日志（`001-spec-conflict/spec-conflict.md`），记录 AC 原文与裁决返工的冲突点。
2. 以 blocked 结算上报，不静默改 AC。
3. 由 fix 链以现行实现口径重新结算收口，任务闭环。

对照判例：自建 Modal 首轮实现（`5b58a8ad`）本可避免——召唤面对话类 UI 先查官方同语义组件（chat-view 预设会话），「语义近似自建」必被对齐纪律打回。
