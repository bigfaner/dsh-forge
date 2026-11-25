---
title: 门禁拒绝回执自解释，一次纠正即收敛
summary: >-
  质量门/结算门的拒绝回执应直接给出可执行的纠正路径（含判据原文 + 按改动性质二选一的纠正动作）；workspace-artifact-governance
  1.6 结算拒绝回执列明「提交落 main 而非容器分支 + 未申报 files 不适用纯文档特例」并给出二选一纠正，worker
  一轮修正即通过——回执设计口径的正面判例。
keywords:
  - 结算门
  - 拒绝回执
  - 错误信息设计
  - 一次纠正
  - settle-cwd-pin
domainPath: .knowledge/conventions/
来源容器: workspace-artifact-governance
来源任务: 1.6（002-settle-landing-rejected → 003-final-sweep）
bug id: 无
id: self-explanatory-gate-rejection-receipt
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 门禁拒绝回执自解释，一次纠正即收敛

## 规则

设计任何机械门禁（结算分支核验、files 申报、质量门）的拒绝回执时，三要素：

1. **判据原文**：核验了什么、实测值是什么（如「提交 f25d5345 不在容器分支 workspace-artifact-governance 上，所在分支：main」）；
2. **特例判定**：为何不适用豁免（如「未申报 files，不适用纯文档跨分支特例」）；
3. **纠正路径**：按改动性质给出可执行分支（含代码 → 换分支重提交重结算；纯文档 → 逐文件申报 files）。

回执自解释性好，worker 无需反向猜测门禁实现即可一轮纠正——拒绝本身不再产生额外返工轮。

## 实证

1.6 提交落错 main + 未申报 files → 结算拒绝；回执三要素齐备，003-final-sweep 一轮通过。复盘（1.8 retro §2.3）判定门禁机械正确工作，异常点在 worker 侧信息不足，由回执补救。

## 反例边界

- 回执不能替代事前信息：正确做法仍是在涉提交任务的简报里前置「提交必须在容器检出分支 + files 申报」判据——回执是兜底不是首道防线（成本已发生一轮）。
- 回执文案随实现耦合，机械重构时须同步回写，否则纠正指引失效。
