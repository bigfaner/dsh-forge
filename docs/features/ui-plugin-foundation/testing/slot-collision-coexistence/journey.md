---
feature: "ui-plugin-foundation"
journey: "slot-collision-coexistence"
risk_level: "Medium"
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/proposals/ui-plugin-foundation/proposal.md
generated: "2026-09-22"
---

# Journey: slot-collision-coexistence

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk rationale: 多步安装/观察工作流,插件安装物化的是用户自己的官方 `dsh web` profile(可移除恢复,无不可逆副作用);撞键可能破坏共存 UI 但可通过移除插件恢复,属可逆的多步交互。

Traceability: proposal.md Key Scenario "第三方插件共存(edge)" + Success Criterion SC6。 -->

## Overview

用户在官方 `dsh web` 同时装配 hello-world 与撞键复制品 fixture(第二个自装插件,声明与 hello-world 贡献子槽位同名的槽位键),实证 ui-slots 声明合并的撞键行为——按「合并共存 / 分层覆盖 / 启动期显式报错」三型归档,并确认宿主核心界面不被第三方撞键破坏、「静默后者覆盖且不可观察」判为未通过。

## Setup

- hello-world 插件可装配(贡献的自有子槽位已知槽位键)
- 撞键复制品 fixture 就绪:第二个自装插件,声明与 hello-world 贡献子槽位同名的槽位键,经同一 `dsh plugin add` 机制安装(无特判)
- 官方 `dsh web` 环境可用,测试 profile 可独占使用(装/卸自由)
- 观察通道就绪:可复现步骤记录 + 观察到的 UI 结果采集(截图/DOM)
- spike 报告的撞键落档框架就位(三型归档,对齐 JetBrains 声明合并显式化先例:冲突启动期可见、非法贡献显式报错而非静默覆盖)

## Happy Path

### Step 1: 装配 hello-world 建立基线

**User Action**: 用户对自己的官方 `dsh web` profile 执行 `dsh plugin add` 装入 hello-world

**Expected Result**: hello-world 的基座槽位面板与贡献的自有子槽位正常渲染,宿主核心界面(ui-chat / ui-renderer 承载的既有功能)不受影响——单声明方基线成立

### Step 2: 装入撞键复制品 fixture

**User Action**: 用户对同一 profile 再执行 `dsh plugin add` 装入撞键复制品(声明同名槽位键)

**Expected Result**: 两个自装插件同时记入 profile bundle 清单,经同一装配机制共存;不出现安装期特判或静默拒绝

### Step 3: 打开界面观察撞键行为

**User Action**: 用户打开/重载官方 `dsh web`,观察同名槽位键处的实际 UI 结果(两插件声明的组件如何解析)

**Expected Result**: 撞键行为被观察并归入三型之一:合并共存(多源声明聚合)/ 分层覆盖(显式分层规则解析,类 CSS 级联)/ 启动期显式报错(非法贡献启动校验期可见);行为可观察、可归因——不是「静默后者覆盖且不可观察」(该情形判未通过)

### Step 4: 落档撞键结论移交 M2

**User Action**: 用户将复现步骤与观察到的 UI 结果按三型归档进 spike 报告,作为 M2 真实工作台槽位设计的前置输入移交

**Expected Result**: 结论入 spike 报告(SC6 验收件):三型归属 + 复现步骤 + UI 结果证据;无论落哪一型,归档完整可复现

### Step 5: 卸载撞键插件验证可恢复

**User Action**: 用户从 profile 移除撞键复制品(或两插件都移除)并重载界面

**Expected Result**: UI 回到干净状态(hello-world 子槽位恢复单声明方渲染,或全部移除后恢复无插件基线)——共存破坏可逆,无残留注册状态

## Edge Cases

### Step 3b: 撞键表现为静默后者覆盖且不可观察

**Precondition**: 后装插件的声明静默覆盖先装声明,界面无任何冲突提示、无分层痕迹可观察

**User Action**: 用户执行观察并按 SC6 判定

**Expected Result**: 判为未通过——「静默后者覆盖且不可观察」是 SC6 明确的失败态;须触发修正路线(如改用显式声明形态或启动期校验)后重测,不得归档为合法三型之一

### Step 2b: 撞键 fixture 单独在场(基线隔离检查)

**Precondition**: profile 中只有撞键复制品、无 hello-world(单一声明方持有该槽位键)

**User Action**: 用户单独装配撞键复制品并观察

**Expected Result**: 该槽位键正常渲染(单声明方无撞键)——证明 Step 3 观察到的行为确由撞键引起,而非 fixture 自身缺陷

### Step 1b: 撞键波及基座槽位破坏宿主核心界面

**Precondition**: 第三方插件声明的槽位键与宿主基座核心槽(承载官方 dsh 核心功能的槽位)撞键

**User Action**: 用户装配后打开官方 `dsh web` 核心功能界面

**Expected Result**: 宿主基座核心界面保持可用(第三方撞键不得破坏宿主核心功能面);若发生破坏,按撞键行为型归档并升级为 M2 槽位设计的硬约束输入

### Step 3c: 撞键触发启动期显式报错

**Precondition**: ui-slots 声明合并机制对撞键采取启动校验期显式报错策略(三型之第三型)

**User Action**: 用户装配两插件后启动/重载界面

**Expected Result**: 报错显式可见、信息可归因到冲突的插件与槽位键;用户移除其一即可恢复——错误可诊断、可恢复,不出现无提示的白屏/卡死

### Step 4b: 三型归档与复现证据不完整

**Precondition**: 观察到了撞键行为但复现步骤或 UI 结果证据缺失(无法归型或无法复现)

**User Action**: 用户尝试按 SC6 归档

**Expected Result**: 判为归档不完整——SC6 要求含复现步骤与观察到的 UI 结果;补齐证据后方可作为 M2 前置输入移交

## Journey Invariants

- 撞键行为始终可观察、可归因(可定位到冲突插件与槽位键);「静默后者覆盖且不可观察」即失败
- 撞键复制品与 hello-world 经同一标准装配机制(`dsh plugin add`)安装,fixture 无任何特判通道
- 宿主基座核心界面在第三方槽位撞键全程保持可用
- 观察到的撞键行为必须归入且仅归入三型之一(合并共存 / 分层覆盖 / 启动期显式报错),归档含复现步骤与 UI 结果
- 共存状态可逆:移除任一/全部插件后 UI 恢复对应基线,无残留
