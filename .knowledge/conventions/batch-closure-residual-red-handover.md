---
title: 收口批残红移交范式——稳定复现且归因上游变更漂移的残红按 known-reds 口径移交派生提案
summary: 收口批残红经隔离复跑稳定复现且全部归因上游变更漂移时，按 known-reds 维护口径移交派生提案（本案 e2e-upstream-drift-reds-triage，proposalId b3569515）——「新增红由归属任务补录」；验收口径修订须显式裁决留档，移交清单逐例归因不静默。
keywords: [batch-closure, handover, known-reds, derived-proposal, 上游漂移]
status: draft
source_container: e2e-known-reds-triage
source_task: 1.11
source_bug: —
---

# 收口批残红移交范式

## 规则

1. 前置条件（同时满足才可移交）：残红经**隔离复跑稳定复现** + **逐例归因上游变更漂移**（非本批引入缺陷）。
2. 移交目标：派生提案承接（known-reds 维护口径——新增红由归属任务补录），本案 `e2e-upstream-drift-reds-triage`（proposalId `b3569515`）。
3. 验收口径如需修订（如豁免某批红），必须**显式裁决留档**，不得以移交默示变更口径。
4. 移交清单**逐例归因**（每条红注明上游变更来源与证据锚），禁止打包归因、禁止静默丢弃。

## 边界

- 不稳定复现或归因不明的残红不得移交，留在原任务继续归因。
- 本案无单一 bug id 对应，源 bug 置空；具体归因见派生提案清单。
