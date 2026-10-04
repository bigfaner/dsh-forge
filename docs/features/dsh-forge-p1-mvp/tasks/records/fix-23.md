---
status: "completed"
started: "2026-10-04 14:56"
completed: "2026-10-04 15:08"
time_spent: "~12m"
---

# Task Record: fix-23 Fix: 对话界面右上角对齐原生 dsh——官方 header 链点亮（「打开方式」+「⋯」更多操作 + corner 收展钮）+ 右栏 dock 全面复用官方 ui-sidebar-right（自研 dock 骨架退役，官方右栏已在运行时活体待接）

## Summary
fix-23 re-dispatch 复核收口：受阻面 ①（官方 header 链三件）已由 fix-25（8425433，官方 ConversationRoot 直渲 + 产品面官方 roster 降位）解除，②（右栏全面复用官方）由本任务前次 pass 交付——本次对当前 HEAD 全验收复核通过并落齐增量。活体复核（tmp-ui-review/fix23-verify.mjs，dogfood 真会话）：header/session.header 座在场（受阻期恒缺席的 [data-slot=conversation.header]=1）；「打开方式」拆分钮在场（菜单=文件资源管理器（默认）/VS Code/IntelliJ IDEA/PyCharm）；「⋯」菜单=下载 Session 日志/反馈（AC 原文口径）；corner ExpandButton（右栏隐藏时在场）收展往返 + guide「开始」649px + strip chrome 全通；产品三页签（对话/轨迹/知识召回）与知识视图联动零变化；pageerror/slot 崩溃零。AC4：.dswf-zones-dock/.dswf-workbench-docktoggle DOM 与代码面双缺席，e2e 锚已在官方 corner 锚（[data-sidebar-right-expand]）。本 pass 增量：zones/dock.ts+dock-kit.ts（+测试）死文件删除落 commit（fix-25 已删其余自研面、结构 pin web-shell 断言 zones 目录缺席——本删除为 pin 成立最后一块）；session-workbench Step5 陈旧「三件不可达」注释更正为 fix-25 后事实。门：tsc -b / oxlint / imports / tokens / selftest 全绿；targeted vitest（web+structure+contract）56 文件 625 测试全绿。

## Changes

### Files Created
- tmp-ui-review/fix23-verify.mjs

### Files Modified
- e2e/specs/p1mvp/session-workbench.spec.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-23.md

### Key Decisions
- ① 的实现载体归 fix-25（官方基座降位——main.conversation 影子退役，官方头部链 utilities/corner 白拿）；本 pass 仅复核 + 死文件删除收口，不重复实现
- zones/dock*.ts 四文件删除独立落本 commit：fix-25 commit 已删 zones 容器族但遗留这四个死文件于 HEAD（无任何引用），结构 pin tests/structure/web-shell.test.ts:83 断言 zones 目录缺席——删除为 pin 成立的最后一块
- session-workbench.spec.ts Step5 注释块（受阻期「三件不可达/转后续」口径）更正为 fix-25 后事实——锚本体（[data-sidebar-right-expand]）fix-25 已迁对，仅注释陈旧
- 已知边界（承 fix-25 记录不另立缺陷）：developerTools 开启期官方 trajectory 页签与产品 dswf-trajectory 并陈（探针 F6 双「轨迹」实证，生产默认关闭不现）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 625
- **Failed**: 0
- **Coverage**: 81.0%

## Acceptance Criteria
- [x] AC1 右上角三件在场：「打开方式」（open-in-app 应用解析后）+「⋯」（菜单含 下载 Session 日志/反馈）+ 右栏收展钮（右栏隐藏时在场）
- [x] AC2 收展钮 → 官方右栏展开，开始页 = 原生 guide 形态；tab 开合/收展/再展开正常
- [x] AC3 产品三页签（chat/召回/轨迹）与中区知识视图（show-knowledge）形态零变化
- [x] AC4 .dswf-zones-dock DOM 消失；e2e 锚迁移（.dswf-workbench-docktoggle → 官方 corner 锚）；WorkbenchZones/SessionToolbar 相关单测随迁

## Notes
验证证据链：活体探针 tmp-ui-review/fix23-verify.mjs（dogfood 真会话，glm-5.3-flash overlay）F1-F11 全绿——F1 zonesDockAbsent=true/officialConversation=1/headerSeat=1；F2 空会话 corner 在场；F3 展开 649px/stripTabs=[开始]/surface=horizontal；F4/F5 收展往返；F6 moreActionsBtn=1/moreOpenWaysBtn=1/页签=[对话,轨迹,轨迹,知识召回]（第二个轨迹=developerTools 门控官方项，已知边界）；F7 ⋯ 菜单=[下载 Session 日志,反馈]；F8 打开方式菜单=[文件资源管理器（默认）,VS Code,IntelliJ IDEA,PyCharm]；F9 轨迹 pane 切换通；F10 知识模式右栏隐藏/切回记忆恢复；F11 pageerror=[]。静态门：tsc -b exit 0；pnpm lint（ox/imports/tokens/selftest/types）exit 0（本 worktree 无 just/fmt 目标，oxlint 即格式门）。targeted vitest：--project web+structure+contract 56 文件 625 测试 0 失败；coverage 数字口径 = apps/web/src 范围 lines 81.02%（vitest v8 provider，426 web 测试），作用面覆盖目标 60% 达成。单实例纪律：探针前查活跃 electron 实例为零；探针独立 USER_DATA（Z: tmp-ui-review）+ 独立端口，收尾 taskkill + 清理。
