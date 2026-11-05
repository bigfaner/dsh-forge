---
title: 承重官方机械引用自带源码出处核销表
summary: '提案引用官方包机械（类型、注入通道、语义）作为承重设计依据时，必须自带核销结论表：精确 pin 版本 + 文件:行出处 + 结论；不得依赖评审代为核销。'
keywords:
  - 源码核销
  - 官方机械
  - 提案
  - 出处
domainPath: .knowledge/conventions/
来源容器: expert-squad-forge
来源任务: first-pass 复盘（1.7）
bug id: 无
id: official-mechanism-citation-table
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/official-mechanics-interception.md
---

# 承重官方机械引用自带源码出处核销表

## 规则

提案/设计中凡「官方已有同语义机械」类承重断言，随文附核销表：

| 引用面 | 出处（精确 pin @deepseek-ai/* 版本，文件:行） | 结论 |

先例体例：expert-squad-forge proposal.md §2.7（5 行覆盖 persona 正门、toolFilter 落地、ToolRestriction 语义、skills 无缝、experts 服务）。

## 依据

expert-squad-forge 首评 Blocker B3：全文引用官方 API 但无出处段——评审独立核销事实无恙，仍按口径记 Blocker 返工。前置提案 expert-squad 有 §2.4 核销段体例可循，属体例性遗漏。
