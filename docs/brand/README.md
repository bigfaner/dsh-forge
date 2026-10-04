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

## 候选稿：鲸游书海（2026-10-04 v2 图标 / v3 背景，**已采纳——待接入**，fix-38）

同源概念演进（书 + 闪电元素谱系不变，叙事升维）：

> **知识（书海）托举探索者（鲸）前行；鲸的喷泉水花即闪电——力量由知识激发。**

**v2（现行候选）——鲸 = 原生 dsh 官方几何**：走查人指令「鲸鱼形象参考原生 dsh」——鲸剪影直接取
`@deepseek-ai/dsh-client-ui-primitives` 的 `FISH_LOGO_PATH`（官方 hero `HeroFish` 同源，viewBox
23.16×17.04，几何零改动仅缩放平移）——品牌血缘直承官方 dsh，与产品的官方优先纪律同构。

- 图标母版：[whale-sea-mark.svg](./whale-sea-mark.svg)（viewBox 24×24，currentColor 三层：官方鲸
  剪影 ×0.62 / 双层书页浪 .88+.6 / 闪电喷泉；腹线没入书浪 = 破浪而行，16px 可辨锚 = 鲸尾卷 + 闪电）
- 对话面板背景：[whale-sea-conversation-bg.svg](./whale-sea-conversation-bg.svg)（v3——**海洋由无数本各式各样的书构成**：
  133 本四形混排「立脊如礁 / 斜倚如波 / 书堆如屿 / 翻摊如浪花」，四深度带随双正弦波脊起伏递退；
  原生 dsh 鲸 ×14 破浪其间（鲸腹前有破浪锚书制造沉浸），携闪电喷泉与灵感气泡；
  视觉权重压底部 ~28%——中部会话栏素净；元素不透明度 .03–.12 不伤正文可读性；
  生成器 `tmp-ui-review/gen-whale-brand-v3.mjs`（种子 20261004，确定性可复现/可调参））
  - CSS `background-image` 消费：内嵌 `prefers-color-scheme` 双态（墨 `#22314a` / 纸 `#e8eef8`）——跟随**系统**主题
  - 需精确跟随**应用内**主题（`body[data-ds-dark-theme]`）：改为内联 `<svg>` 消费（场景全 currentColor，容器 `color` 即主题色）+ 建议叠 `opacity` 守护（≤.5）与 `pointer-events: none`
  - 顶部 55% 渐隐遮罩已内置（消息流区域恒净）
- 若采纳替换现行标识：图标消费位（ForgeBrand.tsx 内联）与变体/禁用约定沿用上表；面板背景消费位 = 官方会话滚动容器（fix-25 后官方 ConversationRoot 面）铺底，不得进 composer/输入区
- v1（自绘鲸剪影）已被 v2 替换——官方几何优先，自绘形态退役不存档

## 历史

- 2026-10-03 前：「知」字方块（`--dsw-alias-brand-primary` 深底 + 反色字）—— 浅色主题呈近黑方块（走查人报告「黑色图片」问题）
- 2026-10-03：本设计（fix-15）替换 —— 透明底 + currentColor
- 2026-10-04：「鲸游书海」候选稿 v1（自绘鲸）→ v2（**官方 FISH_LOGO_PATH 鲸**）→ v3（背景概念收紧：**无数各式书本构成海洋本体**，133 本四深度带）——**同日走查人裁决采纳**（接入任务 fix-38；接入后本节标题升「现行」，fix-15 标降历史）
