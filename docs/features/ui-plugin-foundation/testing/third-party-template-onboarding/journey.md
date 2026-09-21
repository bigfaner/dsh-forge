---
feature: "ui-plugin-foundation"
journey: "third-party-template-onboarding"
risk_level: "Medium"
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/proposals/ui-plugin-foundation/proposal.md
generated: "2026-09-22"
---

# Journey: third-party-template-onboarding

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk rationale: 多步交互(建包 → 声明 → 构建 → 安装 → 注入)但无不可逆副作用(用户自己的插件目录与自己的 profile,可删可重装);不触碰 dsh-forge 仓与壳。

Traceability: proposal.md Key Scenario "第三方起步(happy)" + Success Criterion SC5。 -->

## Overview

社区用户照工程模板从零新建一个插件包并注入官方 `dsh web` 成功——全程零 vendored 引用、零壳修改,两处「第一步」(依赖安装的 npm 形态 peer 声明、装进宿主的 engines 式版本兼容声明)被演示链路覆盖。

## Setup

- 工程模板已沉淀(hello-world 沉淀而来):内建槽位消费/贡献标准姿势与 dsh UI 组件复用约定
- 模板文档面向第三方用户,不要求读者接触 dsh-forge 仓的 vendored 树
- 模板侧版本戳经同源机制可见(与断言同源的版本同步机制)
- 第三方用户本机具备 Node 工具链,可访问 npm registry(`@deepseek-ai/dsh-client-*` 族与 cordis 已发布)
- 官方 `dsh web` 环境可用,用户拥有可自装的 profile

## Happy Path

### Step 1: 照模板新建插件包

**User Action**: 用户从工程模板派生一个新插件包,包名与槽位声明按模板姿势填写(不照抄 `workspace:^` peer 声明,改为 npm 形态)

**Expected Result**: 新包结构成立:空宿主半身 + client 半身(client 半身经 `exports["./client"]` 暴露,形态参照上游 `ui-goal` 小包),纯 npm 依赖起包

### Step 2: 声明宿主版本兼容与对齐线依赖

**User Action**: 用户按模板文档声明 engines 式宿主版本兼容性,并把对齐线依赖(`@deepseek-ai/dsh-client-*` 宿主契约族)锁为 exact 版本(cordis peer 按独立版本线单列 exact)

**Expected Result**: 依赖声明全部 npm 形态且 exact;模板版本戳与 vendored 锁基准(`desktopHostVersion`)同步可见;无裸包名、无 `^` 范围、无可变 tag 直写

### Step 3: 构建插件包

**User Action**: 用户执行模板的构建流程产出插件构建产物

**Expected Result**: 构建成功;产物级模块来源校验绿灯——任何模块不解析至 dsh-forge 仓 `vendor/` 树(零 vendored 文件引用);包体积与产物面以上游 `ui-goal` 为参照量级

### Step 4: 安装进官方 dsh web(装进宿主第一步)

**User Action**: 用户对自己的官方 `dsh web` profile 执行 `dsh plugin add` 装入自建插件

**Expected Result**: 注入成功:插件记入 profile bundle 清单,node_modules 物化完成;engines 式兼容声明被宿主接受,无版本冲突警告

### Step 5: 在官方 dsh web 界面看到注入结果

**User Action**: 用户打开官方 `dsh web` 界面查看目标槽位区域

**Expected Result**: 自建插件的槽位贡献在官方 UI 渲染——第三方用户零壳修改、零 vendored 引用地扩展了官方 dsh

## Edge Cases

### Step 1b: 照抄模板的 workspace:^ peer 声明

**Precondition**: 用户未按模板文档把 peer 声明改为 npm 形态,照抄了仓内 workspace 协议声明

**User Action**: 用户在第三方目录执行依赖安装

**Expected Result**: 安装失败或解析悬空被模板文档前置警示拦截(两处「第一步」之一);文档给出明确改法(peer 声明为 npm 形态),用户可纠正后继续

### Step 2b: 对齐线依赖落入 dist-tag 陷阱

**Precondition**: 用户用裸包名或 `^` 声明对齐线依赖——npm `latest` dist-tag 停在旧版 `0.0.1-rc.1`,现行线在 `alpha` tag

**User Action**: 用户安装依赖或运行版本断言

**Expected Result**: 版本一致性断言红灯拦截(静默契约漂移变显式红灯);模板文档明示禁裸包名/`^`,用户改为 exact(借 `alpha` tag 定位须解析并锁定为 exact 结果)后通过

### Step 2c: 缺失 engines 式宿主版本兼容声明

**Precondition**: 用户跳过宿主版本兼容性声明(装进宿主「第一步」缺失)

**User Action**: 用户把插件装进宿主版本不匹配的 `dsh web`

**Expected Result**: 安装期或装配期出现可见的版本兼容提示/错误,用户补齐 engines 式声明后可重试;不静默装入不兼容宿主

### Step 4b: 注入失败(槽位键声明错误或产物畸形)

**Precondition**: 插件声明的槽位键非法/不存在,或构建产物形态不符合客户端插件契约

**User Action**: 用户执行 `dsh plugin add` 并打开界面

**Expected Result**: 失败显式可见且带诊断指向(区别于静默不渲染),用户按提示修正后重试可成功

### Step 5b: 模板版本戳与上游锁漂移

**Precondition**: vendored 基准升级后模板版本戳未同 diff bump(上游 0.1.x alpha 快速演进期)

**User Action**: 用户经同源机制检查模板版本戳(或运行版本断言门禁)

**Expected Result**: 同源版本戳机制将漂移显式可见(断言红灯即升级提醒,不静默),模板维护者按「断言与上游 SHA 升级任务同 diff bump」纪律修复

## Journey Invariants

- 全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改——第三方插件只经官方 `dsh web` 的标准插件机制存在
- 对齐线依赖始终 exact ≡ `desktopHostVersion`,cordis 以独立版本线单列 exact(不与宿主版本比对)
- 模板文档全程不要求读者接触 dsh-forge 仓的 vendored 树
- 插件包体积与构建产物面保持 `ui-goal` 参照量级(小包)
