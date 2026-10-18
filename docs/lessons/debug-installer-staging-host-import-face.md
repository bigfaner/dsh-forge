# debug- 安装版启动即崩 ERR_MODULE_NOT_FOUND（staging 推导宇宙盲区：host dist import 面）

- Tags: dependencies, architecture, testing
- Date: 2026-10-18
- Source: fix-bug 会话（commit c4c5f48c）

## Problem

安装版（NSIS）dsh-forge 启动即弹「A JavaScript error occurred in the main process」：
`ERR_MODULE_NOT_FOUND: Cannot find package '@dsh-forge/git-worktree' imported from
...\resources\runtime\host-dist\ipc\worktree-rpc.js`。打包成功、安装成功、启动必崩；
dev 形态完全正常（profile.dev link 七件全量在场）。

## Root Cause

两层装配盲区叠加，且既有守护测试全部绿（不充分性的实证）：

1. **staging 推导宇宙盲区**：`stagedProductPackages` 种子 = userLayerRow ∪ 预设携带 ∪
   staged:true 覆写，闭包 = 种子的 `@dsh-forge/*` 依赖 BFS。host 主进程
   （boot/run.ts → ipc/worktree-rpc.ts）静态 import 的包**不在任何一径的推导宇宙**——
   git-worktree 是零依赖叶子（无人依赖它）、无预设行、无配置行 → 不物化进
   runtime/node_modules，而 host-dist 恒随包 → ESM 上溯落空启动崩。e791a46 事故后的
   「闭包自洽」测试只查**已 staging 包的依赖**（防漏闭包成员），不查「host import 面
   ⊆ staging 集」——本事故该测试绿着放行。
2. **行注行门单形态盲区**（次生）：`boot/child.ts` 的 `gitWorktreeRow` 在场门只探
   `profileDir/node_modules`（dev link 树）；打包形态 profile 目录**无 node_modules**
   （解析走 installAnchor = `{resources}/runtime/package.json` 邻接拓扑）→ 门恒 false：
   包即便在场也不注 loader 行、不进装配段 → 能力恒 absent，git 项目
   sessionCreate/prompt 双入口 W2 fail-closed 拒绝。

## Solution

- `contracts PRODUCT_PLUGINS` 增 `'git-worktree': { userLayerRow: false, staged: true }`
  ——host 静态 import 面走 staged:true 显式发货；行装载仍走 boot overlay presence 门
  （dev 同径单源，不入用户层模板）。
- `paths.ts` 增 `productPackagePresent(profileDir, installAnchor, pkg)`：dev profile 树 ∪
  anchor 邻接树双探针；child `gitWorktreeRow` 门换用（判据 = 包 package.json 在场）。
- **结构不变量测试**（本病理结构性消除）：installer-pipeline 增「host dist 静态
  `@dsh-forge/*` import 面 ⊆ staging 闭包」——扫描 `apps/host/dist/**/*.js` 的
  `from '@dsh-forge/…'` 全集对照 staging 口径，漏包即红。
- `runtime-packages PRODUCT_PLUGIN_PACKAGE_DIRS` 补子居所映射（plugins/ 下包的既有惯例，
  缺映射 = 闭包自洽测试 ENOENT 误报）。

## Reusable Pattern

- **「依赖闭包推导」只对推导宇宙内的引用负责**：清单制 → 推导制（e791a46）消除的是
  「忘列闭包成员」，不覆盖「宇宙外引用面」。新增一类引用面（host 主进程静态 import /
  契约 pin / e2e 装配）时，须同时问：这个面有没有对应的「面 ⊆ 集合」不变量测试？
- **双形态装配的在场探测必须两形态各有一探针**：dev = profile 树 link，packaged =
  installAnchor 邻接树——只探其一的门在另一形态静默恒 false（fail-soft 设计会把崩溃
  降级成功能缺席，更难发现）。
- 打包形态缺陷的本地静态复现法：扫 `release/staging/runtime/host-dist` 的
  `@dsh-forge/*` import 集，对照 `runtime/node_modules` 在场——ESM 上溯解析成败的
  静态等价，无需装包真机启动。

## Related Files

- `packages/contracts/src/product-plugins.ts`（staged 种子单一源）
- `scripts/assemble-installer-resources.mjs`（stagedProductPackages 推导）
- `apps/host/src/profile/paths.ts`（productPackagePresent 双形态探针）
- `apps/host/src/boot/child.ts`（gitWorktreeRow 门 + 装配段）
- `tests/structure/installer-pipeline.test.ts`（host import 面 ⊆ staging 闭包不变量）

## References

- 前篇（同症状族，硬编码清单时代）：[debug-installer-staging-closure-drift](./debug-installer-staging-closure-drift.md)
- docs/conventions/plugin-portability.md（插件可移植性裁决）
