---
status: "completed"
started: "2026-10-03 01:26"
completed: "2026-10-03 02:03"
time_spent: "~37m"
---

# Task Record: fix-4 Fix: 右栏 dock 页签条整理（strip 内衬 / 收展钮归位 / 拖拽调宽手柄——官方行语言，机制语义零变化）

## Summary
右栏 dock 页签条视觉整理（fix-4）：strip 补官方行语言内衬（4px 8px + gap 8px）并分区（页签区 flex:1 + 收展钮尾部 flex:none，原型 rb-tail 同构位）；官方 SegmentedTabs 收敛回内容宽（fit-content 容器约束，不随轨道宽满宽拉伸）；补左缘 8px col-resize 拖拽调宽手柄（300px–70vw，原型 #rb-resize 同型：role=separator/aria-orientation=vertical/tabindex/键盘 ←→ 步进，hover 高亮 = interactive-bg-hover 令牌）；dock body 补内衬（4px 16px 20px 原型刻度）；背景面 bg-layer-1 → bg-base（走查点名偏差④对齐原型 rightbar，令牌内取值）。宽度记忆 = zones 机制内态（--dswf-dock-width 内联注入经 CSS 消费，collapsed/hidden 规则收零轨道不受内联影响），view-state.ts 零改动（Hard Rule 机制语义零变化）。WCO 避让：strip padding-right 经 calc(100vw - env(titlebar-area-width, 100vw)) 让开原生窗口控制钮区（fix-2 实测右上 ~136×32；探针实证尾钮右缘 1304.01 = env 边界）。机制/断言零褪色：view-state 11 + dock 8 + WorkbenchZones 19（含新增 3 例结构 pin）+ dock-width 8（新增纯函数面）全绿，web 全项目 405/405，smoke-skeleton 组一 e2e 终态 build 后复跑 1/1 绿。

## Changes

### Files Created
- apps/web/src/zones/dock-width.ts
- apps/web/src/zones/dock-width.test.ts

### Files Modified
- apps/web/src/zones/zones.css
- apps/web/src/zones/WorkbenchZones.tsx
- apps/web/src/zones/WorkbenchZones.test.tsx

### Key Decisions
- 宽度记忆挂 zones 内态（Hard Rule 裁决二选一：shell 态机或 zones 内态；取 zones 内态使 view-state.ts 零改动，机制语义零变化达成面最小）；经 CSS 自定义属性 --dswf-dock-width 内联注入而非内联 width——collapsed/hidden 规则按特异性收零轨道，computed 0px 断言不受影响（e2e L3 实证）
- 拖拽/键盘推导收敛为纯函数模块 dock-width.ts（clamp 300–70vw + 小视口下限守卫 + 方向语义：左缘手柄指针左移加宽），交互胶水（pointer capture + lastX 增量）留组件；SSR 单测覆盖纯函数面与结构 pin，pointer/键盘运行期面归 e2e/探针（沿仓内既定分工）
- SPEC 裁决：strip 内衬取官方行语言刻度（4px/8px/gap 8px，sidebar.css 行语言同源 dsw-raw 豁免）而非原型 rb-strip 的 10px/8px——Implementation Notes 更Specific 指令（官方件保留、仅取布局刻度）优先；body 内衬取原型 4px/16px/20px 原值（AC 制度口径：布局尺寸按原型结构取值）
- WCO 避让用 env(titlebar-area-width, 100vw) 动态让位（非 WCO 环境回退 0px）而非静态 ~136px——fix-2 记录在案的原生控制钮区几何，官方桌面形态下的正确机制；dsw-raw 豁免（env 几何值非令牌面）
- 官方 SegmentedTabs 根为 repeat(n,1fr) 等分网格，在 flex:1 分区内会满宽拉伸（单页签成宽药丸）——容器规则 .dswf-zones-dock-tabs > * { width: fit-content; max-width: 100% } 收敛回内容宽（实测 60px 恒定，与改前 flex 项自然宽同值）；仅约束容器内几何，官方件本体样式零改写
- 背景面 bg-layer-1 → bg-base：走查 §2.3 偏差④点名（bg-layer-1 vs 原型 bg-base + 发线），Hard Rule 令牌内取值边界内执行；边线令牌现状保持（border-left l2 / strip border-bottom l2 不动）
- 宽度不加 transition：原型 width 过渡会令收起/展开的 computed width 断言（e2e L46/L689 收零轨道样本）读到中间值致闪断——收展即瞬切（现状行为保持）
- dsw-raw 豁免 4 处（zones.css）：strip 4px 8px/gap 8px（官方行语言刻度，官方主题无间距标尺令牌）、padding-right env calc（WCO 几何避让）、body 4px 16px 20px（原型 rb-body 刻度）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 405
- **Failed**: 0
- **Coverage**: 60.0%

## Acceptance Criteria
- [x] strip 视觉不挤排：内衬对齐官方行语言刻度，SegmentedTabs 与收展钮分区呈现（走查目视确认「不乱」）
- [x] 拖拽调宽：左缘 8px col-resize 手柄（hover 高亮 = interactive-bg-hover 令牌），宽度 300px–70vw，会话内记忆；收起/展开/强制隐藏三态语义与拖宽正交
- [x] dock body 内衬就位（占位文本不贴边；后续槽位内容不被本任务改写）
- [x] 官方件复用不变：SegmentedTabs / Button 原样保留，无自绘 chips、无新基础组件
- [x] 机制与断言零褪色：UF-5/UF-7 相关单测（view-state 11 + dock 8 + WorkbenchZones）与 smoke-skeleton 组一 e2e 全绿
- [x] token lint 绿；新增刻度 dsw-raw 豁免注记同步执行记录

## Notes
验证矩阵：tsc -b exit 0；pnpm lint 五门全绿（ox/imports/tokens 0 裸值 122 文件/selftest 14 负样例/types）；vitest --project web 405/405（46 文件，含新增 dock-width 8 例 + WorkbenchZones 新增 3 例）；覆盖率（v8 单文件收窄）dock-width.ts 100% 全维、WorkbenchZones.tsx 50% stmt（未覆盖面 = pointer/键盘交互胶水，SSR 面不可达，归 e2e——运行期探针实证）、聚合 60% stmt 达 60% 目标；e2e smoke-skeleton 组一 1/1（19.8s，终态 dist 复跑）。运行期探针（一次性，不入仓，tmp-ui-review/fix4-probe.mjs）：默认宽 340px；拖拽 -120px → 463.99px；键盘 ← → 479.99px；宽度记忆跨收起/展开 + 知识强制隐藏往返恒 479.99px（正交性）；collapsed computed 0px；hover 高亮 rgba(38,49,72,.06) ≡ 令牌 #2631480f；body padding 4px 16px 20px；WCO 避让实测 strip padding-right 137.6px = 100vw − env(titlebar-area-width 1304)，尾钮右缘 1304.01 与原生控制钮区零重叠；像素扫描（tmp-ui-review/scan-strip.mjs）证页签 60px 内容宽恒定。注意：探针直启 electron 载入的是 apps/web/dist——CSS 改动后须 pnpm -C apps/web build:vite 再探（本轮一度误读旧 dist）。AC-1 终判目视归用户实机走查（任务文本口径，同 fix-2 AC-3 形态）。fmt：本 worktree 无 formatter 配置（沿 fix-2/fix-3 记注）。
