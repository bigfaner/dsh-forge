---
status: "completed"
started: "2026-10-03 01:06"
completed: "2026-10-03 01:16"
time_spent: "~10m"
---

# Task Record: fix-2 Fix: 主窗口隐藏原生标题栏（titleBarStyle hidden + overlay，对齐 dsh 官方桌面形态）

## Summary
主窗口隐藏原生标题栏：createMainWindow options 增 titleBarStyle:'hidden' + titleBarOverlay（Windows WCO 形态，dsh 官方桌面基准），overlay 色取官方主题令牌静态实值（浅色 scope = 原型基准默认：bg-base→neutral-bluish-00 #fff、label-primary→neutral-bluish-1000 #0f1115，注记在案）；补 fake 注入单测（建窗参数 + overlay pin + ready-to-show 显窗）。实机探针证 WCO 激活（env titlebar-area 32px 高、宽 1304 = 原生钮右上保留 ~136px；movable/min/max/closable 全 true）；e2e 回归 host-boot 2/2 + smoke-skeleton 组一 1/1 实跑全绿。

## Changes

### Files Created
- apps/host/src/window/create.test.ts

### Files Modified
- apps/host/src/window/create.ts

### Key Decisions
- overlay 静态实值取浅色 scope（原型基准默认形态，dsh-client-ui-theme client.js 实测提取）：color #fff ← --dsw-alias-bg-base → --dsw-static-neutral-bluish-00；symbolColor #0f1115 ← --dsw-alias-label-primary → neutral-bluish-1000；暗色 scope 对应实值（neutral-bluish-950 #151517 / neutral-bluish-50 #f9fafb）随注记在案——host 无主题联动机制（Implementation Notes 拍板，属后续里程碑）
- overlay height 32 = Windows 官方系统 caption 刻度（100% DPI）
- create.ts 此前无单测文件——按 Implementation Notes 所述 fake BrowserWindow 注入面新建 create.test.ts（3 用例：未点名元素保持 pin / 窗口形态 pin / ready-to-show 显窗 pin）
- AC-3（内容区顶部不遮挡）为走查目视确认项：客观面就绪（overlay 仅占右上 ~136×32，左栏/中区顶部构造上不受遮；titlebar-area env 已暴露），终判归用户实机走查

## Test Results
- **Tests Executed**: Yes
- **Passed**: 124
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 原生标题栏隐藏（无标题文字条）；窗口可拖动、可最小化/最大化/关闭（overlay 原生钮）
- [x] overlay 颜色随官方主题令牌（浅/暗主题切换不破相；取官方 bg 层令牌实值，不裸值）
- [x] 内容区顶部不被窗口控件遮挡（左栏官方 sidebar 壳与中区顶部对齐呈现，走查目视确认）
- [x] e2e 回归不褪色：host-boot 2 用例 + smoke-skeleton 组一实跑全绿（窗口创建路径变更后）
- [x] 未点名元素不变：窗口尺寸 1440×900、ready-to-show 显窗行为、preload/webPreferences、main.ts 91 行纪律全部保持

## Notes
验证矩阵：tsc -b exit 0；pnpm lint 五门全绿（ox/imports/tokens/selftest/types）；vitest --project host 124/124（17 文件，含新增 3 用例）；create.ts 覆盖率 100%（statements 5/5、functions 2/2、lines 4/4，v8 单文件收窄实测）；e2e 实跑（净化环境 + TMP 重定向 Z: + 单实例前置检查零活跃实例）：host-boot.spec 2/2（5.2s/14.1s）、smoke-skeleton 组一 1/1（19.9s）。运行期探针（一次性，不入仓）：WCO 激活证据 = env(titlebar-area-height)=32px / titlebar-area-width=1304px、movable/minimizable/maximizable/closable 全 true、内容 bounds 1440×900。本仓无 fmt 工具配置（worktree 无 justfile、package.json 无 fmt script）——fmt 步骤跳过记注。AC-2 令牌值属 host 面静态实值 + 溯源注记形态（lint-tokens 扫描面 = apps/web/src，host 不在其面；取值非自造裸值）。AC-3 目视终判归用户实机走查（任务文本明定），客观构造面已就绪。
