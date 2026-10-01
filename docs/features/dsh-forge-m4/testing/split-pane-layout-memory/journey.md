---
feature: "dsh-forge-m4"
journey: "split-pane-layout-memory"
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

# Journey: split-pane-layout-memory

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- golden-path 资格注记:步骤 1→6 构成合格的 Story 6(分屏部分)golden path 序列;frontmatter golden_path: false 为 feature 级单真指派(本 feature 由 project-workbench-home 持 true),非本序列不合格 -->

## Overview

编排者在项目工作台内添加分屏(典型组合:左会话右任务面板/看板),同屏操作多个 pane,拖拽调整比例并收起 subagent 后代列表;离开后重进该项目,pane 结构/比例/收起状态恢复——「重进项目即回到上次观察姿态,不用重新摆布局」的布局记忆工作流(M4 分屏部分;多窗口拆出见 multi-window-tearout 旅程)。

> PRD Traceability: Story 6(分屏观察与布局记忆·分屏部分);SC4(分屏/多窗口);UF9(分屏布局)、UF3(收起状态随项目记忆)、UF2(布局记忆字段);PRD 必答⑨(分屏/多窗口行为)/必答⑧(收起状态)/必答⑥(后代上限);proposal Key Scenarios「分屏/多窗口」。词注:「复用同一视图组件」= UF9 Validation 原词、「origin=subagent」= 必答⑥ 数据面原词,按上游原词保留。

## Setup

- 已注册项目含会话数据(含带 subagent 后代的 parent 会话;其中一会话组 >5 条会话,可触发溢出折叠)与任务看板/面板数据;工作台头部「分屏」控制可用
- 布局记忆按项目存储可用;断言口径(测试层,Expected Result 不重复携带):两 pane 同屏可操作与重进恢复以 e2e 断言核验(Story 6 AC1/AC2 原词);布局随项目、项目删除时随之清除
- 典型断言组合:会话 + 看板(或任务面板)两 pane 同屏可操作

## Happy Path

### Step 1: 进入单视图默认态

**User Action**: 编排者打开某项目工作台

**Expected Result**: 内容区单视图呈现(single 默认态);此前无布局记忆时无残留布局(source: inferred,推自 UF9 States single 为初始默认态)

### Step 2: 添加分屏并选视图

**User Action**: 经工作台头部「分屏」添加 pane,选择视图(会话 + 任务面板/看板组合)

**Expected Result**: 两视图同屏可见且均可操作;可选视图 = 当前项目可用的代码区/forge 文件区视图集

### Step 3: 拖拽调整 pane 比例

**User Action**: 拖拽 pane 分隔条调整比例

**Expected Result**: 比例即时生效;各 pane 复用同一视图组件,功能面不变(分屏不改变视图本身)

### Step 4: 收起 subagent 后代

**User Action**: 在左栏 parent 会话行展开/收起 subagent 后代列表

**Expected Result**: 后代默认收起,行尾 ▾ 递归展开;展开时内嵌后代列表呈现、多级同规则递归收起;收起/展开状态记入随项目记忆的布局状态

### Step 5: 离开并重进恢复

**User Action**: 离开该项目后重进

**Expected Result**: pane 结构、比例、subagent 收起状态与每组会话溢出折叠状态恢复;无需重新摆布局

### Step 6: 关闭分屏回到单视图

**User Action**: 关闭一个 pane 至单视图

**Expected Result**: 回到单视图呈现;布局记忆更新为当前结构

## Edge Cases

### Step 2b: 可选视图枚举边界

**Precondition**: 项目存在未启用的扩展位视图类型(知识区为扩展位、未启用)

**User Action**: 打开视图选择

**Expected Result**: 仅呈现当前项目可用视图(会话/feature 任务面板/看板类);知识区扩展位视图不出现(未启用即不渲染)

### Step 2c: 追加第三个 pane(多 pane 变体)

**Precondition**: 已处于两 pane 分屏态

**User Action**: 再次经「分屏」追加一个 pane(如 feature 任务面板),随后关闭一个 pane 并重加

**Expected Result**: 三 pane 同屏可操作,比例重分配仍受钳制约束;关闭后其余 pane 自动重排、重加后 pane 集合与比例重新记忆;各 pane 功能面不变(分屏不改变视图本身)

### Step 3b: 比例极值边界

**Precondition**: 两 pane 比例已处于钳制极限一侧(达最小可读宽度边界)

**User Action**: 继续将该侧分隔条向极限方向拖拽

**Expected Result**: 比例钳制不再收缩(钳制 30%–70%,两侧 pane 最小宽 30%——ui-design C9),不失能、不产生 0 宽死区;松手后布局可继续操作

<!-- surface-web required_outcomes 映射:responsive-layout → pane 比例在窗口尺寸变化下保持可用(最小宽约束),内容不溢出不可读;source: inferred(推自 surface-web 规则常见项 × ui-design C9 最小宽钳制) -->

### Step 4b: 后代数超上限

**Precondition**: 某 parent 会话血缘后代数超上限(默认 20)

**User Action**: 经行尾 ▾ 展开该 parent 的后代列表

**Expected Result**: 后代列表呈现至上限,尾部呈现「查看全部」展开其余后代(必答⑥);超限不破坏归拢——顶层列表仍不出现 subagent 条目,多级递归收起同规则

### Step 5b: 跨项目布局隔离

**Precondition**: 两个项目各自摆过不同布局

**User Action**: 在两项目间切换并重进

**Expected Result**: 项目间布局互不串扰,各自恢复各自姿态(source: inferred,推自必答⑨/UF2 布局记忆按项目存储——按项目隔离即不串扰)

### Step 5c: 恢复目标缺失

**Precondition**: 记忆布局中某 pane 视图的目标数据已删除;另一同类不可达 = 目标会话已归档(行消失但可经恢复入口找回——归档 ≠ 删除,BIZ-workbench-006/必答⑤)

**User Action**: 重进项目

**Expected Result**: 恢复不崩溃;缺失目标降级呈现(空态/可替换),其余 pane 正常恢复(source: inferred,推自 BIZ-resilience-001 非致命失败降级不崩溃基线 × 布局记忆随项目语义)

<!-- surface-web required_outcomes 映射:validation-error → 恢复时 pane 视图目标非法/损坏(记忆布局指向已删除或不可用的视图实例,5c 族),呈现为降级空态可替换,不崩溃、不静默;source: inferred(推自 surface-web 规则强制项 × BIZ-resilience-001 非致命失败降级优先) -->
<!-- surface-web required_outcomes 映射:session-expired → pane 操作/恢复期间 dsh 宿主·会话通道失联,pane 内容呈现明确错误 + 恢复引导(重试),不静默;source: inferred(推自 surface-web 规则强制项 × BIZ-resilience-001 降级不打断呈现) -->

### Step 6b: 全部 pane 关闭后重进

**Precondition**: 已关闭全部分屏至单视图

**User Action**: 重进项目

**Expected Result**: 重进恢复单视图(记忆与实际一致),不恢复已关闭的 pane

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
