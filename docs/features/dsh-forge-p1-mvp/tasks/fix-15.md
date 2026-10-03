---
id: "fix-15"
title: "Fix: 品牌标识替换——「知识就是力量」新 mark（docs/brand 母版）+ 根修左上角品牌方块近黑问题（深底填充废弃，currentColor 令牌适配）"
priority: "P1"
estimated_time: "1h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 品牌标识替换（知识就是力量）+ 黑色方块根修

> 来源：走查人（2026-10-03）「以知识就是力量设计一个 brand 图，替换官方的。同时修复左上角 brand 是黑色图片的问题」。

## Root Cause（黑色图片）

现品牌 mark =「知」字方块（[ForgeBrand.tsx:14-24](../../../apps/web/src/views/sidebar/ForgeBrand.tsx)）：`background: var(--dsw-alias-brand-primary)` 填充底 + 反色字（sidebar.css:286-287）。浅色主题下 `brand-primary` 令牌为深蓝黑 → 24×24 方块呈**近黑图片**观感。非官方壳缺陷（行本体归官方），是产品占位件（sidebar.brand.mark 洞内容）的形态问题。

## Description

以 **docs/brand/dsh-forge-mark.svg** 母版（已设计交付，见 [docs/brand/README.md](../../../docs/brand/README.md)）替换「知」字方块：

- **概念**：翻开的书（知识）托举升起的闪电（力量）—— 呼应知识飞轮核心卖点
- **用色**：单一 `currentColor` 内联渲染（外层 `color` 取官方令牌），**废弃深色填充底** —— 明暗主题自动适配，黑色问题根修
- **落点**：ForgeBrandMark 内联 SVG（三路径几何，viewBox 24×24，size prop 缩放，aria-hidden 保持）；品牌名 dsh-forge 字标不变；sidebar.css 品牌规则同步（去填充底/反色对，留行内排布）

## Reference Files

- 设计母版：docs/brand/dsh-forge-mark.svg + docs/brand/README.md（概念/变体/禁用约定）
- 产品：apps/web/src/views/sidebar/ForgeBrand.tsx（替换落点）、sidebar.css（:279-293 规则同步）
- 官方刻度：壳品牌行请求 size 24（rail 同）——ForgeBrandMarkProps 契约不变

## Acceptance Criteria

- [ ] 左上角品牌 mark = 新「书 + 闪电」图形（浅色/深色主题各截屏归档执行记录；无黑色方块）
- [ ] 图形随令牌自适应：明暗主题切换均正确呈现（currentColor 消费官方 color 令牌，零裸值——token lint 绿）
- [ ] 24px（品牌行/rail）与悬停态可辨；aria-hidden 保持；ForgeBrandName 不变
- [ ] 官方壳品牌行交互零变化（整块 = 新会话快捷归壳）；e2e 既有断言零褪色（品牌 mark 无专锚，走查确认）
- [ ] tsc + lint + 定向单测绿

## User Stories

- 全部：品牌标识传达「知识就是力量」的产品心智（知识飞轮）。

## Hard Rules

- 令牌唯一：SVG 单 currentColor，外层色取 `--dsw-*` 令牌（执行裁决 label-primary 或 bluish）；**禁止固定色值/填充底**（docs/brand 禁用约定）。
- 未点名元素不变：品牌名、行本体交互、rail 形态。
- 官方件复用纪律不涉（自绘品牌资产属产品域，母版即设计裁决）。

## Implementation Notes

- 内联 SVG 优于 img 引用（免资产管线 + currentColor 直通）；三路径可按执行微调几何但保持概念与单色约定。
- 设计母版归 docs/brand/（项目知识区）；本任务为集成。
