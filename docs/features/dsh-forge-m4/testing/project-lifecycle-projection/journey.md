---
feature: "dsh-forge-m4"
journey: "project-lifecycle-projection"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m4/prd/prd-user-stories.md
  - docs/features/dsh-forge-m4/prd/prd-spec.md
  - docs/features/dsh-forge-m4/prd/prd-ui-functions.md
generated: "2026-09-30"
---

# Journey: project-lifecycle-projection

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者在项目设置「投影与生命周期」节查看投影状态并执行项目生命周期操作:改名(投影同步改名、分组保持)、归档(forge 侧移入归档分区、dsh 侧 workspace 保留、会话仍按项目分组)、恢复(投影不变化)、删除(经确认对话、workspace 移除、会话退未分组且历史不删除、布局记忆清除;覆盖必答⑤「删除(归档态或显式)」两条支路);dsh 侧手工变更不回流、仅偏差提示——这是「归档 ≠ 删除」语义的运行载体。本旅程「归档」均指项目归档;会话归档(UF3 ⋯ 菜单)的恢复口 = 设置面「已归档会话」区,经上游原生设置面承载(Step 1e)。

> PRD Traceability: Story 5(归档不丢历史、改名不丢归组);SC3(单向投影·归档/删除/偏差);UF8(项目设置·投影与归档)、UF1(归档分区);PRD 必答④(投影语义)/必答⑤(归档与删除语义);proposal Key Scenarios「改名/归档」「错误路径」。

## Setup

- 已注册 ≥2 个项目:其一为生命周期承载项目(含会话、布局记忆与归档前数据);其余项目另存布局记忆(供删除隔离断言,Step 5c);投影健康(对账一致)
- 测试可操控 dsh 侧数据面(手工改名/删除/乱序 workspace,供偏差构造)
- 断言口径:归档 ≠ 删除;偏差仅提示,任何入口不得触发反向写;删除后布局记忆随之清除;投影操作 ≤2s

## Happy Path

### Step 1: 查看投影状态

**User Action**: 编排者打开项目设置「投影与生命周期」节

**Expected Result**: 投影状态 healthy(对账一致);生命周期动作(改名/归档/恢复/删除)与归档语义说明呈现

### Step 2: 改名项目

**User Action**: 修改项目名并确认

**Expected Result**: forge 侧项目名更新;投影同步改名 → dsh 侧 workspace 同名(断言);会话分组随 workspace 保持;改名本身不被投影失败阻断(本地生效)

### Step 3: 归档项目

**User Action**: 执行归档并确认

**Expected Result**: forge 侧项目移入归档分区(左栏降透明只读),项目会话列表不再展示(断言);dsh 侧 workspace 保留,会话仍按该项目 workspace 分组(断言,历史可按组找回)

### Step 4: 恢复归档项目

**User Action**: 经左栏归档行菜单恢复项目(UF1:恢复/删除经行菜单)

**Expected Result**: 项目移回活跃区;投影不变化(workspace 未移除,会话分组保持)

### Step 5: 删除项目

**User Action**: 对当前活跃的承载项目(Step 4 恢复后)经确认对话执行显式删除——必答⑤「删除(归档态或显式)」的显式支路

**Expected Result**: forge 侧项目条目删除;dsh 侧 workspace 移除(断言);会话按 dsh 语义退为未分组且历史不删除(断言);该项目布局记忆随之清除;工作台落到其余项目或空态,不指向已删 id(source: inferred,推自 UF1「删除当前项目 → 工作台落到其余项目或空态」× BIZ-workbench-002 移除激活项目时指针同事务清空、不自动激活下一项目)

## Edge Cases

### Step 1b: 投影降级态

**Precondition**: 投影处于降级态(workspace 不可写致投影写入失败)

**User Action**: 打开项目设置「投影与生命周期」节确认降级呈现,并在 workspace 恢复可写后点击「重试投影」

**Expected Result**: degraded 态降级提示 + 手动「重试投影」入口;生命周期操作不被阻断;重试成功即两侧一致

### Step 1c: dsh 侧手工改名偏差

**Precondition**: dsh 侧手工改了某 workspace 名

**User Action**: 启动/刷新触发对账,打开项目设置「投影与生命周期」节展开偏差明细

**Expected Result**: 偏差提示(deviation 明细:差异事实 + 处理建议);不回流,任何入口不触发反向写(断言)

### Step 1d: dsh 侧手工删除/乱序偏差

**Precondition**: dsh 侧手工删除 workspace 或打乱顺序

**User Action**: 启动/刷新触发对账,打开项目设置「投影与生命周期」节展开偏差明细

