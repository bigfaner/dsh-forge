---
title: 批内版本 bump 时点——多任务批取首笔 feat 随 bump 落
summary: §5.2「bump 与对应改动同一提交落」在多任务批内的执行口径：feat 改动自 1.3 起，bump 0.17.0 却落 1.5，mid-batch 的中间提交成为「有 feat 未 bump」态；应取批内首笔 feat 提交随 bump。判例：plugin-forge 0.17.0 bump 落点滞后两笔提交。
keywords: [版本 bump, 提交纪律, semver, 多任务批]
domainPath: .knowledge/lessons/
来源容器: recurrence-signal-tiering
来源任务: 1.3 / 1.5
bug id: 无
---

# 批内版本 bump 时点

## 教训

1. 同一插件的多笔 feat 分布在一个任务批内时，bump 应随**首笔 feat** 落同一提交，而非攒到批尾。
2. 落点滞后的风险：批中若在中途被检出/合并（worktree 合并、部分 cherry-pick），出现「feat 已入而版本未 bump」的不一致态。
3. 执行口径：写首笔 feat 前先 `scripts/bump-version.mjs`，bump 与该 feat 同提交。

## 适用条件

- 一个任务批内同一插件存在多笔连续 feat 的场景。
- 单笔改动场景按 §5.2 原文即可，无歧义。

## 反例边界

- 若批内各笔 feat 分属不同 semver 位（patch/minor 混合），仍按最终位取一次 bump，但落点仍在首笔 feat。
