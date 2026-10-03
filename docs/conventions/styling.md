---
title: "样式风格约定"
domains: [styling, tokens, theme, component-reuse, dsw]
---

# 样式风格约定

> 第一版严格遵循 dsh 官方样式风格（六条硬规则）：令牌唯一、官方件复用优先、形态对齐、官方刻度、主题联动、机械验证。

## 令牌纪律

### TECH-styling-001: 令牌唯一（--dsw-*）

**Requirement**: 样式零裸值——色/字/距/圆角/阴影全部取 `--dsw-*` 令牌；令牌 lint（`scripts/lint-tokens.mjs`，G0 组成部分）扫描 CSS 与 TS/TSX 内联样式机械执行；豁免 = 行尾 `/* dsw-raw */`（CSS）/ `// dsw-raw`（TS），使用须在执行记录说明理由（布局刻度豁免注记制）；主题随官方令牌自动联动，不自维护主题态。
**Source**: feature/dsh-forge-p1-mvp TECH-011（tech-design §样式风格纪律第 1/5 条 / scripts/lint-tokens.mjs）

## 官方件复用

### TECH-styling-002: 官方件优先与形态对齐

**Requirement**: 官方现成件（ui-primitives 原子 + ui-* 组件）一律复用、禁止重造（按钮/输入/弹层骨架/页签/列表行）；自绘仅限官方无对应的领域组件（知识卡片/域树行/召回分组行等）且必须吃令牌、行语言对齐官方；交互形态不发明平行模式（抽屉对齐官方 dockkit 形态、列表行对齐官方 sidebar 行语言、弹层/菜单对齐官方 popover 模式）；排版刻度不自创（令牌取值），布局尺寸以原型结构为准、视觉细节以官方为准（冲突时布局结构不变、视觉让官方）。
**Source**: feature/dsh-forge-p1-mvp TECH-012（tech-design §样式风格纪律第 2/3/4 条）