**Expected Result**: deviation 偏差明细呈现;forge 侧权威数据不被改动

### Step 1e: 已归档会话区(会话归档恢复口,上游原生归宿)

**Precondition**: 存在经 UF3 会话行 ⋯ 菜单归档的会话(行已从会话列表消失)

**User Action**: 经上游原生设置面「已归档会话」区搜索该会话并逐条解除归档

**Expected Result**: 会话行即时回左栏项目树(UF3/UF8 接续断言);实现归宿 = 上游原生设置面,M4 零代码(裁决 #25-⑥,任务 1.4/3.5 注记)——本旅程仅断言接续效果,会话归档(对象 = 会话)与项目归档(本旅程主线对象 = 项目)为两个归档面,互不混淆

### Step 2b: 改名投影失败

**Precondition**: 改名确认时投影写入失败(workspace 不可写或宿主通道不可达)

**User Action**: 确认改名

**Expected Result**: 改名本地生效不被阻断;投影待重试(降级态);两侧最终一致可达成

<!-- surface-web required_outcomes 映射:session-expired → 桌面壳无独立登录会话,最近似面 = 宿主/投影通道失联 mid-workflow,映射为 Step 1b/2b 降级态呈现——降级提示 + 手动「重试投影」,恢复后重试成功即两侧一致,无数据丢失;source: inferred(推自 surface-web 规则强制项 × 必答④降级承诺「投影写入失败或 workspace 不可写 → 降级…提供手动重试;恢复后重试成功即两侧一致」) -->

### Step 2c: 改名空输入防御

**Precondition**: 改名输入为空名或纯空白

**User Action**: 提交改名

**Expected Result**: 即时校验提示,留在编辑态可修正;不发起投影写、两侧零变更(source: inferred,推自 surface-web 即时校验不静默基线;空名行为 PRD 未明文,记 open question 待 PRD 对账)

<!-- surface-web required_outcomes 映射:validation-error → 设置面输入/确认边界:改名空名/纯空白映射为即时校验提示、留在编辑态可修正(Step 2c),删除确认对话取消映射为零变更退出(Step 5d);source: inferred(推自 surface-web 规则强制项 × UF8「删除必须经确认对话」× 即时校验不静默基线) -->

### Step 3b: 归档分区跨项目呈现

**Precondition**: 存在归档项目,且当前工作台活跃项目为另一项目

**User Action**: 在当前活跃项目的工作台左栏定位归档分区,展开归档行菜单

**Expected Result**: 归档分区在任何活跃项目的左栏全项目树中均呈现(UF1);归档项目降透明只读、不挂会话;行菜单提供恢复/删除;该项目会话不在当前工作台呈现(UF1「不挂会话」断言)

### Step 5b: 归档态删除支路

**Precondition**: 待删项目处于归档态(不经 Step 4 恢复)

**User Action**: 经左栏归档行菜单删除并经确认对话

**Expected Result**: 归档分区中该条目移除;dsh 侧终态与 Step 5 相同——workspace 移除、会话退未分组且历史不删除(断言:必答⑤「删除(归档态或显式)」两支路收敛同一终态)

### Step 5c: 其余项目布局隔离

**Precondition**: 其余活跃项目存有布局记忆(pane 结构/收起状态/拆出窗口集合)

**User Action**: 承载项目删除(Step 5)完成后,重进该其余项目

**Expected Result**: 该项目布局恢复如删除前——布局记忆按项目存储,删除仅清除被删项目自身的记忆(Step 5 断言),不牵连其余项目(source: inferred,推自 PRD 数据要求「布局记忆:按项目存储(pane 结构/收起状态/拆出窗口集合),项目删除时随之清除」)

### Step 5d: 删除确认对话取消

**Precondition**: 删除确认对话已弹出,操作者选择取消

**User Action**: 在确认对话点击取消

**Expected Result**: 对话关闭,零变更——项目条目/workspace/会话分组/布局记忆全部保持,不发起任何投影写(source: inferred,推自 UF8「删除必须经确认对话」:未确认 = 未授权删除)

### Step 5e: 删除时投影写入失败

**Precondition**: 删除确认时投影写入失败(workspace 不可写或宿主通道不可达)

**User Action**: 经确认对话删除

**Expected Result**: 本地删除生效:forge 条目删除、布局记忆清除、快照/挂接等自有数据级联随清(BIZ-workbench-001 移除语义);投影删除保留待重试(降级提示 + 手动重试),恢复后重试成功 → workspace 移除、会话退未分组(source: inferred,推自必答④降级流 × 必答⑤删除语义 × BIZ-workbench-001;必答④非阻断清单未列删除,此为本旅程补全口径,PRD 对账记 open question)

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
