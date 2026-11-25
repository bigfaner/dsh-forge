---
title: 探针/doc 类任务交付物附状态链自证段（提炼态候选）
summary: >-
  探针与 doc 类任务的交付物应附「状态链自证段」（taskKey、结算时间、涉及事件类型清单），让下一环复盘/沉淀零拼装、不必回读 jsonl
  账面重建时间线——diag-probe 1.1 未附导致 1.2 复盘须回读账面。此为提炼态 conventions 候选，晋升
  docs/conventions 正本走提案管线裁决。
keywords:
  - 探针
  - 交付物
  - 状态链
  - 自证
  - 复盘
domainPath: .knowledge/conventions/
来源容器: diag-probe
来源任务: 1.2（first-pass 复盘，第五节）
bug id: 无
id: probe-deliverable-state-chain-self-attestation
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 探针/doc 类任务交付物附状态链自证段（提炼态候选）

## 经验

diag-probe/1.1（探针执行）一次通过，但交付物中未留下可复核的管线状态链证据（taskKey、事件时间戳），导致 1.2 复盘必须回读 `logs/diag-probe.jsonl` 账面拼装时间线。

## 规则（候选）

探针/doc 类任务 worker 在交付物末尾附状态链自证段：

- 本任务 taskKey（slug/local-id）
- 结算时间点
- 涉及的关键事件类型清单（claim/spawn/submit/done）

目的：服务「账面为准、零拼装」的账面消费约定，下一环（复盘/知识沉淀）直接引用交付物即可。

## 适用条件

- 交付物会被后续环节消费的 doc/探针/复盘类任务。
- 有 forge 账面（jsonl 事件流）作为交叉事实源的管线环境。

## 反例边界

- 交付物一次性消费、无后续环节时不强制。
- 状态以账面 jsonl 为唯一事实源——自证段是引用辅助，账面冲突时以账面为准。

## 晋升路径

本条为提炼态候选；晋升 `docs/conventions` 正本须经提案管线裁决，不直改技能检查项。
