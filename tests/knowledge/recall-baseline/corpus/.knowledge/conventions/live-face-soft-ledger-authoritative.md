---
title: 活面 fail-soft 与账面唯一写者双链零耦合、以账面为准
summary: >-
  同一事实的展示链（进度事件，fail-soft 可丢）与回溯链（jsonl
  台账，唯一写者必达、append-only）零耦合——消费以账面为准；台账融合既有容器事件流不建新写者/新文件，事件行追加而非回填，失败径样本与成功样本同权必记。
keywords:
  - 台账
  - 账面
  - 活面
  - append-only
  - 唯一写者
  - 回溯
  - 复盘事实源
domainPath: docs/conventions/
来源容器: triage-progress-row
来源任务: first-pass 知识沉淀（1.10），素材取自 proposal §2.4 与验收 5/6 真机证据
bug id: 无
id: live-face-soft-ledger-authoritative
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/event-logging.md
---

# 活面 fail-soft / 账面唯一写者：双链零耦合、账面为准

## 判据

- **活面**（forge/progress 事件 → 面板行）：体验面，fail-soft 可丢，不做可靠性承诺。
- **账面**（logs/{slug}.jsonl 事件行）：log-listener 唯一写者自动落档，append-only（行数只增、行序 = 发射序），必达。
- 两链零耦合：活面丢事件不影响账面完整；账面行 id 与活面点击锚同源（ledger = panel = 同一 workerSessionId），跨面取证可互验。
- **融合优先**：台账进既有容器事件流同时间线，不建独立文件/新写者——回溯时同一时间线含任务全程，零拼装。
- **失败样本必记**：triage 重试失败径必发 outcome（失败原因），不得只进 escalation history——失败样本是复盘事实源的关键组成。
- **执行回执语义**：outcome 钉「决策 → 执行结果」边（append-only 纯化，追加而非回填）；真实终局由后续任务事件承载，不在 outcome 里重复下终局决议。

## 边界（何时不成立）

- 需要全新领域、与容器任务流无时间线关联的痕迹，仍可独立文件——判据是「复盘时是否需要与任务全程同轴对读」。
- 唯一写者前提 = log-listener 在场；未记忆会话 fail-soft 丢行属已知边界（见 review 前提核销表）。

## 出处

proposals/triage-progress-row/proposal.md §2.4；walkthrough/record.md 验收 5①②（ledger/panel/锚同 id 互验）与验收 6（append-only 真机核验：行数 8→8 不回退、前缀逐字节稳定）。
