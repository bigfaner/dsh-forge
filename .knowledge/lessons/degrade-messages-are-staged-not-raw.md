---
title: 降级文案阶段化，不透原始异常
summary: fail-soft 降级引导条/错误条的用户可见文案须按阶段归因（create/preset 阶段人话），原始异常只留 console 留痕——降级条透出底层 TypeError 即为走查不合格。
keywords: [fail-soft, 降级, 错误文案, 走查]
domainPath: .knowledge/lessons/
来源容器: expert-squad
来源任务: 阶段四走查（walkthrough-phase4.md D-3，fix14 已正）
bug id: 无
---

# 降级文案阶段化，不透原始异常

## 翻车点

召唤降级引导条按设计呈现（不炸面板），但文案携带底层原始异常 `Cannot read properties of undefined (reading 'layout')`——对用户是噪音，对排障也只有 console 才需要。

## 正解

- 用户面文案按失败阶段归因（create 失败 / preset 选择失败分述人话）。
- 原始错误 console 留痕供排障。
- 走查取证时错误态不仅要「呈现了」，还要「说人话」——截图对照时读一眼文案内容。
