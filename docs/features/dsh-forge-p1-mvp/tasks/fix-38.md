---
id: "fix-38"
title: "Fix: 品牌接入「鲸游书海」——侧栏标识替换（官方 FISH_LOGO_PATH 鲸 + 书页浪 + 闪电喷泉，经 primitives 导入零几何拷贝）+ 对话面板书海背景铺底（官方滚动容器 CSS 锚 + 明暗双资产 + 可读性守护）"
priority: "P1"
estimated_time: "4h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 「鲸游书海」品牌接入（走查人 2026-10-04 采纳）

> 采纳裁决：图标 v2（官方鲸）+ 背景 v3（无数书本构成海洋）。设计母版与约定见 [docs/brand/README.md](../../brand/README.md)「候选稿：鲸游书海」节（接入后升现行，fix-15 标降历史）。

## ① 侧栏标识替换（ForgeBrand.tsx）

- 消费位：`apps/web/src/views/sidebar/ForgeBrand.tsx` 的 `ForgeBrandMark`（`sidebar.brand.mark` 槽位内容件，内联渲染，`size` prop 保持——壳请求 24/rail 24 官方刻度）；
- **几何零拷贝**：鲸剪影经 `import { FISH_LOGO_PATH } from '@deepseek-ai/dsh-client-ui-primitives'`（官方导出面，注释明示「exported for consumers that compose their own svg」）——`<path d={FISH_LOGO_PATH} transform="translate(5.0 4.9) scale(0.62)"/>`；书页浪两路径 + 闪电喷泉一路径照 [whale-sea-mark.svg](../../brand/whale-sea-mark.svg) 母版内联（产品自有元素，非官方几何）；
- viewBox 0 0 24 24；**单一 currentColor**（透明度 .88/.6/.55/.4 档随母版）；16px 可辨锚 = 鲸尾卷 + 闪电；
- 变体/禁用约定沿用 README 上表（label-primary / 强调色裁决 / 禁固定色值与深底方块）；
- 现行 fix-15 标（书+闪电）退役：ForgeBrand.tsx 三路径替换；`docs/brand/dsh-forge-mark.svg` 母版保留为历史档（README 历史节已有记载）。

## ② 对话面板书海背景铺底

- **消费位**：官方会话滚动容器（fix-25 后中区归官方 ConversationRoot——产品**不注入组件**，走 CSS 锚）：官方 DOM 契约 `[data-conversation-scroll]`（或其实证等价容器锚——执行时以 runtime DOM 为准）挂 `::before` 覆层：`position:absolute; inset:0; pointer-events:none; z-index:0; background:url(...) center/cover no-repeat; opacity:.85`；
  - **不得进 composer/输入区**：选择器精确锚定滚动容器（README 红线）；覆层不拦截指针、不进无障碍树；
- **明暗双资产（应用内主题精确同步）**：由生成器 `tmp-ui-review/gen-whale-brand-v3.mjs` 派生两份静态资产入 `apps/web/public/brand/`（vite public → dist，经 dsh-forge://app/ 服务）：`whale-sea-bg-ink.svg`（浅色主题用墨 #22314a）+ `whale-sea-bg-paper.svg`（深色主题用纸 #e8eef8）——CSS 双规则：缺省 ink、`body[data-ds-dark-theme]` 覆盖 paper（**不经 prefers-color-scheme**——跟随应用内主题，README 双口径中的内联口径等价实现）；
  - 资产内不含媒体查询（颜色烘焙）；生成器加 `--emit ink|paper` 参（或双导出），母版 single-source；
- **可读性守护**：母版自带顶部 55% 渐隐 + 元素不透明度 .03–.12——叠加 CSS `opacity` 总守护 ≤.85；消息气泡/正文层 z-index 在覆层之上（官方 DOM 层序验证）；
- e2e：现有会话 DOM 契约测试全绿 + 新增双主题下背景在场/指针穿透断言（覆层 `pointer-events:none` 实证）。

## 验收

1. 侧栏品牌行（宽/rail 两态）：鲸游书海标渲染正确，明暗主题随令牌翻转，16px rail 态可辨；
2. 对话面板：底部书海 + 破浪鲸在双主题下正确着色（应用内主题切换即时跟随）；正文/输入区无背景污染；滚动/选择/点击交互零阻挡；
3. 全套单测/e2e 绿；docs/brand README 状态节更新（候选→现行）。

## Reference Files

- 母版：docs/brand/whale-sea-mark.svg（v2 图标）、whale-sea-conversation-bg.svg（v3 背景）、README「鲸游书海」节（概念/约定/红线）；生成器 tmp-ui-review/gen-whale-brand-v3.mjs（种子 20261004；需扩展双资产导出）
- 消费位：apps/web/src/views/sidebar/ForgeBrand.tsx（①替换点）；官方 primitives `FISH_LOGO_PATH` 导出面（lib/index.js:5401 注释明示 compose 用途）；官方滚动容器锚：ui-conversation client.js ConversationContent `seatResizeRef`/`[data-conversation-scroll]`（:16227-16237 实证）
- 关联：fix-15（前任标识——历史档）、fix-25（官方基座降位——背景走 CSS 锚而非组件注入的根因）

## 边界与不做

- 不 fork/复制 FISH_LOGO_PATH 字面量进产品源码（经官方导出面消费——上游几何演进自动跟随）；
- 背景不进官方 hero（空会话大标）与其他视图（召回/官方轨迹）——仅会话滚动容器；
- 不动 fix-15 历史母版文件与 README 历史记载。
