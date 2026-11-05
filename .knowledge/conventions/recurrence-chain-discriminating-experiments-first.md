---
title: 同族复发链处置范式——判别实验先行、定谳前禁盲试、验收锚定不变式而非症状面
summary: >-
  同缝复发 ≥2 时先建模再修：E1 离线纯函数单测成本最低判别力最高，CDP 运行时取证按需补充；定谳前禁落地修点；验收锚定仲裁不变式（本案
  INV-L/INV-U/INV-B/INV-R）而非症状面。
keywords:
  - triage
  - recurrence
  - discriminating-experiments
  - invariants
  - 盲试
status: unconfirmed
source_container: e2e-known-reds-triage
source_task: fix-1 / fix-2
source_bug: ef8b3a45
id: recurrence-chain-discriminating-experiments-first
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 同族复发链：判别实验先行

## 规则

1. 同缝复发 ≥2 次即升级为建模任务，先建复现/归因模型再动修复。
2. 判别实验按成本-判别力排序：**E1 离线纯函数单测优先**（零环境依赖、判别力最高），CDP 运行时取证只在单测无法定谳时按需上。
3. 定谳（成因明确归一到单一根因）之前，禁止落地任何修点——盲试会制造平行症状面，掩盖真实根因。
4. 验收锚定**仲裁不变式**（本案四条：INV-L / INV-U / INV-B / INV-R），不是症状消失——症状面通过不等于不变式成立。

## 边界

- 适用于同缝（同一位置/同一症状族）复发链；一次性偶发缺陷直接修不入此范式。
- 不变式命名与条数随问题域定制，范式不预设具体不变式集合。
