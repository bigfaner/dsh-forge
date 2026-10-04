---
status: "completed"
started: "2026-10-04 11:57"
completed: "2026-10-04 12:09"
time_spent: "~12m"
---

# Task Record: fix-21 Fix(P0): 侧栏「＋」点击后系统文件浏览器不出现——host 侧 showOpenDialog 无 parent 无前台激活（Windows z-order 偶发不可见），对齐官方 host-directory-picker 前台工程

## Summary
恢复任务假前提处置：实盘核查无任何 fix-21 实现（main.ts:79 仍为根因原句、通道无 event/parent 面、全分支无 fix-21 提交）——按派发指令执行真实实现。对话框挂 parent 窗口：registerDirectoryPickerChannel 通道签名升级（handler 捕获 event.sender → 注入的 BrowserWindow.fromWebContents 绑定解析父窗 → showOpenDialog(parent, options) 对父窗模态/前台置顶，Windows 失焦态点「＋」仍立即可见），parent 解析 null 回退无 parent 形参（fail-soft），标题对齐官方 DIALOG_TITLE（Select Workspace Directory）；通道 wire 面零改动，fix-16 状态机/取消静默语义未触碰

## Changes

### Files Created
无

### Files Modified
- apps/host/src/ipc/directory-picker-channel.ts
- apps/host/src/main.ts
- apps/host/src/ipc/directory-picker-channel.test.ts
- tmp-ui-review/fix23-probe.mjs

### Key Decisions
- parent 解析经通道第三注入位 ParentWindowResolver（main 绑定 BrowserWindow.fromWebContents lambda）——通道保持 electron 依赖隔离：sender/parent 均 unknown 透传，真身形状由 main 绑定调用点编译期 pin（tsc 对照 Electron overload）
- 标题常量 DIRECTORY_PICKER_DIALOG_TITLE 落通道模块单源（main options 内联消费 + 单测逐字 pin 官方 host-directory-picker-native lib/index.js:111 口径）
- OpenDirectoryDialog 升级为 (parent: unknown) => Promise 形参——旧零参 fake 仍可注入（TS 少参可赋值），现有 4 支 pickDirectory/通道测试零改动兼容
- main.ts 结构 pin（≤110 行）达标收窄：pickDialogOptions 单行注解式 + 紧凑三元分支（97→107 行）
- 不引入官方 koffi/子进程 COM 方案（其面向无窗口 node 宿主；Electron main 有窗口在手，parent 形参即官方前台工程语义等价物）——遵任务边界条款

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1053
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] 通道签名升级：handler 经 fake ipcMain 捕获 event.sender → fromWebContents 解析父窗作 showOpenDialog parent 形参（main 绑定注入，electron 依赖隔离 + 可测注入面）
- [x] parent 解析 null（sender 无窗，理论不可达）→ 回退现行无 parent 形参（fail-soft，不比 fix-14 现状差）
- [x] 标题对齐官方 DIALOG_TITLE（Select Workspace Directory）——通道常量单源 + 单测逐字 pin
- [x] 单测扩展 directory-picker-channel.test.ts：parent 传入/无窗回退/缺省解析器/标题四支新增（10/10 全绿）
- [x] 质量门（恢复任务工作流序）：compile=playwright --list 61 用例/14 文件收集净、fmt=仓库无 formatter（no-op）、lint=oxlint+imports+tokens+selftest+tsc -b 全绿、unit-test=1053/1053 全绿

## Notes
实机双形态验收（dev+packaged 失焦态置顶/选目录表单相位/取消静默/repick 同径）留待走查人实机确认：机制面由 Electron parent 形参文档语义保障（官方前台工程等价物，任务 Root Cause 裁定），通道 wire 面零改动故 fix-16 语义面由 1053 全量回归背书。附带修正：tmp-ui-review/fix23-probe.mjs:111 未用变量加 _ 前缀（他任务诊断资产的 lint 门卫生修正，语义零改动——tmp-ui-review 在 oxlint 扫描面的既知纪律）。行数门首跑 112>110 已收窄至 107。诊断探针资产（fix21-probe{,2,3}.mjs）未改动。
