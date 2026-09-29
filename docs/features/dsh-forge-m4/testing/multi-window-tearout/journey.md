---
feature: "dsh-forge-m4"
journey: "multi-window-tearout"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m4/prd/prd-user-stories.md
  - docs/features/dsh-forge-m4/prd/prd-spec.md
  - docs/features/dsh-forge-m4/prd/prd-ui-functions.md
generated: "2026-09-30"
---

# Journey: multi-window-tearout

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者将项目工作台内某视图(会话/看板)拆出为独立窗口,主窗口与独立窗口并行观察与操作、互不干扰,且全部窗口同属同一应用实例(单实例约束不变);关闭独立窗口即收回(关闭 ≡ 收回);拆出窗口集合随项目记忆,重进恢复拆出态——多窗口并行观察的工作流,拆出窗绑定来源项目、不随主窗激活指针(M4 多窗口部分;页内分屏见 split-pane-layout-memory 旅程)。

> PRD Traceability: Story 6(分屏观察与布局记忆·多窗口部分);SC4(分屏/多窗口);UF10(多窗口)、UF9(拆出来源 = pane);PRD 必答⑨;proposal Key Scenarios「分屏/多窗口」。词注:「数据内核/派生视图」= 约定 TECH-product-arch-003(docs/conventions/product-architecture.md)产品架构词汇;「关闭 ≡ 收回/原位恢复」= tech-design Interface 5 × ui-design C10 设计裁决口径。

## Setup

- 应用以单实例运行(M1 壳基座:托盘/单实例语义继承;测试前确认本机无活跃实例,步骤 1b 的第二进程启动才可确定性命中实例锁——coexistence 单实例锁);已注册项目含会话与看板数据,另有一个可切换的第二项目(承载步骤 3c 主窗切换边界);分屏布局可用(拆出来源 = pane)
- 断言口径(测试层,Expected Result 不重复携带):主窗口与独立窗口并行操作互不干扰且同属单实例以 e2e 断言核验(Story 6 AC3 原词);布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;拆出建窗与重进恢复为异步面,断言前等待窗口集稳定;窗口集合恢复以窗口计数/身份核验

## Happy Path

### Step 1: 选中待拆出视图

**User Action**: 编排者在分屏工作台内选中某 pane(如看板视图),打开 pane 操作菜单

**Expected Result**: 「拆出为窗口」动作可用(拆出来源 = 工作台 pane)

### Step 2: 拆出为独立窗口

**User Action**: 点击「拆出为窗口」

**Expected Result**: 该视图迁入新独立窗口(标准壳窗,标题「<项目名> · <视图名>」);主窗口移除该 pane、其余 pane 按布局规则重排(移除主窗 pane = UF10 Interactions 原词;重排呈现 source: inferred,推自 ui-design C9 布局规则);拆出窗口集合记入布局记忆

### Step 3: 并行观察与操作

**User Action**: 在主窗口操作会话、同时在独立窗口操作看板

**Expected Result**: 两侧互不干扰(操作互不抢占、状态互不串扰);两窗口呈现同一数据内核的派生视图(词见 traceability 词注)

### Step 4: 收回独立窗口(关闭 ≡ 收回)

**User Action**: 点击独立窗口 [收回](或直接经 OS 标题栏关闭——两者同语义)

**Expected Result**: 该视图 pane 即时回主窗口原位,不待重启;布局记忆更新为收回后结构(OS 标题栏关闭 ≡ 收回:tech-design Interface 5/ui-design C10;PRD UF10 原留「或记忆保持拆出态」分支,设计裁决为关闭即收回)

### Step 5: 再拆出第二视图(集合复数)

**User Action**: 重复拆出两次,先后将看板与会话两个视图再拆出为独立窗口

**Expected Result**: 主窗口与两个独立窗口并行;拆出窗口集合 = 2(窗口集合以复数行使),各窗口视图类型/尺寸/位置随项目记入布局记忆(UF10 窗口集合字段;首次拆出默认尺寸居中、此后记忆用户调整——ui-design C10)

### Step 6: 离开重进恢复拆出态

**User Action**: 离开后重进该项目

