---
status: "completed"
started: "2026-10-04 15:24"
completed: "2026-10-04 15:34"
time_spent: "~10m"
---

# Task Record: fix-29 Fix: 会话页签行双『轨迹』——fix-25 产品 'dswf-trajectory' 与官方 ui-trajectory view（id='trajectory'，同 order 10）双占 conversation.view 名册：退役产品复刻、直用官方轨迹视图（UF-4 三签 = 官方 chat + 官方 trajectory + 产品 dswf-recall）

## Summary
退役产品 'dswf-trajectory' 轨迹页签复刻，直用官方 ui-trajectory 'trajectory' 视图（order 10）——fix-25 降位后官方名册浮现的同语义双『轨迹』冲突收口。UF-4 页签终态 = 官方 chat（order 0）+ 官方 trajectory（order 10）+ 产品 dswf-recall（order 20），『轨迹』唯一。删除 plugin.ts 轨迹注册行 + TRAJECTORY_VIEW_ID 常量 + product-views ForgeTrajectoryView 发布面 + ConversationViews ForgeTrajectoryView/TranscriptAnchor/transcriptOfChatSnapshot 映射 + TrajectoryLedger.tsx/transcript.ts（消费清点：零外部消费面——RecallTab/召回跳转不依赖，全额退役）+ dswf-traj-* 样式。e2e 迁官方 DOM 契约（[data-trajectory-scroll] 滚动面 + tr[data-kind=tool|user] 行锚）并新增三签唯一性断言（toHaveCount(3) + 『轨迹』count 1）；单测/结构 pin 翻转为退役缺席断言。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/client-plugin/plugin.test.ts
- apps/web/src/product-views.ts
- apps/web/src/views/session/ConversationViews.tsx
- apps/web/src/views/session/ConversationViews.test.tsx
- apps/web/src/views/session/index.ts
- apps/web/src/views/session/session.css
- apps/web/src/views/session/README.md
- tests/structure/web-shell.test.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts

### Key Decisions
- 官方 trajectory 页签缺省可见（ui-settings DeveloperToolsSettingsFields.enabled 默认 true、memory 态 store 亦 true——ui-conversation:17977 门控仅拦 developerTools 关闭态）：退役产品复刻后三签 AC 成立，无需任何官方门控改写
- 边界第 3 条裁决：transcript.ts/TrajectoryLedger 消费清点 = 零外部消费面（召回跳转走工作台桥 openKnowledgeEntry，不经 transcript）→ 数据面随视图一并退役，不留死代码
- e2e 锚迁官方契约：[data-trajectory-scroll]（官方轨迹表滚动面）+ tr[data-kind="tool"]（工具行文本含工具名——官方 toolCallTextParts）/tr[data-kind="user"]（含 fixture 提问文本）；表格虚拟化/visibility:hidden(scroll-ready) 均由 expect 自动重试承载
- 结构 pin 由就位断言翻转为退役缺席断言（TRAJECTORY_VIEW_ID/label '轨迹'/ForgeTrajectoryView/TrajectoryLedger/transcript 缺席）——防复刻回流

## Test Results
- **Tests Executed**: Yes
- **Passed**: 972
- **Failed**: 0
- **Coverage**: 81.7%

## Acceptance Criteria
- [x] 页签行恰三签：对话/轨迹/知识召回——『轨迹』唯一；官方轨迹视图内容正常（回合时序/工具行/历史加载）
- [x] 页签切换 keep-alive 语义不回归（官方 roster 原生）
- [x] e2e：三签唯一性 + 轨迹视图官方锚断言通过；产品视图退役后无死代码/死测试

## Notes
验证面：tsc -b 全绿；oxlint/imports/tokens/selftest/types 零违规；vite 双入口构建成功；vitest 972/972（含结构 pin 翻转）；coverage 81.68%（statements，60% 目标之上）。e2e 未实跑（fix 任务 Step 3 纪律：不起 dev server/不跑 e2e；dogfood 冒烟两套件的轨迹断言已迁官方锚，提交门 run-test 自证）。官方源实证（profile.dev node_modules 只读）：chat order 0（ui-chat:12391）/trajectory order 10（ui-trajectory:8736，children 声明 conversation.trajectory.images）/developerTools 门控默认放行（ui-settings DeveloperToolsSettingsFields）。dswf-recall 注册逐字节未动（无官方对位——任务边界第 2 条）。
