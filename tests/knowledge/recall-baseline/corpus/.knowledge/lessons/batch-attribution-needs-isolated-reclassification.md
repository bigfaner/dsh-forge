---
title: 批级归因只作排查起点——入账前必须逐例单跑取证核实
summary: >-
  批级归因推断被逐例单跑重归类推翻两例：A10/A12 单跑体内零 blocked submit（「toolFilter deny 集漂移」归因不实）；C
  组三 spec 单跑体内零 deny 断言（「概览头渲染变更」归因不实）。批归因不得直接入账，须单跑取证核实；归因修正在对账表显式注记。
keywords:
  - batch-attribution
  - 单跑取证
  - 归因修正
  - known-reds
  - triage
status: unconfirmed
source_container: e2e-upstream-drift-reds-triage
source_task: 1.1 / 1.2 / 1.3
source_bug: —
id: batch-attribution-needs-isolated-reclassification
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 批归因与单跑核实的分界

## 现象

残红按批给出归因推断（「toolFilter deny 集漂移」「概览头渲染变更」），逐例隔离单跑后被推翻：A10/A12 体内零 blocked submit；C 组三 spec 体内零 deny 断言——批级推断与单例事实不符。

## 规则

1. 批级归因**只作排查起点**，不直接入账；每条红入账（移交/补录/豁免）前必须隔离单跑取证核实。
2. 单跑证据与批推断冲突时，以单跑为准重归类。
3. 归因修正要在对账表**显式注记**（原推断 → 实测归因 → 证据锚），不静默改写。

## 边界

适用于残红/known-reds 归因与移交面；开发期临时排查可用批推断加速定位，但正式入账一律过单跑核实门。
