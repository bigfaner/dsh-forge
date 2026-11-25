---
title: 全量质量门在途污染的判读与收窄口径
summary: >-
  多批次并行共享全量门时，范围外在途文件（他批次未跟踪 spec）会挡住本任务全量
  lint——先核对失败源归属再判性质；确属在途污染走用户裁决的收窄口径（范围门全绿 + 全量项登记证据债），同一根因重复 blocked 不再逐波申诉，待
  gate-inflight-isolation 提案落地根治。
keywords:
  - 质量门
  - 在途污染
  - 证据债
  - 分区门
  - 全量 lint
domainPath: .knowledge/conventions/
来源容器: loop-card-task-context
来源任务: first-pass 知识沉淀（1.6）；口径产生于 1.3 三波 blocked（002/disc-1/收口）
bug id: 无
id: full-gate-inflight-pollution-narrowing
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 全量质量门在途污染的判读与收窄口径

## 适用条件

- 多批次并行开发、共享 `pnpm lint` 全量门的工作区；本任务触点外存在他批次在途文件时成立。
- 全量门失败项与本次改动无依赖关系（失败文件不在触点集）。

## 反例边界

- 失败源属于本任务触点集时不算在途污染，必须当场修复，不得套用收窄口径。
- 收窄口径须用户明示裁决，不得由 agent 自行裁定；无裁决前按 blocked 上报。

## 判读与做法

1. 全量门失败先逐条核对失败源文件归属：在途未跟踪/他批次文件 → 环境污染，非本任务缺陷。
2. 收窄口径（用户裁决 2026-10-31）：范围门全绿（tsc -b + 触点 oxlint + 定向单测）为主证据；全量失败项登记证据债，对应批次收敛后补跑全量门。
3. 同一根因重复出现不逐波走 blocked→disc 申诉链，结算时统一声明并引用同一收窄依据。
4. 根治路径：分区门（基线 commit + 触点文件求值）为首选，派生提案 `gate-inflight-isolation`（parent = loop-card-task-context）在裁决队列；采纳前按第 2 条口径人工收窄。

## 来源锚点

- `retro/first-pass.md` 波次 2/5/6（同一根因三波，机械层 ≈4/6 波权重）。
- `walkthrough/batch-1/VERDICT.md` 质量门节（m3 在途文件 ac4-routing-probe.spec.ts:170 收窄记录）。
