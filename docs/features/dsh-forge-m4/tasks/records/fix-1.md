---
status: "completed"
started: "2026-09-29 13:25"
completed: "2026-09-29 14:35"
time_spent: "~1h 10m"
---

# Task Record: fix-1 Fix: SC7 e2e 腿板内 dock 交互失稳(会话域右栏重组下的行展开/行点击)

## Summary
SC7 板内 dock 交互失稳根因修复 + 两腿 test.fixme 恢复(sc7-task-session-trace.spec.ts 两簇全绿 ×3 连续全量运行)。四个独立根因逐一定位并修复:①后台 onboarding 自动 dismiss 器误把任务详情 dock 当上游模态(dock 本身即 role=dialog aria-modal=true 且无 data-dsh-forge-dialog),每 500ms 点击 dock 的最后一个按钮 —— 命中展开态挂接行的 [打开] 即随机切换会话 → 会话域右栏重组 → dock 整体卸载(『行展开 aria 复位 / 元素 detached』flake 家族的主源);dismiss 器现排除 dock 容器并改为 DOM click(Playwright click 的 pointerdown 落在 dock 外会触发其 outside-close 仲裁)。②ensureBoardActive/ensureOverviewActive 的 inventory-keyed focus 会域 seam 缺陷:右栏按会话挂面(openSession 切会话即挂全新折叠面),openTabs 是跨会话清单 —— 切会话后 focus(外国 tabId) 是 controller 的静默 no-op(C6「查看任务」/概览行 seam 落空,dock 永不回挂);现经 openTab 走唯一『挂在会话』命令(per-pane page 去重落 focus-or-open,rebind 窗口期 require() 抛出降级为 false)。③lazyUpstreamFace 适配器记忆键冲突:sessions.list 同时喂 toSessionsFace 与 toLineageSessionsSource 两个 face,仅按 member 的 WeakMap 键让先建者答所有消费者 —— C6 元数据条按 boot 渲染序随机领到平接口 SessionsFace(无 .list)→ 快照恒 undefined → 条永久 unbound(运行间掷硬币);记忆键改 (narrow, member) 双层。④toLineageSessionsSource 原样返回 traceable proxy,长持消费者随 proxy 失效而死(service.list 读 undefined);现按 toSessionsFace 先例桥接捕获嵌套 list store。驱动侧确定性:onboarding 排除 + prefers-reduced-motion(emulateMedia 关 vendored stylesheet 过渡)+ 自卸载点击助手([打开] 点击的自身效果即卸载按钮,Playwright actionability 会把已命中的点击报为失败 —— 后condition 判定取代目标存活判定)+ 会话切换后经同一用户路径重入 pane 宿主 dock。另修两处拼写级 CSS 选择器残引号('[data-dsh-forge-metadata-open"]' 解析即抛)。一处断言位置迁移(本体逐字零删改):⑥ 改名桩行名断言移至 ⑦ 打开之后 —— 冷 catalog 行只有 descriptor label,session/title 持久投影仅在 host 装载该会话(打开)后流入会话列表(derive 本就 title-first,与 sessions 服务自身 displayTitle 规则一致),迁移后经同一用户路径重入 dock 断言,证据见 keyDecisions。

## Changes

### Files Created
- docs/features/dsh-forge-m4/tasks/process/record-fix-1.json

### Files Modified
- packages/plugins/forge-workbench/src/client/views/rightbar/tabs-model.ts
- packages/plugins/forge-workbench/src/client/lineage/types.ts
- packages/plugins/forge-workbench/src/client/index.ts
- packages/plugins/forge-workbench/tests/rightbar-tabs-model.spec.ts
- packages/plugins/forge-workbench/tests/lineage.spec.ts
- packages/plugins/forge-workbench/tests/rightbar-container.spec.tsx
- packages/plugins/forge-workbench/tests/rightbar-doc-depgraph.spec.tsx
- tests/e2e/specs/m4/sc7-task-session-trace.spec.ts

