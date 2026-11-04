---
title: 结算 ac_criteria 须逐字复制定义侧原文，概括改写即拒
summary: >-
  submitTask 的结构化 ac_criteria 与任务定义侧逐字交叉比对——worker 结算时概括、缩写或改写判据原文会以
  ERR_AC_CRITERIA_MISMATCH 被拒，每例损失一轮重派；判据原文必须在领取时即原样保存并在结算时逐字回传。
keywords:
  - 结算
  - ac_criteria
  - ERR_AC_CRITERIA_MISMATCH
  - 逐字比对
  - 门禁
domainPath: .knowledge/lessons/
来源容器: expert-headhunter-tools
来源任务: first-pass 知识沉淀（1.6）；事件源自 fix-2、1.3 重派、1.4 三次同型拒绝
bug id: 无
id: ac-criteria-verbatim-echo-on-submit
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 结算 ac_criteria 须逐字复制定义侧原文，概括改写即拒

## 现象

- 同一轮三个 worker（fix-2、1.3 重派、1.4）结算时均被 ERR_AC_CRITERIA_MISMATCH 拒绝一次，机械回显定义侧原文后，按原文重提即过。
- 机械的逐字比对是正确设计（防结算口径漂移），缺陷在 worker 侧提交习惯。

## 规避方式

1. 领取任务时把 acceptance_criteria 原文原样存入工作笔记，不凭记忆重构。
2. 结算时 `ac_criteria` 数组逐项从定义侧原文复制，`ac_met`/`ac_evidence` 按序一一配对；证据过长的落盘只传路径。
3. 判据确实与实际不符时不改写原文凑对——走 AC 冲突处置（blocked 上报）。

## 反例边界

- 仅适用于结构化 `ac_criteria` 数组；`summary` 是自由文本，概括无妨。
- 机械拒绝信息已自愈闭环（一次重试即过），故单例损耗一轮而非阻塞。

## 来源锚点

- `logs/expert-headhunter-tools/1.5/retro-first-pass.md` S4 节（三例账面行号与归因）。
