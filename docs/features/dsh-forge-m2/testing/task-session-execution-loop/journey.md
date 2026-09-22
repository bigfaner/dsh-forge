---
feature: "dsh-forge-m2"
journey: "task-session-execution-loop"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: task-session-execution-loop

**Risk Level**: High

## Overview

SDD 开发者在应用内完成"浏览任务看板 → 查看任务详情 → 一键发起带任务上下文的 dsh 会话 → agent 在会话中执行任务操作 → 状态回流看板 → 重启后回溯挂接"的零终端闭环——这是 dsh-forge-m2 需求与会话工作台的主线用户工作流(本 feature 的 Golden Path)。

> PRD Traceability: Story 1(任务可视化浏览)、Story 2(一键发起带任务上下文的会话)、Story 3(状态回流与来源标识);SC2(零终端只读闭环)、SC3(会话注入链路);UF2/UF3/UF5。

## Setup

- 应用已安装并启动,已注册并激活一个含 ≥10 个任务、含依赖关系的 forge 项目(如本仓 dsh-forge)
- 任务看板可正常加载,存在至少一个处于可执行状态且有执行 prompt 的任务
- dsh 宿主可用(凭据就绪),主窗口会话界面可进入

## Happy Path

### Step 1: 打开任务看板浏览依赖树

**User Action**: 用户进入工作台·任务看板,浏览激活项目的任务依赖树视图

**Expected Result**: 依赖树图形化展示 blocker 关系;任务数/状态/依赖与 `forge task list` 输出一致;首屏 ≤2 秒(500 任务规模)

### Step 2: 打开任务详情

**User Action**: 点击一个处于可执行状态的任务卡片/节点

**Expected Result**: 详情面板展开,描述、依赖链(上游 blocker 链)、执行记录均可读;若任务在非默认 worktree 有执行痕迹,worktree 标识可见

### Step 3: 一键发起会话

**User Action**: 在任务详情点击"发起会话"(1 次点击)

**Expected Result**: ≤1 次点击进入会话界面,发起到会话界面可交互 ≤3 秒;发起中显示发起中指示(initiating);挂接关系写入工作台自有状态(挂接索引)

### Step 4: 确认任务执行 prompt 自动注入

**User Action**: 查看该会话中 agent 收到的首条用户消息

**Expected Result**: 消息包含 `forge prompt get-by-task-id` 的完整输出,零手工粘贴

### Step 5: agent 执行任务操作并回流看板

**User Action**: agent 在会话中经 forge CLI 执行一次任务 claim(审批走主窗口现有会话 UI)

**Expected Result**: 看板 ≤5 秒内免手动刷新更新任务状态,该笔变更标记来源[会话]

### Step 6: 重启应用后回溯挂接

**User Action**: 重启应用,重新打开该任务详情,查看挂接状态与历史

**Expected Result**: 任务↔会话挂接关系仍然存在;任务卡显示挂接状态;历史挂接列表可回溯(会话标识/时间)

## Edge Cases

### Step 1b: 任务无执行 prompt 时发起入口禁用

**Precondition**: 所选任务不存在执行 prompt(不满足发起条件)

**User Action**: 用户打开该任务详情并寻找"发起会话"入口

**Expected Result**: 按钮禁用并说明原因;不发起任何会话、不写入挂接索引

### Step 2b: 会话发起失败(宿主/凭据异常)

**Precondition**: dsh 宿主不可用或凭据异常

**User Action**: 用户点击"发起会话"

**Expected Result**: 错误提示与恢复引导(沿用 M1 崩溃恢复/配置引导模式);返回工作台后可重试;不残留半初始化的挂接记录

### Step 3b: 状态回流超时(>5 秒未更新)

**Precondition**: agent 已在挂接会话中完成 claim,但看板超过 5 秒仍未显示该更新

**User Action**: 用户察看看板任务卡片与变更提示

**Expected Result**: 看板显示回流中(updating)轻量变更提示而非静默停滞;变更到达时来源标识[会话]正确;任务数据最终不丢失

### Step 4b: agent 连续多笔变更逐笔回流

**Precondition**: 挂接会话中 agent 连续执行多笔任务状态变更(claim → transition → submit)

**User Action**: 用户保持看板打开,观察任务卡片状态

**Expected Result**: 每笔变更 ≤5 秒回流,来源逐笔标记[会话];最终状态与 forge 数据一致

### Step 5b: 同一任务重复发起第二个会话

**Precondition**: 该任务已有一个进行中的挂接会话

**User Action**: 用户从同一任务卡片/详情再次点击"发起会话"

**Expected Result**: 挂接索引记录多条挂接,任务详情可区分多个挂接条目;forge 数据不受影响(挂接为工作台自有状态)

### Step 6b: 任务历史上挂接多个会话的回溯

**Precondition**: 一个任务历史上先后挂接过多个会话

**User Action**: 用户打开该任务详情查看挂接历史列表

**Expected Result**: 历史挂接列表完整、按时间可回溯,每条含会话标识/时间;与挂接索引(工作台自有状态)一致

## Journey Invariants

- 看板对人只读:全程任何视图不出现任务状态变更的写操作入口(add/claim/transition/submit/reopen)
- forge 数据为唯一事实源:挂接关系只写入工作台自有状态,不写入 forge 数据,不产生第二事实源
- 每笔任务状态变更在看板标记来源([会话]),且与实际操作通道一致
- 状态回流时效:每笔会话侧变更 ≤5 秒内免手动刷新可见
