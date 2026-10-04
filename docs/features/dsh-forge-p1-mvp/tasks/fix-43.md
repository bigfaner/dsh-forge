---
id: "fix-43"
title: "Fix: 项目树对齐原生残留差值——会话行缩进 26→8（原生 depth*12 顶层=0，状态点对齐 folder 槽）+ 组内行距 2px + 行 hover 底出血右缘 + 段头 36px 刻度/label 14/20 常规"
priority: "P1"
estimated_time: "3h"
complexity: "medium"
dependencies: ["fix-42"]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 项目树视觉对齐原生 dsh 残留（用户验收 2026-10-05 反馈④-1）

## 症状（用户原话）

「左侧栏的项目树似乎没有对齐原生dsh。」（fix-42 已落，结构/交互对齐完成——残留为视觉刻度差）

## 差值清单（本会话活体测量 + 原生 CSS 逐值对照；测量样本 = fix-42 后真身 DOM）

| # | 面 | 产品现状（实测） | 原生（官方 CSS 实值） | 差值 |
|---|---|---|---|---|
| 1 | **会话行缩进** | `padding-inline-start: 26px`（sidebar.css:220 硬编码） | `calc(8px + var(--dsh-workspace-indent,0px))`；indent = `depth*12px`（SessionTree groupSection 内联设置）——**顶层组 depth=0 → 8px**，状态点 16px 槽正对 folder 16px 槽下方 | **+18px**（最显眼：会话行整列右移） |
| 2 | **组内行距** | 行间 0（sessions 容器/项目块无 gap） | `.groupSection>*+*{margin-top:2px}` —— 组内相邻行恒 2px 节奏 | 0 vs 2px |
| 3 | **行 hover 底右边界** | 行盒右距面板缘 8px（容器 padding 8 + 行 padding 8） | 行盒**出血至面板右缘**（listArea `margin-right:calc(-1*inset)` 抵消浏览器根 padding-right，regionArea 再 `margin-right:-12px` 抵消壳 padding——hover 药丸右缘贴滚动条区） | 右 inset 8 vs 0 |
| 4 | **段头** | 高 34px（内容驱动）+ padding 2/0/4 | `sectionHeader{height:36px; margin-bottom:4px; justify-content:flex-end; gap:4px; padding-left:4px}` | 高 34 vs 36 + 排布 |
| 5 | **段头 label** | `--dsw-font-xs-strong-13`（13 加粗） | `.sectionLabel{line-height:20px}` 无字体覆盖——继承壳 `font-size:14px` 常规体三级色 | 13 strong vs 14 regular |

## 修复方案（sidebar.css 数值面对齐——结构/交互已对齐不动）

1. **①会话行缩进**：`padding-inline-start: 26px → 8px`（产品树单层无嵌套——depth 恒 0；「暂无会话」占位行缩进同步对齐 folder 槽位 `26px → 8px+16px 槽宽口径`，按截图对照定值）；
2. **②行距**：`.dswf-sidebar-sessions` 及项目块内部相邻行 `*+*{margin-top:2px}` 同款（flatlist 已 2px 不动——树态补齐）；
3. **③右缘出血**：项目区容器 `padding-right: 8px → 0`、行盒右出血（`margin-right: -8px` 或容器负 margin 同型官方链）——hover 药丸右缘贴面板边（滚动条区）；行内 `padding-right: 8px` 保持文字距缘；
4. **④⑤段头**：`.dswf-sidebar-sectionhead{height:36px; margin-bottom:4px; justify-content:flex-end; padding-left:4px}` + label 改继承 14/20 常规三级色（`--dsw-font-xs-strong-13` 退役该处）；
5. 验收锚：与原生 dsh 桌面（或官方 dsh-webfrontend）**并排截图对照**（fix-42 AC 同法）——行高/缩进/行距/药丸宽/段头五项逐一对上；dsw-raw 豁免注记按现行惯例同步（值 = 官方 Rows/WorkspaceBrowser 原值）。

## 验收

1. 会话行状态点槽正对项目行 folder 槽下方（左缘同 x）；行间 2px 节奏；hover 药丸右缘贴面板边（与原生并排无可见差）；
2. 段头 36px、label 14/20 常规三级色；
3. 全套单测/e2e 绿（侧栏几何断言如有硬编码 26px/34px 同步更新——forge 锚 data-dswf-* 不动）。

## Reference Files

- apps/web/src/views/sidebar/sidebar.css（:220 会话缩进 / :27 容器 padding / :30-44 段头 / :195-200 sessions 容器）
- 原生实值源：dsh-client-ui-workspace client.js——Rows.module.css（`padding-inline-start:calc(8px + var(--dsh-workspace-indent,0px))`）、WorkspaceBrowser.module.css（`sectionHeader` 36px 族、`listArea` 负 margin 出血链、`.bhn1Oq_rail{padding-right:0}`）、groupSection `*+*{margin-top:2px}`、`--dsh-workspace-indent:${depth*12}px`（SessionTree 内联）
- 测量留痕：tmp-ui-review/probe-geo.mjs（fix-42 后真身 DOM 几何——sectionhead 34/row 34×252/inset 8/8 等）
- 关联：fix-42（结构/交互对齐——本任务是其视觉刻度收尾）、fix-41（行翻转）

## 边界与不做

- 不动结构/交互（fix-42/41 已对齐面：treeitem 翻转、hover 动作、菜单、rail 图标列）；
- 不引入 --dsh-workspace-indent 变量机制（产品树恒单层——depth 恒 0，直取 8px 终值；注释记母本公式）；
- 段头 label 改常规体后与官方词条样式核对一次（zh/en 同改）。