**Expected Result**: 拆出窗口集合随项目记忆恢复:两个独立窗口按各自视图类型/尺寸/位置重建,主窗口 pane 结构同步恢复;恢复态与离开时一致(UF10 States restored)

## Edge Cases

### Step 1b: 单实例边界

**Precondition**: 已存在拆出的独立窗口

**User Action**: 从操作系统再次启动应用(第二进程)

**Expected Result**: 单实例语义保持(M1 继承):不产生第二实例,第二进程聚焦既有实例后退出;全部窗口同属单实例

### Step 2b: 拆出后主窗口 pane 重排

**Precondition**: 被拆出视图原占主窗口唯一内容 pane

**User Action**: 拆出该视图

**Expected Result**: 主窗口移除该 pane 后按布局规则重排呈现,不出现空白主窗口死区(source: inferred,推自 UF10「移除主窗 pane」× 布局重排规则);布局记忆与实际一致

### Step 2c: 拆出目标已失效

**Precondition**: 待拆出的会话类视图目标已失效(会话已被清理/不可用)

**User Action**: 经 pane 菜单点击「拆出为窗口」

**Expected Result**: 拆出动作对失效目标明确提示目标已失效/不可拆或不可用,不静默建出空窗口(source: inferred,推自 surface-web 强制项 × 步骤 6b 恢复目标缺失同族的拆出侧)

<!-- surface-web required_outcomes 映射:validation-error → 拆出目标会话已失效/不可拆,pane 菜单「拆出为窗口」动作侧明确提示、不静默建空窗;source: inferred(推自 surface-web 规则强制项 × 目标缺失族拆出侧) -->

### Step 3b: 并行操作同一数据面

**Precondition**: 同一数据面(如同一任务状态面)在主窗口与独立窗口两侧镜像呈现(区别于步骤 3 的两侧不同视图并行)

**User Action**: 两侧并行观察与操作该同一数据面

**Expected Result**: 状态以数据内核为事实源,两侧一致更新、互不覆盖互不丢失(source: inferred,推自数据内核单一事实源 × BIZ-workbench-005 派生面失效-重建传播)

<!-- surface-web required_outcomes 映射:session-expired → 并行观察期间 detached 会话视图所依 dsh 会话通道不可用,拆出窗口内呈现明确错误 + 恢复引导(重试/重连),不静默空白、不丢已呈现内容;source: inferred(推自 surface-web 规则强制项 × BIZ-resilience-001 降级不打断呈现) -->

### Step 3c: 主窗切换项目不带动拆出窗

**Precondition**: 项目 A 处于 multi-window 态(存在绑定来源项目 A 的拆出窗口),主窗口当前在项目 A

**User Action**: 主窗口经项目切换切到项目 B

**Expected Result**: A 的拆出窗口仍以 A 上下文渲染(A/B 并行观察);拆出窗 = 派生快照的显示面、非第二激活——BIZ-workbench-002 单激活指针仅约束主窗(ui-design C10 窗口语义)

### Step 4b: 关闭主窗口 = 退出应用

**Precondition**: 应用处于 multi-window 态(主窗口 + ≥1 拆出窗口)

**User Action**: 关闭主窗口(OS 标题栏)

**Expected Result**: 应用退出(M1 单实例语义),全部拆出窗口随之关闭、不残留(tech-design Interface 5);重进按布局记忆恢复拆出态(UF10 restored)

### Step 5b: 来源项目生命周期(归档/删除)

**Precondition**: 项目 A 处于 multi-window 态且来源项目被归档;另一侧 = 经确认删除该项目

**User Action**: 归档(或删除)来源项目 A

**Expected Result**: 归档 → 其拆出窗口保持可用,窗口标题追加「已归档」;删除 → 该项目全部拆出窗口关闭 + toast 通知,布局记忆随删除清除(ui-design C10 来源项目生命周期;prd-spec 布局记忆随项目)

### Step 6b: 恢复时目标缺失

**Precondition**: 拆出窗口记忆中的视图目标数据已删除

**User Action**: 重进项目触发恢复

**Expected Result**: 缺失目标的窗口降级呈现(空态/可替换)、不崩溃,其余窗口与主窗布局正常恢复(source: inferred,推自 BIZ-resilience-001 非致命失败降级 × 布局记忆随项目)

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
