---
title: 提交标题须声明跨包触点——标题与实际 diff 范围不齐导致对账漏项
summary: 跨包改动时提交标题须点名全部触达包，跨包随动改动在提交说明中逐一点名；标题只写主包会让范围对账（评审/复盘/合并清单）漏掉随动改动。判例：1.2 标题「feat(core)」实际触及 plugin-forge claim.ts；1.5 标题只提 plugin-forge 实际触及 core bugs.ts。
keywords: [git, 提交纪律, 跨包, scope, 范围对账]
domainPath: .knowledge/lessons/
来源容器: recurrence-signal-tiering
来源任务: 1.2 / 1.5
bug id: 无
---

# 提交标题声明跨包触点

## 教训

1. 提交标题 scope 与实际 diff 的包集合必须一致；跨包时标题逐包点名，或标题写主包 + 说明逐包列随动。
2. 标题失真的直接代价：按标题做范围对账时（评审清单、合并范围、复盘回溯）随动改动不可见，易漏审、漏回归。
3. 自查动作：提交前对 `git diff --stat` 的包集合与标题 scope 比对一次。

## 适用条件

- monorepo 多包（core + plugins）改动的任意提交。
- 对账场景包括评审、合并范围罗列（§5.1）、复盘归因。

## 反例边界

- 纯单包改动无此问题；标题无需穷举未触达的包。
