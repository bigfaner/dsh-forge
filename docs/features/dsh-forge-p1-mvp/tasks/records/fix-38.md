---
status: "completed"
started: "2026-10-04 23:07"
completed: "2026-10-04 23:40"
time_spent: "~33m"
---

# Task Record: fix-38 Fix: 品牌接入「鲸游书海」——侧栏标识替换（官方 FISH_LOGO_PATH 鲸 + 书页浪 + 闪电喷泉，经 primitives 导入零几何拷贝）+ 对话面板书海背景铺底（官方滚动容器 CSS 锚 + 明暗双资产 + 可读性守护）

## Summary
「鲸游书海」品牌接入：①侧栏标识替换——ForgeBrandMark 三层改母版 v2（官方 FISH_LOGO_PATH 经 @deepseek-ai/dsh-client-ui-primitives 导出面 import 消费，几何零拷贝，仅 translate(5.0 4.9) scale(0.62)；书页浪双路径 .88/.6 + 闪电喷泉照母版内联；单一 currentColor 沿 fix-15 禁用约定），fix-15「书+闪电」三路径退役；②对话面板书海背景铺底——生成器 gen-whale-brand-v3.mjs 扩 --emit ink|paper|all 双静态资产（种子 20261004 确定性派生、烘焙色零媒体查询）入 apps/web/public/brand/，apps/web/src/styles/brand.css 于官方会话面 CSS 锚铺底（active 相位门 + hero 红线 + 召回/轨迹 :has 退场；body[data-ds-dark-theme] 双口径跟随应用内主题，不经 prefers-color-scheme；覆层 pointer-events:none + opacity .85 总守护）；宿主壳 scheme 资产白名单补 /brand/（vite public 物化位此前不可达——探针 404 实证后修复 + 单测钉）；docs/brand README 候选→现行、fix-15 降历史档；新增 e2e brand-whale-sea.spec（双主题在场/红线/指针穿透）+ session-workbench dogfood 冒烟 active 相位在场断言。

## Changes

### Files Created
- apps/web/src/styles/brand.css
- apps/web/public/brand/whale-sea-bg-ink.svg
- apps/web/public/brand/whale-sea-bg-paper.svg
- e2e/specs/p1mvp/brand-whale-sea.spec.ts

### Files Modified
- apps/web/src/views/sidebar/ForgeBrand.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/main.ts
- apps/web/src/product-views.ts
- apps/web/src/styles/README.md
- apps/host/src/window/web-document.ts
- apps/host/src/window/web-document.test.ts
- tmp-ui-review/gen-whale-brand-v3.mjs
- docs/brand/README.md
- docs/brand/whale-sea-mark.svg
- docs/brand/whale-sea-conversation-bg.svg
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/support/anchors.ts

### Key Decisions
- 锚选型（SPEC CONTRADICTION 裁决）：任务②字面 [data-conversation-scroll]::before + z-index:0 与其自身「正文层在覆层之上」冲突——runtime DOM 实证滚动容器为 static 且消息行（如 Sixlwa_userRow）非定位流内容，定位态 z-index:0 伪元素按 CSS 绘序必绘于正文之上；按任务「实证等价容器锚（以 runtime DOM 为准）」条款改锚 [data-conversation-content]（官方定位祖先 .body，几何即滚动视口）+ isolation:isolate + z-index:-1，其余属性照字面（absolute/inset:0/pointer-events:none/center-cover/opacity .85）——零官方类名耦合承载层序
- 红线相位门：仅 [data-content-phase=active] 铺底（官方 hero 相位渲染 HeroFish 大标 + 「探索未至之境」——双品牌视觉冲突即「不进 hero」红线根因）；召回（[data-dswf-pane=recall]）/轨迹（[data-trajectory-scroll]）经 :has 退场
- 宿主 /brand/ 资产路由：vite public 物化 dist/brand/ 但壳 scheme 白名单仅 /、/index.html、/assets/*、/forge-client.js——探针实证 404 后扩白名单（SVG MIME 已在表）+ web-document 单测钉
- 双主题口径：ink 缺省 + body[data-ds-dark-theme] 覆盖 paper（官方 ui-theme 布尔标记实证 toggleAttribute 于 body）；官方缺省 preference=system 随 OS——e2e/探针均显式控制标记而非假设浅色（dogfood 冒烟按 body 标记现状分支断言）
- e2e 载体：无凭据环境 active 相位不可达（blank 会话恒 hero）——active 视觉态经官方 DOM 契约属性（data-content-phase/根 data-phase）模拟（CSS 锚为被测面），真实 active 在场断言入 dogfood 冒烟；主 CSS/assets 已由运行期探针全绿实证（hero none→active ink→dark paper→回 ink、composer 座 z7>覆层-1、elementFromPoint 命中真实元素、资产 fetch 200、明暗双截图视觉核验）
- 生成器 --emit master（缺省）|ink|paper|all 双产物形态：母版 single-source（再生成 diff 仅注释升现行，几何字节等价 133 本）；tmp-ui-review/ 属 gitignore 既有约定（生成器沿前态不入仓，母版+资产入仓为权威面）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 811
- **Failed**: 0
- **Coverage**: 80.9%

## Acceptance Criteria
- [x] 侧栏品牌行（宽/rail 两态）：鲸游书海标渲染正确，明暗主题随令牌翻转，16px rail 态可辨
- [x] 对话面板：底部书海 + 破浪鲸在双主题下正确着色（应用内主题切换即时跟随）；正文/输入区无背景污染；滚动/选择/点击交互零阻挡
- [x] 全套单测/e2e 绿；docs/brand README 状态节更新（候选→现行）

## Notes
验证面：单测 web+host 607 + structure/contract 204 全绿（vitest）；tsc -b + 全套 pnpm lint（oxlint/imports/tokens/selftest/types/test-types）绿；e2e 62 测试/15 文件收集通过（全量 e2e 归 submit 质量门——执行规约不就地跑）；运行期探针（tmp-ui-review/fix38-probe.mjs，不入仓）全绿 + 明暗/rail 三截图视觉核验。覆盖：web 项目 80.93% stmts/83.03% lines（ForgeBrand.tsx 满覆盖——vitest 表缺席语义）；web-document.ts 97.59%。视觉走查备注：24px 实测标呈鲸体质量 + 闪电可辨（母版 16px 可辨锚=鲸尾卷+闪电的设计主张在 24px 下成立；细部融合为母版采用形态固有，几何照母版零偏差）。
