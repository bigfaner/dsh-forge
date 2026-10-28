---
title: 唤醒类消息的最小充分信息集判据
summary: 异常/结算等唤醒（wakeup）消息以「主 agent 凭消息本身可精确排查/收口」为验收判据：任务标识、错误原文（含全文引用）、发生阶段、重试计数、处置入口五要素逐一打勾，缺一即 FAIL——loop-message-consolidation AC3 复跑实证处置入口缺失可被该判据捕获。
keywords: [wakeup, 异常通知, 信息集, 验收判据, 结算卡]
domainPath: .knowledge/conventions/
来源容器: loop-message-consolidation
来源任务: first-pass 复盘（1.8）
bug id: 无
---

# 唤醒类消息的最小充分信息集判据

## 判据

唤醒类消息（异常径 / 结算径）不追求文本长，而以**信息集完备**为验收口径：

- **异常径五要素**：任务源与任务标识（slug/local-id）、异常类别与错误原文（长文给 errorFullRef 全文引用）、发生阶段、重试已耗计数、下一步处置入口。
- **结算径三要素**：状态计数（按 slug 分组）、各任务概要（每任务一行含终态与耗时）、下一步动作指示。

## 实证

walkthrough 1.4 首轮（HEAD 1561d7fe）AC3 FAIL：挂起唤醒出现 2 次（任务与派生复盘任务各一条）、处置入口缺失、原因仅摘要截断——逐要素打勾即捕获；fix 后（HEAD 3310f1c4）五要素齐备 PASS。

## 应用面

凡新增 wakeup 径（guard 粘住、suspendWithWakeup、终局结算等），验收清单直接复用该信息集逐项断言，不凭「文本看起来够用」放行。

## 晋升

提炼态；晋升 docs/conventions 正本走提案管线裁决（见改进提案 loop-consol-flywheel-improvement）。
