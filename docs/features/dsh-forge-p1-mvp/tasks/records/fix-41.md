---
status: "completed"
started: "2026-10-05 02:34"
completed: "2026-10-05 03:09"
time_spent: "~35m"
---

# Task Record: fix-41 Fix: 项目树收起后无法展开——行点击不翻转（DisclosureRow 缺省 expandOnRowClick=false，点标题无反应）；原生行为 = 整行 treeitem onClick 翻转

## Summary
fix-42（a28c3c7）对账收口轮：A 面（DisclosureRow expandOnRowClick 整行翻转）与 B 面（expandSidebar 壳回调消费——SidebarRail 图标列/搜索径）经逐 AC 与 HEAD 对账确认已由 fix-42 全量落地（ForgeWorkspacePanel.tsx:208/:70/:779/:823；单测 ForgeWorkspacePanel.test.tsx:112 aria-expanded+role=button+data-expandable）——产品代码零改动。本任务唯一真实现增量 = AC4 e2e 半面：session-workbench Step1b 附近新增 Step1b-r tree-row-toggle spec——零凭据径会话入树夹具（行尾新会话钮 startSession 建 blank 会话 + composer 发一条消息 → 用户事件落地 = 非 blank → sessionVisible 常显），随后断言标题点击/图标点击整行翻转（aria-expanded true↔false + 会话行卸载/恢复）、Enter/Space 键盘翻转、行尾 ellipsis 动作 stopPropagation 不翻转（菜单开合正交）、收展态跨过滤开关保持（collapsedIds 与过滤态机正交）、零会话行无 aria-expanded（expandable=false 行为不变）。两连跑绿（39.3s/39.2s）。

## Changes

### Files Created
无

### Files Modified
- e2e/specs/p1mvp/session-workbench.spec.ts

### Key Decisions
- 收口而非重实现：fix-42 台账明记「fix-41 交付面 = 本任务真子集已全量落地」——逐 AC 对账（代码位 + 单测在场 + 官方 DisclosureRow 语义源码核实 lib/index.js:3178-3184 rowExpands→onClick/aria-expanded/tabIndex/onKeyDown）成立，产品代码零改动，仅补 e2e 断言面
- 零凭据会话入树夹具：probe 实证 blank 会话不入树（45s 轮询 + rail 往返均不达——workspace 成员传播+选中态，fix-42 台账边界），而 startSession 后 composer 发一条消息（无凭据 agent 失败不碍）→ 用户事件落地 = 非 blank → 常显入树且 aria-expanded 在场——CI 可跑不依赖 dogfood 凭据
- AC2 断言面取 ellipsis 菜单钮而非新会话钮：二次 startSession 的 blank composer 在零凭据形态异步挂 API Key onboarding 模态（probe 实证 ~2s，全屏 mask 拦指针、挂载时点漂移数秒级），引入不稳定面；菜单钮同属行尾动作槽（同一 stopPropagation span），portal 菜单无遮罩、Esc 收起确定
- B 步活体验证协议落点：展开往返 = sidebar-view-align test1（本日 4/4 绿）+ Step1b（官方 toggle 往返——titlebar 形态红为已台账前置环境 flake，fix-42 A/B 实证，非产品回归）；树行点击/键盘翻转 = 新 Step1b-r 两连绿；rail「打开侧边栏」钮几何边界（titlebar 形态 regionArea 整域 display:none）= fix-40 官方壳设计，官方 WorkspaceBrowser 同域同藏

## Test Results
- **Tests Executed**: Yes
- **Passed**: 78
- **Failed**: 0
- **Coverage**: 63.6%

## Acceptance Criteria
- [x] AC1 点击项目行任意位置（标题/图标/行空白）翻转；Enter/Space 同效；aria-expanded 在场
- [x] AC2 行尾动作与标题点击互不干扰（stopPropagation 语义不破）
- [x] AC3 整侧栏收起→展开往返可用；树行收展状态在过滤开关后保持（collapsedIds 语义不变）
- [x] AC4 单测：ForgeWorkspacePanel 渲染面（expandOnRowClick 传入 + aria）；e2e：Step1b 附近树行点击翻转断言

## Notes
质量门：tsc -b 绿 + pnpm lint 全链绿（ox/imports/tokens/selftest/types/test-types）+ 侧栏域单测 77/77 绿（coverage 实跑 63.57% lines，v8 口径）。e2e：新 Step1b-r 两连绿；本日全量套跑（探针轮误触发）50 通过 8 红均与 fix-42 台账一致（titlebar 几何 flake + 链口径设计红 + 安装包形态缺前置），无新增红。probe 三轮留痕后已删（blank 入树不可达/单发无模态/二次 startSession 挂模态时点）。
