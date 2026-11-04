---
id: ownership-parser-must-cover-localid-vocabulary
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
title: 任务 id 结构化解析必须覆盖 localId 词汇空间，白名单取舍显式声明
summary: >-
  parseTaskContainerSlug 首版只剥末段数字点段，对管线实存 dash-localId 形制（fix 链 fix-N、disc 链
  disc-N）解析出伪容器段（<slug>-disc），嵌套修复链锚失配 → 守卫 fail-open 漏拦——且恰好落在盲修链这一核心防护场景。修正 =
  派生词汇白名单（剥数字点末段后若新末段 ∈ fix/disc 再剥一段）+ 非 t- 前缀 id 一律不归属；容器 slug 本身为 <x>-fix 且
  localId 纯数字的不可约歧义按白名单优先解释，取舍在解析器文档显式声明。通用教训：凡「从复合 id 反解容器」的解析器，必须枚举 localId
  的全部产出词汇（含循环派生径命名）并逐形制边界测试，缺一族就是一条静默漏拦路径。
keywords:
  - 结构化解析
  - dash-localId
  - 派生词汇白名单
  - fail-open
  - 边界测试
---

## 附注（spec-reviewer 第二轮目标面 · 域形态注记，供上游裁决）

生产 `add()` 任务 id 为 `randomUUID()`（tasks/add.ts），并非测试 harness 承载的
`t-<slug>-<localId>` 形制——生产径上 parseTaskContainerSlug 恒 null，sourceTaskId
归属锚实际惰性，归属过滤始终走 slug 回退键（行为正确：slug 即真实容器，守卫无漏拦）。
t- 形制假设目前仅由测试侧单源（tasks/harness.ts）承载。上游若统一任务 id 形制或增
uuid→容器注册反查面，本解析器随之升级；在此之前锚机制属「harness 形制下做实功、
生产形制下惰性回退」的已知形态。
