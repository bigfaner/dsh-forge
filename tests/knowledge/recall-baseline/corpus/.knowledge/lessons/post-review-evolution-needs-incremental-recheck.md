---
title: 方案评审放行后实质演进须触发增量复评，防编号体系漂移
summary: >-
  提案评审放行后方案继续演进（守卫增删、AC 重排）而未 diff 复评，评审报告与最终 proposal 守卫编号体系分叉（G1 消解、M4
  新增），执行依据与评审依据错位——实质变更应触发一次增量复评。
keywords:
  - 评审
  - 方案演进
  - 增量复评
  - 编号漂移
  - 提案
domainPath: lessons
status: unconfirmed
source_container: packaging-guard-hardening
source_task: packaging-guard-hardening/1.6
id: post-review-evolution-needs-incremental-recheck
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 评审放行 ≠ 评审终态：演进须复评

## 现象

- 评审报告（评的是 AC1–AC5 旧版，含 G1 对账）与最终 proposal.md（G1 随 M1 消解、新增 M4，AC1–AC7）守卫编号体系不一致；方案实质演进后未触发重评。本轮演进为收敛性未造成损失，但属流程风险。

## 规避方式

1. 评审放行后方案发生实质变更（守卫增删、AC 重排、改动面变化）时，触发一次增量复评（只 diff 面）。
2. 执行者拿到评审报告与 proposal 编号不一致时，以最终 proposal 为准并在派发/摘要中显式声明该裁决。
3. 附带：引用他人产物路径前先 glob 核实在场（本轮评审即发现提案引用 fix-37 归并前的旧 spec 路径），防实现者新建平行文件。

## 反例边界

- 文字润色、错字修正等非实质变更不触发复评。
- 增量复评只覆盖 diff 面，不整篇重评。

## 来源

- 复盘 `packaging-guard-hardening/retro/first-pass-1.6.md` 第二节分歧记录 + 第四节 F1；评审 `review/report.md` Question 1。
