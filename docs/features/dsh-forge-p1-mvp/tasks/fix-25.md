---
id: "fix-25"
title: "Fix: 官方头部链三件不可达——main.conversation 影子与 renderSlot 授权冲突的架构重排（让官方 ConversationRoot 渲染中区，产品工作台降位到内容域）"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: 官方头部链三件不可达——main.conversation 影子与 renderSlot 授权冲突的架构重排（让官方 ConversationRoot 渲染中区，产品工作台降位到内容域）

## Root Cause

fix-23 ① 受阻的后续架构任务。根因（runtime 源码三层实证 + 探针实证）：slot runtime 按占用者注册行自声明的 children 发放 renderSlot 授权（dsh-client-ui-renderer lib/client.js standardKit：entry.children 在场才注入 renderSlot；boundRenderSlot 逐 key 校验 entry.children），子槽声明全局唯一（ui-slots register 重声明即 throw）——产品 main.conversation 影子行（-100 不声明 children，声明即与官方 ConversationRoot 行冲突）恒拿不到 renderSlot('conversation.header')；session.header 影子同样拿不到四子座 renderSlot（路径 B 同墙）。slots.d.ts:507 类型面为官方占用者所有——按类型面推断不成立。出路 = 官方 ConversationRoot（自带 children 声明）渲染 main.conversation，官方头部链（「打开方式」+「⋯」+官方 corner ExpandButton→官方右栏）随之白拿；产品三区工作台需降位/重排（候选：content 工厂域承载 zones 互换/hero/知识视图，或官方 views roster 承载产品页签）——触及 UF-4/UF-5/UF-2 hero/知识视图装配，需设计权威裁决后实施。② 已由 fix-23 交付（右栏官方接管全绿），本任务只处理头部链。

## Reference Files

- Source: apps/web/src/workbench/WorkbenchPanel.tsx;apps/web/src/client-plugin/plugin.ts;apps/web/src/views/session/SessionToolbar.tsx;apps/web/src/views/session/SessionPanel.tsx
- Test script: e2e/specs/p1mvp/session-workbench.spec.ts
- Test results: dogfood 冒烟 Step5：[aria-label=更多操作]/[aria-label=更多打开方式]/[data-sidebar-right-expand] 计数 0（[data-slot=conversation.header] 恒缺席）；单测/其余 e2e 全绿

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `apps/web/src/workbench/WorkbenchPanel.tsx;apps/web/src/client-plugin/plugin.ts;apps/web/src/views/session/SessionToolbar.tsx;apps/web/src/views/session/SessionPanel.tsx` to extract the first file path (comma-separated).
2. Run `forge surfaces --json <file-path>` to resolve surface-key/type.
3. Use the resolved surface-type to load the appropriate `rules/surfaces/<type>.md` for test orchestration guidance.

If `forge surfaces --json` fails (no surfaces configured, command not found), proceed without surface information — this does not block the fix.

## Fix Boundaries

When fixing test failures, observe these boundaries:

**Forbidden:**
- Starting dev server (`npx expo start`, `npm run dev`, etc.)
- Running `npm install` more than 3 times — mark task as blocked if dependency installation fails 3 times
- Running full test suite — regression is verified by the dispatcher after fix completes
- Manually opening browser to verify rendering

**Correct workflow:**
1. Read failing test + corresponding component source
2. Compare test's expected testID/selectors vs actual DOM structure
3. Modify component (add testID) or test (adjust selectors/assertions)
4. Run targeted tests on affected packages — unit tests must pass
5. Record completion

## Verification

After fixing, verify the fix works:
1. Run targeted tests on changed packages: `go test -race ./affected/package/...`
2. Replace the path with the actual packages you modified

> **Note:** Full project-wide tests run at CLI submit (`forge task submit`) — agent runs targeted tests only.

Full regression is verified by the dispatcher, not by this fix task.

When this task is recorded as completed via `task record`, the source task fix-23 is automatically restored to pending if all its dependencies are completed.

## 执行收口（2026-10-04，真实现——官方基座降位架构重排）

