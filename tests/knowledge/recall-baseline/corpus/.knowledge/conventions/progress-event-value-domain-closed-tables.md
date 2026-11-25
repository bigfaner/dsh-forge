---
title: progress 事件新增 scenario/verb 须扩全部值域单源封闭表
summary: >-
  forge 进度事件值域是单源封闭表——新增 scenario/verb
  若只改发射点不改值域表，事件在客户端守卫即被静默丢弃（无报错，面板整体失效）。新增值域的完整改动清单：SCENARIOS 表+守卫集合、verb
  并集、计数钉测试、dispatch-core typed 映射，四处同步扩。
keywords:
  - progress 事件
  - 值域
  - 封闭表
  - 守卫
  - 静默丢弃
  - forge
domainPath: docs/conventions/
来源容器: triage-progress-row
来源任务: first-pass 知识沉淀（1.10），素材取自 proposal 评审 Q1/Q2 与实现验证
bug id: 无
id: progress-event-value-domain-closed-tables
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# progress 事件值域单源封闭表：漏扩一处即静默失效

## 判据

- 客户端守卫按 `SCENARIO_SET` 拒绝未知 scenario——未知值不是报错，是**丢事件**：面板无从渲染、无任何错误信号，方案「整体失效」且难以从现象反推原因。
- 评审曾拦下同类遗漏：改动清单只列 driver.ts（发射点），漏掉值域单源文件——发射点正确但值域未扩，交付即失效。

## 完整清单（新增 scenario/verb 时四处同步）

1. `FORGE_PROGRESS_SCENARIOS` 表 + `SCENARIO_SET` 守卫集合。
2. verb 并集。
3. 值域计数钉测试（穷举 pin，漏处理即红）。
4. dispatch-core 事件闭包 typed 映射同族扩展。

## 边界（何时不成立）

- 只适用于封闭值域（typed 映射 + 守卫集合）的事件面；开放 string 载荷字段无此约束。
- 若事件面本身就是「未知类型透传」设计，则不适用——承重前读对应守卫源码确认。

## 出处

proposals/triage-progress-row/review/report.md Q1/Q2；proposal §2.1；walkthrough/record.md 质量门（值域 pin 全绿）。