### Key Decisions
- 根因一(主 flake 源,DOM 状态探针定位):任务详情 dock 即 role=dialog aria-modal=true(UF3 非模态焦点契约)且不带 data-dsh-forge-dialog(那是 M3 DialogFrame 家族属性),后台 dismiss 器的模态选择器命中 dock 本体,每 500ms 点击其最后一个按钮 —— 展开态下即挂接行 [打开],随机切会话/卸载 dock。证据:探针在断言窗内捕获 currentTreeRow 无驱动跳变(如 sc7-sess-sub-renamed)+ modal 计数含 dock 自身。修复:选择器排除 dock 容器 + DOM click(免 pointerdown 触发 dock 的 outside-close)。
- 根因二(会话域 seam):vendored service.ts 的 focus 对不在挂载会话 layout 的 tab 是文档化静默 no-op,而 openTabs 清单跨会话;openTab 是唯一保证作用于挂载会话的命令(store 的 per-pane page 唯一性使其落 focus-or-open 并同步展开列)。单测补外国清单行回归 + rebind 窗口 require() 抛出降级回归。
- 根因三(记忆键冲突):lazyUpstreamFace 的 adapterMemo 仅以 service[stableMember] 为键,sessions.list 一键两 face(toSessionsFace/toLineageSessionsSource),先建者答全部;C6 条拿平接口 SessionsFace(无 .list)→ lineageSnapshotOf 恒 undefined → 永久 unbound(哪面赢随 boot 渲染序 —— 台账『随运行随机失稳』的机制解释)。修复:WeakMap<narrow, WeakMap<member, face>> 双层键。
- 根因四(proxy 生命周期):toLineageSessionsSource 返回 cordis traceable proxy 本体,长持(React props)跨 fiber 失效即死(service.list → undefined);按 toSessionsFace 先例桥接捕获嵌套 list store(存store 活过 proxy 世代),单测以 delete service.list 回归钉死。
- 自卸载点击助手(clickSelfUnmounting):[打开] 点击的成功自身即卸载按钮(会话切换 → 右栏重组 → dock 卸载),Playwright actionability 视元素中途消失为失败、后续重试永远找不到目标 —— 证据:clickStable 报『never settled』时 currentTreeRow 已是目标会话(点击实际已命中)。以 landed 后置条件谓词(面板重组为新会话折叠面 + 树 aria-current)取代目标存活判定。
- 断言位置迁移(本体逐字零删改,唯一一处):⑥『改名桩行名 = 手工改名(会话名自持)』断言移至 ⑦ 打开 SUB_RENAMED 之后 —— 60s 探针证实冷 catalog 行只携带 descriptor label(改行名恒为合规名),session/title 持久投影仅在 host 装载该会话后流入列表;derive 本就 title-first(与 sessions 服务 displayTitle 规则一致),产品语义不变,仅断言时机对齐数据到达;⑦ 打开后经同一用户路径(概览任务行 → 板 pane)重入 dock 再断言。两处 CSS 选择器残引号为语法修复(原样即抛 Unexpected token),非断言弱化。
- 确定性环境:page.emulateMedia({ reducedMotion: 'reduce' }) —— vendored SidebarRight.module.css 的 prefers-reduced-motion 规则关闭面板 slide 过渡,expandRightbar/chip 断言不再与动画赛跑(forge 组件内联 transition 不受影响,由 DOM-click 路径绕过 actionability 兜底)。

## Test Results
- **Tests Executed**: Yes
- **Passed**: 2109
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 两 test.fixme 簇解除挂起(test.fixme → test,断言本体零删改)且连续 ≥2 轮全量运行稳定通过
- [x] sc1/sc2 m4 e2e 腿保持全绿
- [x] 单元面保持全绿(forge-workbench 含新增回归测试)
- [x] 全量 e2e 前单实例锁纪律(tasklist 探测,every batch)

## Notes
升级链回填:2.9 台账中『板内 dock 交互随运行随机失稳』的机制现已完全解释 —— ①dismiss 器误击 dock(主源,运行序敏感)②ensureBoardActive 跨会话清单 focus 静默 no-op ③adapterMemo 记忆键冲突(boot 渲染序掷硬币)④traceable proxy 长持失效;四者叠加产生『>10 轮同类尝试仍漂移』的表象。源任务 2.9 的两条 test.fixme 已恢复并通过,其 AC-2..AC-6 的挂起原因消除;2.9 记录的 blocked 状态待 CLI 自动解锁,若仍 blocked 且交付面已绿则以 completed 重交(按调度指令)。单实例锁纪律贯穿:每批 e2e 前 tasklist 探测,全程无外部实例。
