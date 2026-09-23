---
feature: "dsh-forge-m2"
journey: "dual-form-consistency"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: dual-form-consistency

**Risk Level**: High

## Overview

双形态使用者(终端插件与应用交替)在终端/冻结插件与应用交替操作同一 forge 项目时,双侧状态视图保持一致、变更来源逐笔可辨、forge 数据无第二事实源且无损坏。

> PRD Traceability: Story 3(状态回流与来源标识)、Story 4(双形态一致);SC7(双形态交替);G3(状态时效);操作主体模型(prd-spec Functional Specs)。

## Setup

- 同一 forge 项目同时被应用(已注册激活、看板打开)与终端(冻结插件/forge CLI)操作,两侧共享同一 forge 数据
- 项目内存在可供变更的未完成任务(可 claim/transition)
- 应用侧至少有一个已挂接的会话可执行任务操作

## Happy Path

### Step 1: 终端变更回流看板

**User Action**: 人在终端执行一次任务状态变更,随后回到应用看板查看(不重启应用)

**Expected Result**: 该变更 ≤5 秒内免手动刷新可见,且标记来源[终端]

### Step 2: 应用会话变更在终端一致

**User Action**: 应用侧挂接会话刚完成任务操作后,人在终端执行 `forge task status`

**Expected Result**: 终端输出与看板展示一致

### Step 3: 双形态交替操作

**User Action**: 双形态交替各执行 ≥1 次读写向变更操作(终端与挂接会话轮流对任务执行操作)

**Expected Result**: 每笔变更在看板与终端双侧均正确反映,变更来源逐笔标记正确([会话]/[终端])

### Step 4: 校验 forge 数据一致性

**User Action**: 对交替操作后的 forge 数据运行一致性校验(SC7 验收脚本往返断言)

**Expected Result**: 无第二事实源、无数据损坏

### Step 5: 交替后挂接状态完整性

**User Action**: 查看参与交替操作任务的详情与挂接状态

**Expected Result**: 挂接索引与历史挂接回溯完整(工作台自有状态独立存放,不与 forge 数据混放)

## Edge Cases

### Step 1b: 看板已打开时终端执行变更

**Precondition**: 应用运行中且任务看板处于打开状态(非首次加载)

**User Action**: 终端执行任务状态变更,观察已打开的看板

**Expected Result**: 变更 ≤5 秒内可见,无需关闭重开看板、无需手动刷新或重启应用

### Step 2b: 终端高频连续变更

**Precondition**: 终端侧短时间内连续执行多笔任务状态变更

**User Action**: 保持看板打开,观察任务状态回流

**Expected Result**: 变更逐笔回流,无丢失、无错误合并;最终状态与 forge 数据一致

### Step 3b: 双形态同时操作同一任务

**Precondition**: 终端与挂接会话几乎同时对同一任务发起操作

**User Action**: 双侧各执行一次任务操作

**Expected Result**: forge 状态机保证一致性;后到操作按 forge 状态语义处理(如未满足前置则被 CLI 拒绝);无数据损坏

### Step 4b: 应用未运行期间发生的终端变更

**Precondition**: 应用未启动时,终端侧已执行任务状态变更

**User Action**: 启动应用并打开任务看板

**Expected Result**: 既有变更在初始加载时正确反映(首次注册/启动扫描既有 forge 数据建立视图)

### Step 5b: 冻结插件(3.x)数据格式兼容

**Precondition**: 终端侧使用冻结插件(3.x)形态操作同一项目

**User Action**: 冻结插件侧执行任务变更后,在应用看板查看

**Expected Result**: 双形态共享 forge 数据格式,互不破坏;看板正常渲染该变更

## Journey Invariants

- forge 数据为唯一事实源:全程不产生第二事实源,双形态交替读写不损坏数据
- 看板免手动刷新:任何一侧的变更 ≤5 秒内在看板可见且标记正确来源([会话]/[终端])
- 工作台自有状态(挂接索引等)与 forge 数据独立存放,互不混写
