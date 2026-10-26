---
title: fix 密度的两视角定性（分歧留证）
summary: expert-squad fix 密度 38.8% 但修正波次 0——实现视角定性为「官方门契约在设计期钉不全」（zod 净化、装载守卫、boot 无 workspace 字段均实现期才暴露）；流程视角定性为「健康成本」（评审把结构性返工拦在拆解前，fix 集中在低风险实现细节）。定性待裁决。
keywords: [fix 密度, 修正波次, 飞轮, 复盘]
domainPath: .knowledge/lessons/
来源容器: expert-squad
来源任务: first-pass 复盘（1.79）
bug id: 无
---

# fix 密度 38.8% 的两视角定性（分歧留证待裁决）

## 背景

first-pass 快照：一次通过率 1、返工增量比 0.0%、修正波次 0、fix 密度 38.8%。

## 视角 A（实现视角）

fix 任务对应的多是「官方门契约设计盲区」：register 门 schema 子集（D-4）、client 装载四守卫、boot 图无 workspace 字段（Q3）。改进方向：官方门契约清单前置到 tech-design 核销节，可再压 fix 密度。

## 视角 B（流程视角）

结构性返工（B1/B2 级）已全被评审拦截在 breakdown 前，fix 全部落在不改动任务图的实现细节上，属评审换来的健康成本；强行压密度可能把风险推到实现期。

## 裁决所需

两类 fix 任务（官方门契约盲区 vs 实现细节打磨）的逐条归类统计后再定，本轮不裁决。
