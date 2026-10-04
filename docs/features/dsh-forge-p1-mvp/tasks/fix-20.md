---
id: "fix-20"
title: "Fix(P0): 添加第三方模型提供商报错「profile reload requires the root Include entry」——dsh-app-boot 双实例致 bootstrapIncludes WeakMap 分裂（boot 注册副本 ≠ 插件管理器消费副本），统一实例解析"
priority: "P0"
estimated_time: "3h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P0): 第三方供应商添加报错——dsh-app-boot 双实例 WeakMap 分裂

> 来源：走查人实机（2026-10-03）「添加第三方模型提供商报错: dsh:profile reload requires the root Include entry。打开原生的配置对话框，通过原生的流程」。

## Root Cause（源码实读定位）

原生流程链：设置面板（官方件）→ 模型/供应商添加 → 插件管理器安装供应商插件 → `reconcileProfilePatches(ctx, …)`（[dsh-app-boot/index.js:3468-3470](../../../node_modules/.pnpm/@deepseek-ai+dsh-app-boot@0_29a57175adbd788903e565fb9da60644/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js)）→ **`bootstrapIncludes.get(ctx)`（模块级 WeakMap）**。

该 WeakMap 的写入点 = `mountRootInclude`（:3691-3718，`bootstrapIncludes.set`）——由 `boot()`（:4083）调用；我们的 boot child 经 `runProfile`（[@deepseek-ai/dsh/profile-boot](../../../node_modules/.pnpm/@deepseek-ai+dsh@0.2.0-rc.2_0b03e952f2ee483bf61ec138db43e851/node_modules/@deepseek-ai/dsh/lib/profile-boot-BZ2ZjNWi.js):271 `boot(NAME, rootConfig, …)`）→ 注册**成功**。

**分裂点**：`bootstrapIncludes` 是模块实例级 WeakMap——注册发生在 **child 依赖链解析的那份 dsh-app-boot**；插件管理器（profile 树内插件）resolve 到**另一份物理拷贝**。实测 node_modules/.pnpm 下存在 **8 份不同 peer-hash 的 dsh-app-boot**（agent-pres/app-boot/config-edi/hmr/plugin-man/shell-env/tool-cordi/web-app 各一份）——两副本各自模块域、WeakMap 互不可见 → reconcile 读不到注册 → 抛错。官方桌面整树单实例故无此问题。

## Description

**统一 dsh-app-boot 实例解析**（boot child 消费面 = 插件树消费面 同一物理拷贝），原生流程零改（设置对话框/插件安装/reload 全官方件，修的是实例拓扑不是流程）：

- 排查两消费链的解析路径：child（installAnchor → @deepseek-ai/dsh → dsh-app-boot@hashA）vs profile 树（插件 hoisted peers → dsh-app-boot@hashB）
- 统一策略（执行裁决，按 pnpm 机制选一）：
  a. **对齐 peer 集**使两链解析到同一 .pnpm 物理目录（补齐缺失 peers 或收敛 peer 版本集 → hash 归一）
  b. profile 树内**顶层提升** dsh-app-boot 单副本（pnpm overrides / hoist-pattern 收敛）
  c. 若上游有官方多实例兼容口径（如 ctx 服务面暴露 reconcile 入口）——查证后优先官方口径
- 双形态覆盖：dev（profile.dev 直链）与 packaged（profile.install 组装树 + resources 运行时树）**各自验证单实例**

## Reference Files

- 官方（只读）：dsh-app-boot/index.js:3468-3470（报错点）/:3691-3718（mountRootInclude + WeakMap set）/:4052-4083（boot 调用链）；dsh/lib/profile-boot-BZ2ZjNWi.js:271（runProfile→boot）
- 产品：apps/host/src/boot/child.ts（runProfile 消费链）、apps/host/profile.dev/ 与 apps/host/profile.install/（两形态树）、pnpm-workspace.yaml（overrides 面——4.1 已有 @electron/get 先例）
- 报错原文（走查人）：「dsh:profile reload requires the root Include entry」/ 场景 = 原生设置对话框添加第三方模型供应商

## Acceptance Criteria

- [ ] **原生流程端到端**：设置对话框 → 模型/供应商 → 添加第三方供应商 → 安装 + profile reload 成功（无 Include 报错），插件列表与会话模型可选面刷新（走查人实机确认——报错场景回归）
- [ ] 实例统一实证：运行时解析 dump（两消费链 resolve 到同一 dsh-app-boot 物理路径；或等效证明——reconcile 成功即弱证明，dump 为强证明）归档执行记录
- [ ] 双形态验证（dev + packaged/win-unpacked）；boot child 既有行为零回归（host-boot e2e + smoke 全绿）
- [ ] 防回归 pin：结构测试或启动自证断言「dsh-app-boot 单实例」（如启动时比对 resolve 路径，双实例 fail-loud）——防依赖树漂移再犯
- [ ] tsc + lint 绿；flywheel e2e 回归（插件树变更后知识链路不褪色）

## User Stories

- Story 2（日常会话）：第三方供应商经原生设置流程开箱可用。

## Hard Rules

- **原生流程零改**：设置对话框/插件管理/reload 全官方件面——本任务只修实例拓扑（「通过原生的流程」= 原生流程须能跑通）。
- dsh 底子：优先官方多实例兼容口径（若有）；不自创 reconcile 替代路径、不 monkey-patch WeakMap。
- 上游版本 pin 不动（0.2.0-rc.2）；overrides 仅作实例收敛用途（4.1 先例口径）。

## Implementation Notes

- 排查首步：node 端双点 require.resolve('dsh-app-boot/package.json') 对比（child 链 vs 以 plugin-man 插件身份在 profile 树内 resolve）。
- 风险预记：peer 集归一可能牵动 profile.install 的 autoInstallPeers 树形状（4.1 管线）——改动后 `pnpm dist:check` 同口径复核。
- 关联：fix-18（真 home 共享）后插件安装写产品 profile 用户层——路径归属不变，无冲突。
