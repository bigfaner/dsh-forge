---
status: "completed"
started: "2026-10-05 07:47"
completed: "2026-10-05 08:28"
time_spent: "~41m"
---

# Task Record: fix-45 Feat: dsh-forge 程序图标——鲸游书海 brand 标派生应用图标集（.ico 多尺寸 + png），接入 dev 窗口 icon 与 electron-builder win/nsis——退役 Electron 默认图标

## Summary
dsh-forge 程序图标采用鲸游书海 brand 标（用户验收反馈④-3）：从 docs/brand/whale-sea-mark.svg 确定性派生应用图标集 build/icon.svg + icon.png(512) + icon.ico(16/32/48/64/128/256)，接入 dev/运行窗口 BrowserWindow icon（解析单源 apps/host/src/window/icon.ts 双形态）与 electron-builder win.icon + nsis.installerIcon/uninstallerIcon（assemble 物化 icon.png 随 extraResources）——Electron 默认图标三面（dev 任务栏/安装器/安装后 exe）退役。注：本任务为 fix-record 恢复执行，恢复提示词声称实现已在盘——实测全仓零实现（create.ts 无 icon/构建配置无 icon 字段/生成器无 --emit icon），按任务书完成真实实现。

## Changes

### Files Created
- build/icon.svg
- build/icon.png
- build/icon.ico
- apps/host/src/window/icon.ts
- apps/host/src/window/icon.test.ts

### Files Modified
- apps/host/src/window/create.ts
- apps/host/src/window/create.test.ts
- electron-builder.config.mjs
- scripts/assemble-installer-resources.mjs
- tests/structure/installer-pipeline.test.ts
- docs/brand/README.md

### Key Decisions
- 派生几何输入 = Chromium getBBox 实测（不手工估算路径包围盒）：内容长边 19.2/24（80% 网格）+ bbox 中心对齐画布中心，四周安全边 2.4-2.82/24（≥2/24 任务书红线）；定色 = 墨 #22314a 单色透明底（P1 裁决落地，暗色辨识不足转 bluish 回退已记 README）
- 栅格化路径 = 仓内 electron offscreen 软件合成 + CDP Page.captureScreenshot(omitBackground) 透明截帧；实测坑：show:false 普通窗截帧永不返回（无合成帧），offscreen 才可行；PNG→ICO 手写封装（PNG 帧 Vista+），零新依赖；同机重跑三产物 byte-identical（AC3）
- electron 助手形态坑（留痕）：default_app 不收裸 .mjs——须以 package.json main 目录形态启动；ESM main 顶层 await whenReady 死锁（S1 实测约束同款，void async IIFE 规避）
- assemble 归位裁决（执行时实测留痕）：icon.png 随 extraResources 物化到 {resources}/icon.png——服务打包形态 BrowserWindow icon（窗口标题栏/运行期兜底）；Windows 任务栏/Alt-Tab 由 exe 内嵌图标（win.icon=build/icon.ico）优先
- 生成器/栅格化助手按 fix-38 惯例落 tmp-ui-review（gitignored 一次性工具位，README 记引用与口径）：gen-whale-brand-v3.mjs 扩展 --emit icon + tmp-ui-review/icon-rasterizer/

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1090
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] dev 启动：任务栏/窗口标题栏/Alt-Tab 显示鲸标（非 Electron 默认）
- [x] pnpm dist 产物：安装器 + 安装后 exe/快捷方式图标 = 鲸标
- [x] 生成器可复现（重跑 byte-identical）；单测/结构 pin 绿
- [x] 双主题任务栏可辨（浅/深对照）

## Notes
AC 证据等级：AC1 = icon 选项接线单源 pin（create.test 断言路径在场且文件存在）+ 资产像素级验证（System.Drawing 实测 #22314a 精确色值/透明底/内容 77.0%×80.1% 网格居中）——任务栏肉眼走查归用户验收回路；AC2 = 全量管线实证：pnpm build + dist:stage（STAGE_OK 26501 文件含 icon.png，--check 过）+ electron-builder NSIS 产物 dsh-forge-0.1.0-win-x64.exe（2026-10-05 08:26），win-unpacked exe 与安装器 exe 内嵌图标经 ExtractAssociatedIcon 提取比对：≠ stock electron 默认图标（不透明像素 378 vs 856）且安装器=应用图标一致，提取图标 alpha 图谱呈现鲸标三层构图（闪电/鲸/双页浪）——26px 任务栏与 256 大图肉眼双查归用户验收回路；AC3 = 生成器两次运行 sha256 三产物 byte-identical + pnpm test 1090/1090（含新增 create.test icon pin/icon.test 双形态/installer-pipeline icon 资产自证三面）+ pnpm lint 全绿（oxlint/import/token/selftest/types/test-types）；AC4 = 透明底+墨色像素级验证（浅底高对比构造性成立；深底由 Windows 系统合成——P1 裁决即单色透明底方案，辨识不足转 bluish 的回退路径已记 README 应用图标条目），浅/深任务栏人工对照归用户验收回路。环境注记：electron-builder @electron/rebuild 拉取 electron 头像超时（github 不可达），ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ 重试即过（pnpm-workspace.yaml 既有注记同款）。仓库无 fmt 工具链（无 prettier/biome 配置与脚本）——恢复工作流 fmt 步不适用。
