---
feature: "ui-plugin-foundation"
journey: "dual-env-plugin-assembly"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/proposals/ui-plugin-foundation/proposal.md
generated: "2026-09-22"
---

# Journey: dual-env-plugin-assembly

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk rationale: plugin install materializes node_modules into a profile (state mutation of userData projection); shell-side assembly writes product-level config and materializes the projection; broken materialization can leave a polluted profile that blocks boot.

Golden Path Journey. Feature complexity: Complex (>=2 entity types with parent-child relationships: product-level config entry -> userData profile materialization -> ui-slots registration -> Webview rendering). Complex feature requires 5+ happy path steps covering cross-entity interactions; this Journey has 6.

Traceability: proposal.md Key Scenario "双环境装配(happy)" + Success Criterion SC1. -->

## Overview

同一 hello-world 双向扩展演示插件(零 vendored 文件引用)在官方 `dsh web`(第三方视角,profile 自装)与 dsh-forge 壳(经产品级配置,内置 bundle)两侧环境完成装配:消费向面板渲染进既有稳定槽位、贡献向自有子槽位对第三方开放、点击交互走运行链路、打包/离线形态验收——证明自有插件「可以存在、可以被装配、可移植」。

## Setup

- 插件工程已就绪:hello-world 以纯 npm 依赖起包(对齐线依赖 exact `0.1.6-alpha.2`),空宿主半身 + client 半身(形态参照上游 `ui-goal`),构建产物零 vendored 文件引用
- 官方 `dsh web` 运行环境可用,且存在可自装的测试 profile(第三方用户视角)
- dsh-forge 壳可启动,hello-world 已按产品级配置登记为内置 bundle(装配走配置路径,无新增壳内硬编码)
- 扩展后的 live-ui-probe 可采集两侧环境的 DOM/截图证据(验收证据归档通道)
- vendored 基准锁定:`vendor/upstream.lock.json` 的 `desktopHostVersion` = `0.1.6-alpha.2`(SHA `c36ba648`)

## Happy Path

### Step 1: 以第三方视角在官方 dsh web 自装 hello-world 插件

**User Action**: 用户在官方 `dsh web` 环境对自己的 profile 执行 `dsh plugin add`(profile 自装),装入 hello-world 插件包

**Expected Result**: 插件被记入 profile bundle 清单,profile node_modules 完成物化;插件依赖解析锁定为 exact `0.1.6-alpha.2`(不落 dist-tag 旧版);全程零 vendored 树文件引用

### Step 2: 在官方 dsh web 界面观察消费向渲染

**User Action**: 用户打开装配后的官方 `dsh web` 界面,查看既有稳定基座槽位(ui-chat / ui-renderer 核心槽之一)所在的界面区域

**Expected Result**: hello-world 面板渲染进目标稳定槽位所在的既有界面区域(消费向 = 插件消费平台槽位成立),界面其余部分不受影响

### Step 3: 观察贡献向的自有子槽位开放

**User Action**: 用户在同一界面区域查看 hello-world 登记的自有子槽位(ui-slots 的 `register` 原生支持「组件 + 子槽位 + store 席位」)

**Expected Result**: 插件贡献的自有子槽位渲染默认内容,子槽位对第三方真实开放(贡献向 = 平台可被第三方扩展成立),可成为后续撞键 fixture 的声明的目标

### Step 4: 点击面板触发运行链路

**User Action**: 用户点击 hello-world 面板上的交互入口

**Expected Result**: client 半身 store 席位状态更新并刷新渲染——证明是运行链路而非静态注入(交互可观察)

### Step 5: 在 dsh-forge 壳内经产品级配置装配同一插件

**User Action**: 用户启动 dsh-forge 壳(hello-world 经产品级配置登记为内置 bundle,装配走配置路径)