**裁决（设计权威 = 本任务）**：两候选经 runtime 源码核验——「content 工厂域承载」不可行
（ui-slots `registerFactory` 定义唯一：`slot factory "..." already has a definition` 即 throw，
产品不能占用 conversation.content 工厂）；裁决落位 **「官方 main 面板 roster + 官方
conversation.view roster」双缝组合**（官方先例：ui-plugin-manager/ui-schedule 全局面板 +
ui-trajectory 页签登记）。

**交付**：

1. **main.conversation 影子退役**（plugin.ts 零登记）：官方 ConversationRoot 直渲中区——
   官方头部链（`conversation.header` → `conversation.session.header` →
   utilities「打开方式」（ui-open-in-app）+「⋯」（session-log-download）+ corner 官方
   ExpandButton（ui-sidebar-right））与官方页签行/官方内容面（chat+composer）全部白拿
   ——fix-23 ① P0 目标（AC1 三件在场）机制面落位。
2. **产品面降位官方缝**（plugin.ts 登记族）：
   - `main` keyed `'dswf-hero'`（UF-2 零项目 hero——HeroPanel）+ `'dswf-knowledge'`
     （UF-5 知识视图——KnowledgePanel：UF-6 浏览面 + 桥抽屉缝消费）；
   - `sidebar.panellist` `'dswf-knowledge'`（官方 PanelRow 行——知识入口；产品 nav 行退役）；
   - `conversation.view` `'dswf-trajectory'`（轨迹台账——TrajectoryLedger + fix-11 转录
     接线原样迁入）+ `'dswf-recall'`（知识召回——RecallTab；`only:id` 激活即挂载 =
     AC-4 即时累积机制面）；对话 tab = 官方 'chat' 直用；
   - `shell.overlay` `'dswf-host'`（常驻壳宿主 ShellHost：UF-3 流程宿主 +
     `data-dswf-workbench/phase/view` 锚（e2e 迁移锚）+ hero 面板驱动（boot 期零项目 →
     selectPanel('dswf-hero')、注册成功 → null——一次性守卫防导航争用）+ 知识模式右栏
     联动（rightbarViewPlan 语义随迁，官方 sidebarRight 窄面））；
   - 工作台桥重排：`createWorkbenchBridge`（nav 闭包绑定官方 `layout.selectPanel`）+
     知识抽屉目标缝（召回视图跳转 → 知识面板——两棵独立槽位树唯一通道）；inject 增
     `'layout'`（官方 ui-layout 服务）。
3. **退役面**：WorkbenchPanel/ChatSurface/zones 容器族/视图态机（view-state +
   use-shell-view）/SessionPanel/SessionToolbar（官方刻度复刻）/自管面板钮
   （`.dswf-workbench-docktoggle`——官方 corner 接管）/自研嵌入配方
   （conversation.content variant=embedded——官方内容面直渲）。
4. **测试随迁**：新增 panel-model/ShellHost/KnowledgePanel/workbench-bridge/
   ConversationViews 单测（转录映射族自 WorkbenchPanel 测试原样迁入）；plugin.test
   登记族重写（含面板 key 字面量同源 pin + main.conversation 缺席 pin）；结构 pin
   （web-shell/scaffold）+ 契约 pin（pin-03）随迁；e2e 全量锚迁移（官方 DOM 契约：
   `[data-slot=main.conversation]`/`[data-conversation-tabs]`/`[data-composer-input]`/
   `[data-sidebar-right-expand]`/官方 PanelRow `button[aria-label=知识库]`/
   workbench 视图镜像锚）+ SMOKE-LEDGER 记账；lint selftest 负样例随 zones 退役迁
   components 域。
5. **验证**：tsc -b / oxlint / imports / tokens / selftest 全绿；vitest 98 文件 972 测试
   全绿；vite 双入口构建 + forge-client classic-script 形状 pin 通过。

**已知边界（P1 记录）**：知识面板 root 作用域无会话锚 → 项目锚恒走唯一项目兜底（多项目
知识锚定降级，会话锚定径由召回/轨迹视图承载）；developerTools 开启期官方 'trajectory'
（门控显示）与产品 'dswf-trajectory' 并陈；keyed main 面板非选中即卸载（DOM keep-alive
退役——会话状态归官方 store 自持，e2e 保留探针改官方语义断言）。官方头部链三件/页签行的
实机在场验证归 e2e 回归（session-workbench Step3/5 + installer-smoke 结构锚已迁官方面）。
