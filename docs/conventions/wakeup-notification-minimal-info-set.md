# 唤醒类消息的最小充分信息集判据

> 晋升正本（用户裁决 2026-10-28，提案 loop-consol-flywheel-improvement D4；提炼源：loop-message-consolidation first-pass 复盘）。

## Requirement

唤醒类消息（异常径 / 结算径）不追求文本长，而以**信息集完备**为验收口径——主 agent 凭消息本身可精确排查/收口，缺一要素即 FAIL。

## 信息集

- **异常径五要素**：
  1. 任务源与任务标识（slug/local-id）；
  2. 异常类别与错误原文（长文给 errorFullRef 全文引用，不允许截断摘要替代）；
  3. 发生阶段；
  4. 重试已耗计数；
  5. 下一步处置入口。
- **结算径三要素**：
  1. 状态计数（按 slug 分组）；
  2. 各任务概要（每任务一行，含终态与耗时）；
  3. 下一步动作指示。

## 应用面

- 凡新增 wakeup 径（guard 粘住、suspendWithWakeup、终局结算等），验收清单直接按信息集**逐项断言**，不凭「文本看起来够用」放行；
- review-proposal 检查项已挂钩：提案含新增 wakeup 径而 AC 未逐要素断言 = Blocker（见 `packages/plugin-forge/skills/review-proposal/SKILL.md`）。

## 实证

loop-message-consolidation walkthrough 1.4 首轮（HEAD 1561d7fe）AC3 FAIL：挂起唤醒出现 2 次（任务与派生复盘任务各一条）、处置入口缺失、原因仅摘要截断——逐要素打勾即捕获；fix 后（HEAD 3310f1c4）五要素齐备 PASS。
