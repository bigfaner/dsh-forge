# dsh-forge 品牌标识

## 概念：知识就是力量

翻开的书（**知识**）托举一道自书脊升起的闪电（**力量**）—— 知识资产是产品的核心卖点（知识飞轮），闪电同时呼应「能量/驱动」，书页左右非对称透明度（.88 / .6）制造翻动的层次。

- 母版：[dsh-forge-mark.svg](./dsh-forge-mark.svg)（viewBox 24×24，三路径纯几何，无外部依赖）
- 用色：**单一 `currentColor`** —— 随官方令牌自动适配明暗主题（浅色 = 深字、深色 = 浅字），杜绝固定黑块问题
- 消费位：`apps/web/src/views/sidebar/ForgeBrand.tsx`（`sidebar.brand.mark` 槽位内容件）内联渲染；品牌名 `dsh-forge` 字标不变
- 24px 小尺寸可读性：闪电为视觉主体（全不透明），书页为基底（降透明度）—— 缩到 16px 仍可辨

## 变体与使用约定

| 场景 | 用法 |
|---|---|
| 侧栏品牌行 / rail | 内联 SVG，`color: var(--dsw-alias-label-primary)`（或 bluish 强调色，执行裁决） |
| 需要强调色时 | 外层容器设 `color: var(--dsw-alias-brand-primary)`（仅描形，不做填充底） |
| 禁用 | 禁止固定色值 / 禁止深色填充方块底（黑色图片问题的根因） |

## 历史

- 2026-10-03 前：「知」字方块（`--dsw-alias-brand-primary` 深底 + 反色字）—— 浅色主题呈近黑方块（走查人报告「黑色图片」问题）
- 2026-10-03：本设计（fix-15）替换 —— 透明底 + currentColor
