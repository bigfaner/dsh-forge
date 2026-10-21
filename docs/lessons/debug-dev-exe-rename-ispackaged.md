# debug- dev 改名副本 exe 令 app.isPackaged 失真——形态门单腿崩（dev:debug 启动崩）

- Tags: local-dev-deployment, error-handling
- Date: 2026-10-19
- Source: fix-bug 会话（commit fadfa662）

## Problem

`pnpm run dev:debug` 启动即崩：

```
[host] 启动失败：Error: host-dist 缺席（半成型资源）：...\apps\host\node_modules\electron\
dist\resources\runtime\host-dist\boot\child.js——runtime 布局装配断裂（assemble-installer-resources.mjs / dist:stage）
```

错误文案指向安装器 staging 管线，但 dev 形态根本不走该管线——报错方位与真实根因完全脱节。

## Root Cause

前一天 dev.mjs 为进程名区分（2026-10-19 用户裁决）复制 `electron.exe` → `dsh-forge-dev.exe`
启动。Electron 的 `app.isPackaged` 按**可执行文件名**判定（非 `electron*` 即 packaged）→ dev
下恒 true（差分实测：同一 tiny app，electron.exe = false，dsh-forge-dev.exe = true，
resourcesPath 相同）。main.ts 三处 `app.isPackaged` 门随之在 dev 误入打包分支：

1. `DSH_FORGE_RESOURCES_DIR := process.resourcesPath`（= electron `dist\resources`）→
   `resolveChildEntry` 按打包形态探 `runtime/host-dist/boot/child.js` 缺席 → 直接 throw
   （即报错本体；该 throw 是 fix-33 ④ 有意早失败，非过错）；
2. 便携数据目录分支把 dev userData 劫持进 `node_modules\electron\dist\data\`（旁证：该目录
   在场，仅含 DevToolsActivePort——启动崩在 child spawn 前故无更多数据）；
3. F12 devtools 门（`!app.isPackaged`）同步失效（静默）。

## Solution

形态判据收口 `apps/host/src/profile/paths.ts` 单一来源：

- `isDevForm(env)`：DSH_FORGE_DEV_PROFILE 真值判定（resolveHostPaths `form` 与 main.ts
  `IS_DEV` 同源消费，消除三处内联重复）；
- `isPackagedForm(env, appIsPackaged)` = isPackaged ∧ 非 dev——main.ts 三处门替换。

安装版/安装形态 e2e 行为不变（无 DEV_PROFILE → isPackagedForm 同旧值）；dev 恢复 dist
同目录 child 入口 + userdata.dev。单测：`paths.test.ts`「bug: dev 改名副本 exe
（isPackaged=true ∧ DEV_PROFILE 真值）误判打包形态」用例 pin。

## Reusable Pattern

- **改名 dev exe = 隐式形态翻转**：任何「复制 electron.exe 换个名」的 dev 便利（进程名
  区分、任务栏分组等）都会令 `app.isPackaged` 恒 true。形态门不得单看 isPackaged，须与
  环境显式形态标记合取（本项目 = `isPackagedForm`）。
- **报错方位 ≠ 根因方位**：错误文案指责 staging 管线时，先问「该形态会走这条管线吗」；
  dev 崩在打包专属路径 = 形态门失准的味道。
- **磁盘旁证 + 差分实验**：`node_modules/electron/dist/data/` 在场 = 便携数据分支曾在
  dev 跑过；同一 tiny app × 两个 exe 名各跑一次打印 `app.isPackaged`，五分钟锁定机制，
  免去全量 dev 复跑。

## Related Files

- `apps/host/src/profile/paths.ts`（isDevForm / isPackagedForm）
- `apps/host/src/main.ts`（三处形态门）
- `scripts/dev.mjs`（dsh-forge-dev.exe 复制——诱因，非过错）

## References

- 姊妹篇（同为「双形态判定面」事故家族，方向相反）：[debug-installer-staging-host-import-face](debug-installer-staging-host-import-face.md)（打包面漏包 vs 本例 dev 误入打包面）
- 约定：`docs/conventions/packaging.md` TECH-packaging-002（isPackaged 不得单腿作形态门）
