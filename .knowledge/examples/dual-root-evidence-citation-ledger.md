---
title: 跨 git/非 git 证据引用的双根口径——对账表头书面化两枚留痕根，表内用相对根记号
summary: 对账表头注书面化「证据留痕根」两枚：forge 运行日志目录（盘上不进 git）与提案 walkthrough 目录（在盘相对根）；表内引用用相对根记号（{1.x}/、walkthrough/）。该结构使「commit 未含对账表改动」与「证据在盘已修正」两事实兼容，消解评审分歧（review2-code vs review2-spec 判例）。
keywords: [证据引用, 双根, 对账表, walkthrough, 评审分歧]
status: draft
source_container: e2e-upstream-drift-reds-triage
source_task: 1.7
source_bug: —
---

# 双根证据引用口径

## 结构

对账表头书面化两枚「证据留痕根」：

| 根 | 性质 |
|---|---|
| forge 运行日志目录 | 盘上存在、不进 git |
| 提案 walkthrough 目录 | 在盘相对根（`.forge/docs/proposals/<slug>/walkthrough/`） |

表内证据引用统一用相对根记号（如 `{1.x}/`、`walkthrough/`），不写绝对路径、不混用两根。

## 效果

该结构使两个事实兼容不矛盾：

1. 「commit 未含对账表改动」（证据根本就不在 git 内）；
2. 「证据在盘上已按修正归因更新」。

评审双方据此消解「台账未提交 = 台账未修正」的误判（review2-code 与 review2-spec 分歧判例）。

## 边界

适用于跨 git/非 git 面的对账/走查台账；纯 git 内文档引用仍按常规相对路径，不引入双根记号。