**Expected Result**: 同一基座槽位面板与自有子槽位在壳内渲染,呈现与官方 `dsh web` 环境一致(双环境一致性);壳内装配不引入新的壳内硬编码(配置为插件树唯一事实源);两锚解析(`host-profile/index.ts` + `HOST_RUNTIME_DIR`)与版本对齐在壳内同样成立

### Step 6: 验收打包/闭包分发形态与离线自足

**User Action**: 用户以 spike 落档的分发形态(npm 物化 / tarball 内置 / 预播种,以 spike 结论为准)将 hello-world 装配进打包态/离线壳并启动

**Expected Result**: 插件在该形态下完成装配并渲染;产物级校验扫描插件构建产物的模块来源,任何模块解析至本仓 `vendor/` 树(路径含 `vendor/` 前缀或 file: 协议指向仓内)即红灯——本次绿灯;离线自足 NFR 兼容性结论显式落档

## Edge Cases

### Step 1b: 依赖解析落入 dist-tag 旧契约

**Precondition**: 插件依赖以裸包名或 `^` 范围声明,或借 `alpha` tag 定位但未解析锁定为 exact——npm `latest` dist-tag 停在旧版 `0.0.1-rc.1`

**User Action**: 用户执行 `dsh plugin add` 装入该依赖形态的插件包

**Expected Result**: 装配不静默拿到旧契约:版本一致性断言红灯拦截(对齐线依赖必须 ≡ `desktopHostVersion`),失败可见、可诊断,用户改为 exact 版本后可重试

### Step 2b: 目标基座槽位缺失或不稳定

**Precondition**: 插件声明的注入目标槽位键在目标环境不存在(或属上游不稳定面)

**User Action**: 用户在目标环境装配该插件并打开界面

**Expected Result**: 失败显式可见(装配期或启动期报错),而非面板静默不渲染;诊断信息指向槽位键声明问题

### Step 3b: 构建产物引用 vendored 树

**Precondition**: 插件构建产物中存在模块解析至本仓 `vendor/` 树(路径含 `vendor/` 前缀或 file: 协议指向仓内)

**User Action**: 用户运行产物级模块来源校验(该校验并入断言门禁)

**Expected Result**: 校验红灯——零 vendored 文件引用的交付件约束被机器守住,不靠自觉;插件不被接受进入双环境验收

### Step 4b: 点击交互无响应(静态注入假象)

**Precondition**: 面板渲染成功但 client 半身 store 席位状态更新未生效(静态注入而非运行链路)

**User Action**: 用户点击面板交互入口并观察渲染

**Expected Result**: 交互检查失败被识别为未通过(渲染必须随 store 席位状态更新刷新),live-ui-probe 采集的证据能区分静态注入与运行链路

### Step 5b: 壳内装配未走配置路径(配置化旁路)

**Precondition**: 壳内装配绕开产品级配置(残留硬编码清单或第二事实源)

**User Action**: 用户检查壳内装配来源并核对壳代码 diff

**Expected Result**: 识别为缺陷——配置必须是插件树唯一事实源,壳内装配不允许新的壳内硬编码;`HOST_PROFILE_BUNDLES` 保持迁出壳代码状态

### Step 5c: 双环境呈现不一致

**Precondition**: 同一插件在两侧环境的渲染或交互行为出现漂移(槽位解析、样式 tokens、交互行为任一不一致)

**User Action**: 用户对比两侧环境的 DOM/截图证据

**Expected Result**: 不一致被标记为未通过——双环境一致性是可移植性证据,两侧环境呈现必须一致

### Step 6b: 打包形态破坏离线自足

**Precondition**: spike 选定的分发形态在离线壳内需要网络(如装配期 npm 物化拉网)

**User Action**: 用户在离线环境以该形态装配并启动壳

**Expected Result**: 该形态与离线自足 NFR 的冲突被显式落档并触发形态重选(tarball 内置 / 预播种兜底),不允许带冲突过关

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 `dsh web` 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact ≡ `UpstreamLock.desktopHostVersion`(当前 `0.1.6-alpha.2`),cordis 单列独立版本线
