---
id: guard-judgment-domain-must-match-intent
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
title: 守卫判据域必须与设计本意同域，全局判据配局部解除永不闭合
summary: >-
  同缝拦截事故（fix-1/disc-2）根因复盘：T3
  守卫判据输入是「项目全台账最长链」而非「本任务归属链」——「同缝」名不副实为「同项目」，无关提案历史链（含全 fixed）拦住一切 coding-fix
  派生任务；且解除判据（单任务卷宗报告在场）与判据输入（全局链）口径不对称，逻辑上不可能闭合，事故中三连无效处置皆源于此。修正 = 判据收窄到
  sourceTaskId 结构化解析的归属链 + 终态过滤 + activeCount
  拦截计数，解除判据随之自然同口径。通用教训：护栏类机制的「判什么」与「怎么解除」必须在同一域上定义；判据域扩大一个量级（项目级 vs 任务级）时误拦率趋向
  100%，并制造改型绕行动机。
keywords:
  - 守卫判据域
  - 同缝拦截
  - 归属链
  - 判解口径闭合
  - recurrence
---

