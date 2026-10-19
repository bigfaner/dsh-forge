# 打包形态 profile 树物化后应用必挂——模板漏 boot 链依赖 + peer 闭包缺口

- 日期:2026-10-19
- 标签:dependencies, local-dev-deployment
- 来源:fix-bug(2026-10-19 D:\software\dsh-forge 部署机事故;commit 1c58675d)

## Problem

打包版部署机上应用「崩溃后无法启动」:每次启动退出码 1,主窗口不出现。harness.log 无任何新记录(启动死在 boot 早期),data\ 下仅 state.db/DIPS 的 mtime 证明启动尝试发生过。

## Root Cause

用户在打包版装第三方插件(`@annotutor/annotutor` link)触发 `data\profile` 的 pnpm 物化(nodeLinker: hoisted),把「打包形态 profile 无树、boot 链走 resources/runtime 邻接容器」的设计态打破。此后两层连环:

1. **模板漏同步(fix-20 半成品)**:`@deepseek-ai/dsh` 不在物化模板依赖、也不在 dsh-base/dsh-web-app 依赖闭包——树物化时永不进树 → 半树 → `boot-chain.ts` fix-20 守卫 fail-closed 拒启。fix-20 当年只给 dev 的 profile.dev 补了该依赖行,打包模板漏同步。
2. **peer 闭包缺口**:补齐 dsh 后暴露第二层——dsh-app-boot 六个 peerDependencies 中 `cordis-plugin-group` 不被任何正常依赖携带(`autoInstallPeers: false` 下其余五件经 dsh-base 闭包 hoist 进树,唯它缺席)→ 树分支 import 必崩。dev 形态没炸纯属 bare import 沿 `apps/host/node_modules` 上溯意外救场;打包版 data\ 上溯为空。

进程崩溃只是把物化中断放大(半树 + 大量包物理缺失);**就算装完不崩,重启照样起不来**。守卫报错话术 "reinstall apps/host/profile.dev" 为 dev 专属,部署机无从下手。

## Solution

- 物化模板 dependencies 补 `@deepseek-ai/dsh`(DSH_STACK_VERSION)+ `@deepseek-ai/cordis-plugin-group: ~1.0.4`(版本范围对齐 dsh-app-boot peer 声明);profile.dev 同步补行。
- boot-chain 两处守卫报错恢复指引两形态分流(dev 重装 profile.dev / packaged 补装缺件或删树回退内置 runtime)。
- materialize.test.ts 的 dev↔模板同步 pin 扩展覆盖依赖行(机械防再漏)。

## Reusable Pattern

- **现场勘查序**(部署机无法启动类故障):CrashDumps 目录按进程名定位崩溃实例 → 三处 harness.log($APPDATA 形态名 / userdata.dev / data\logs)对时间线 → data\ 目录 mtime 反推启动尝试 → profile 树与 runtime 容器逐包对照。
- **hoisted 树状态账本脱节**:pnpm 判 "Already up to date" 而物理文件缺失时,普通 `install --force` 不自愈——须 `rm -rf node_modules` 后整树重装。
- **树承载 boot 链的依赖完备性审计**:对拍 boot 链件的 peerDependencies 与树内在场集,peer 不在正常闭包就得显式声明进模板——不能指望 autoInstallPeers。

## Related Files

- `apps/host/src/profile/template.ts`(物化模板依赖行)
- `apps/host/src/boot/boot-chain.ts`(fix-20 守卫与恢复指引)
- `apps/host/src/profile/materialize.test.ts`(dev↔模板同步 pin)

## References

- fix-20(commit 55cfda0c)boot 链统一实例裁决
- docs/architecture/packaging-pipeline.md(打包形态 profile 物化拓扑)
