---
status: "completed"
started: "2026-10-04 10:47"
completed: "2026-10-04 11:42"
time_spent: "~55m"
---

# Task Record: fix-20 Fix(P0): 添加第三方模型提供商报错「profile reload requires the root Include entry」——dsh-app-boot 双实例致 bootstrapIncludes WeakMap 分裂，统一实例解析

## Summary
统一 dsh-app-boot 实例解析，修复原生设置流程「添加第三方模型提供商报错 dsh: profile reload requires the root Include entry」P0。根因（双点 require.resolve 实证）：bootstrapIncludes 是 dsh-app-boot 模块级 WeakMap，dev 形态 boot child 静态 import 链按 apps/host/dist 位置解析到 workspace .pnpm 物理拷贝，而插件树消费者（dsh-plugin-manager:2033 / dsh-config-editor:75,125,128 的 reconcileProfilePatches）按 profile.dev 配置目录位置解析到 profile.dev/node_modules 平铺拷贝——两副本模块域 WeakMap 互不可见，注册面（boot→mountRootInclude）与消费面分裂恒 throw。打包形态实测本就单容器（staging/win-unpacked 双点同路径），无需修。修复（裁决=child 侧解析统一，两消费面收敛 profile 树同一物理拷贝）：① 新增 apps/host/src/boot/boot-chain.ts——boot 链两件（@deepseek-ai/dsh-app-boot + @deepseek-ai/dsh/profile-boot）按 createRequire(profileDir/cordis.yml) 锚点解析（与插件 bare import 同锚点），树完整在场→树内 import；缺席（打包形态/无树 fixture）→adjacent 回退（静态等价，4.1 邻接拓扑自然单实例）；半树或解析逃逸出树→fail-loud fatal（BootChainSplitError，防依赖树漂移再犯的启动自证）；② child.ts 两运行时静态 import 改 type-only + 经 loadBootChain 载入（原生流程零改——设置对话框/插件管理/reload 全官方件面未动）；③ profile.dev/package.json 补 @deepseek-ai/dsh@0.2.0-rc.2（镜像 profile.install 先例，dsh 无 peers、82 deps 由 hoisted 树吸收）——树承载完整 boot 链；④ 防回归 pin：boot-chain.test.ts 5 用例（真实 profile.dev 树双面对拍=结构性 pin + adjacent 回退 + 两半树 fatal + junction 逃逸 BootChainSplitError），模块覆盖 100%。弃选策略：pnpm overrides/link 跨安装根指向 .pnpm peer-hash 目录（脆、lockfile 漂移、realpath/interception 风险）；官方多实例兼容口径（0.2.0-rc.2 导出面无 bootstrapIncludes/ctx 服务入口——查证不存在）。上游 0.2.0-rc.2 pin 未动，未用 overrides。

## Changes

### Files Created
- apps/host/src/boot/boot-chain.ts
- apps/host/src/boot/boot-chain.test.ts

### Files Modified
- apps/host/src/boot/child.ts
- apps/host/src/boot/overlay.ts
- apps/host/profile.dev/package.json
- apps/host/profile.dev/pnpm-lock.yaml

### Key Decisions
- child 侧解析统一（boot 链按 profile 目录锚点载入）而非 overrides/link 收敛 .pnpm 拷贝——统一锚点不随 workspace lockfile 漂移，且与插件消费面锚点同源
- fail-loud 而非静默回退：profile 树在场服务插件时 boot 链任一件逃逸出树即 fatal（半树=确定双实例裂缝），宁可启动显形
- profile.dev 补 @deepseek-ai/dsh 依赖镜像 profile.install 先例（打包树早已含 dsh），dev/install 两形态树形状趋同
- 打包形态零改动（实测单容器已统一），仅重物化 staging/dist:win 供验证

## Test Results
- **Tests Executed**: Yes
- **Passed**: 159
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 原生流程端到端：设置对话框→添加第三方供应商→安装+profile reload 成功（无 Include 报错）
- [x] 实例统一实证：两消费链 resolve 同一 dsh-app-boot 物理路径 dump 归档
- [x] 双形态验证（dev + packaged/win-unpacked）；boot child 零回归（host-boot e2e + smoke 全绿）
- [x] 防回归 pin：结构测试或启动自证断言 dsh-app-boot 单实例（双实例 fail-loud）
- [x] tsc + lint 绿；flywheel e2e 回归

## Notes
AC1（机器侧等效证明，走查人实机确认为任务指定收口）：fix-12 probe5 实证恒拒的原生 settings/mutate volatile 写现双形态全通——dev 形态探针（tmp-ui-review/fix20probe.mjs）RPC {ok:true, applies:'live'} + 用户层 cordis.patch.yml 落盘 developerTools:true（探针后还原 tracked 文件）；打包形态探针（fix20probe-packaged.mjs，win-unpacked dsh-forge.exe 直启+CDP）同样 ok:true + 首启落地 profile 用户层落盘。供应商添加流（dsh-plugin-manager reconcileProfilePlugins:2033）与 settings/mutate 消费同一 WeakMap 同一 ctx key（ownerContext.root）——reconcile 层已证通。AC2 dump 归档：dev 形态 BOOT_CHAIN=Z:/.../apps/host/profile.dev/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js == PLUGIN_FACE（同一物理文件；对照面 CHILD_STATIC（fix 前 child 载入面）= workspace .pnpm@0_29a… 拷贝=分裂实证）；staging UNIFIED:true；win-unpacked UNIFIED:true（dsh-app-boot + dsh/profile-boot + cordis 三件双点同路径）。AC3：host-boot e2e 2/2 + smoke-skeleton 4/4 + installer-pipeline 3/3（staged 打包拓扑 boot：manifest+双服务+sqlite+离线自足）+ host 单测 144/144（19 文件）+ 双形态 live 探针。AC4：boot-chain.test.ts 5/5（真实树结构 pin + 三 fatal 分支）+ loadBootChain 启动自证 fail-loud。AC5：tsc -b 0 错误 + pnpm lint 五件 0 违规 + flywheel 1/1 + dist:check STAGING_CHECK_OK（Implementation Notes 风险项：profile.install 树未动）。testsPassed=单测 144（host 项目全量）+ boot-chain 定向 5 + e2e 10（host-boot 2/smoke 4/flywheel 1/installer-pipeline 3）。coverage=boot-chain.ts 模块面（v8 实跑输出 100%：26/26 statements、6/6 branches——新模块即修复面）。附带发现（非缺陷）：ui-settings-general 命名空间因产品 boot overlay 预确认行（fix-12）恒拒写「overridden by a home patch or command-line overlay」=上游设计行为——写面验证改用 ui-settings-account.developerTools。生产探针资产 tmp-ui-review/fix20probe{,-packaged}.mjs（不入仓惯例目录）。e2e 单实例纪律：跑前查活跃实例（无）；用户 DSH Desktop 实例（官方）与本任务隔离无冲突（USER_DATA→dsh-home 隔离）。
