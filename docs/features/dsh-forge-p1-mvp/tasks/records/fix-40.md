---
status: "completed"
started: "2026-10-04 23:58"
completed: "2026-10-05 01:14"
time_spent: "~1h 16m"
---

# Task Record: fix-40 Fix: Windows 壳标题栏模式未激活——preload 缺 `<html data-platform>` / `data-windows-titlebar` / `--dsh-windows-titlebar-height` 标记，会话头右上角图标钮（右栏展开钮等）沉入原生 WCO 覆盖条不可见

## Summary
Windows 壳标题栏模式激活：preload 顶层标记 html[data-windows-titlebar] + 内联 --dsh-windows-titlebar-height:32px（与 create.ts titleBarOverlay.height 单源 = window/titlebar.ts），官方补偿面全套生效——frame padding-top/顶部拖拽条、侧栏折叠/新会话钮 32px 带区内居中、会话头整行（含右上角右栏展开钮）让出原生 WCO 覆盖条（用户验收报障②修复）。data-platform 经活链实证刻意不标：任意值即使 runtime=desktop，官方 ShortcutsService 硬性要求 window.dshDesktop.keyboard（树内无官方实现），标记即 25 插件激活级联失败、boot 全红——缝已在代码注记 + 单测/e2e 负向 pin 守门。附带修复 e2e/support/launch.ts ROOT 差一级（fix-37 抽层回归，致全体 electron e2e spawn cwd 非法即 cmd.exe ENOENT——修复后 e2e 车道恢复可跑）。

## Changes

### Files Created
- apps/host/src/window/titlebar.ts
- e2e/specs/p1mvp/windows-titlebar-shell.spec.ts

### Files Modified
- apps/host/src/ipc/preload-api.ts
- apps/host/src/ipc/preload.mts
- apps/host/src/ipc/preload-api.test.ts
- apps/host/src/window/create.ts
- apps/host/src/window/create.test.ts
- e2e/support/launch.ts

### Key Decisions
- data-platform 刻意不标（任务方案①的活链否决）：官方 dsh-client-shortcuts ShortcutsService 构造器在 runtime=desktop（dataset.platform 存在，任意值）时 throw "Desktop keyboard bridge unavailable"（缺 window.dshDesktop.keyboard）→ 25 插件激活级联失败；A/B 实测：标记=win32 → boot 面全红，不标 → 全绿。dshDesktop 能力面（keyboard/shortcuts/analytics/chat/settings/… 七包消费）树内无官方实现，属独立桥接任务；翻转须随桥落地（单测+e2e 负向 pin 守门）。代价：快捷键解析面保持 web 口径（与现状一致，非回归）
- 官方补偿面全部只认 data-windows-titlebar（与 data-platform 无关）——报障根因修复只需 win32 标 data-windows-titlebar + 内联高度变量（dockkit 按 documentElement.style 内联读取）；darwin/linux 零标记
- 高度单源 window/titlebar.ts（WINDOWS_TITLEBAR_HEIGHT=32）：create.ts titleBarOverlay.height 与 preload 内联变量共消费，宿主-壳防漂移（create.test 单源 pin）
- 附带必要修复：e2e/support/launch.ts ROOT 差一级（fix-37 抽层误减一段——文本段运算文件自身占一段；原母本三段口径）→ HOST_DIR 指向不存在目录 → launchElectron spawn cwd 非法 → 全体 electron e2e `spawn cmd.exe ENOENT` 即时失败；不修则本任务 e2e 不可验证（host-boot 同害实证）
- preload.mts DOM 窄面 declare（宿主包 lib=ES2023 无 DOM，main 面保持 DOM-free）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 175
- **Failed**: 0
- **Coverage**: 75.6%

## Acceptance Criteria
- [x] 发送消息后会话头整行完整可见：右上角图标钮在原生窗口钮带区之下渲染、可点击、tooltip 正常
- [x] 官方侧栏折叠钮/新会话钮 32px 带区内垂直居中；顶部空白带可拖拽移窗
- [x] macOS 形态零回归（darwin 分支仅静态保证）
- [x] 全套单测/e2e 绿（几何断言随修正对齐官方形态）

## Notes
单测 175/175（apps/host vitest，含新增标记面 5 测 + create 单源 pin）；coverage apps/host 75.63%（ipc 100% lines / window 97.4%）。e2e（win32 实机）：fix-40 新 spec 2/2 绿（标记面：三标记+frame padding-top 32px+:before drag+折叠钮 fixed 带区内居中；会话面：会话头内容行 y=32、右栏展开钮 y=43≥32 可见可点+tooltip「打开侧边栏」+点击展开官方右栏）；回归面全绿：host-boot 2/2、web-shell 1/1、brand-whale-sea 2/2、hero-control 2/2、smoke-skeleton 3/4。预存失败（非本任务）：smoke 组一在 L44 首断言（data-dswf-view=session）挂——A/B 实证与本修正无关（stash 标记后同败）；根因 = fix-25 官方面板态镜像后 fresh boot 发 data-dswf-view=hero（panel-model centerViewOf 设计行为），smoke 该行仍是 hero=session 视图期的旧口径，且 fix-37 launch 差一级致该断言从未在新面板机下跑过（全部 e2e 当时即失败在启动面）——属 smoke 台账/视图机对账议题，建议另立 fix。会话头几何断言锚 .wSkVaW_header（官方头内容行；[data-slot=conversation.header] 为 display:contents 零盒槽壳不可量测——实测定夺）。tmp-ui-review/fix40-verify.mjs 留存为验收探针（注册→session 相位→几何 dump）。apps/host/profile.dev/cordis.patch.yml 有非本任务的运行期变更（llm-pi-ai provider 行），未纳入提交。
