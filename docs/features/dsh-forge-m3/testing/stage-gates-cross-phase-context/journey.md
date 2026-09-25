---
feature: "dsh-forge-m3"
journey: "stage-gates-cross-phase-context"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

# Journey: stage-gates-cross-phase-context

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

SDD 开发者经 feature 看板消费阶段化编排:查看阶段 stepper 与阶段门状态,阶段总结未生成时推进请求被门拒绝(可观察引导),总结生成后推进成功并落阶段资产文件(目标 + 摘要)至文档根,阶段资产面板只读浏览,新阶段会话系统提示词强制注入目标与摘要;外部会话跨阶段操作仅呈现偏离标识、不硬阻断。

> PRD Traceability: Story 4(阶段门与上下文跨阶段传递);SC4;UF2(阶段化呈现与阶段资产);proposal Key Scenarios「阶段推进」「产物齐全性检查(派发前)」。派发前产物齐全性检查的看板侧交互见 task-dispatch-execution-loop Step 2b(同一确定性检查机制)。

## Setup

- 已注册项目含一个处于中间阶段(如 tasks 阶段)的 feature(fixture 承载;阶段推进会改变 feature 阶段并生成资产文件)
- 数据内核可查询阶段门状态;文档根可写(阶段资产文件落文档根)
- 断言通道:门校验与产物检查的确定性(无模型调用)经测试日志断言;新阶段会话系统提示词注入内容经测试通道直读

## Happy Path

### Step 1: 查看阶段 stepper 与门状态

**User Action**: 用户进入工作台·Feature 看板,点击目标 feature

**Expected Result**: 列表呈现各 feature 当前阶段(prd→design→tasks→in-progress→completed stepper);详情区呈现阶段门状态(总结已生成/未生成)与偏离标识(如有)

### Step 2: 总结未生成时请求推进被拒

**User Action**: 请求将该 feature 推进到下一阶段

**Expected Result**: 请求被门拒绝;拒绝文案可观察并引导缺失动作(生成阶段总结);feature 阶段不变

### Step 3: 生成阶段总结

**User Action**: 在 agent 会话完成阶段总结(经 dsh 通道/技能产出),回到 feature 看板查看

**Expected Result**: 阶段资产文件(阶段目标 + 摘要)落于文档根;门状态更新为「总结已生成」(感知回流,免手动刷新);元数据(路径/阶段/生成时间)入内核快照

### Step 4: 推进成功

**User Action**: 再次请求推进

**Expected Result**: 推进成功;阶段 stepper 前移;项目文档根存在对应阶段资产文件(目标 + 摘要)

### Step 5: 阶段资产面板只读浏览

**User Action**: 打开详情区「阶段资产」面板浏览

**Expected Result**: 按阶段浏览目标 + 摘要只读渲染(经 MarkdownView 白名单);无任何编辑入口

### Step 6: 新阶段会话注入断言

**User Action**: 在新阶段启动会话/派发任务,经测试通道断言会话系统提示词

**Expected Result**: 新阶段会话系统提示词强制包含目标 + 摘要(注入内容断言);可派发集只为当前(新)阶段任务

### Step 7: 外部会话跨阶段操作的偏离呈现

**User Action**: 以外部会话(终端/冻结 CC 插件)对该 feature 做跨阶段操作,回看 feature 看板

**Expected Result**: 偏离标识可见;外部会话不被硬阻断;标识仅为呈现

## Edge Cases

### Step 1b: 无阶段资产的空态

**Precondition**: feature 尚无推进记录(早期阶段)

**User Action**: 打开「阶段资产」面板

**Expected Result**: 呈现无阶段资产占位说明(asset-empty,正常态),无错误

### Step 3b: 总结经外部通道生成

**Precondition**: 阶段总结由外部会话/终端产出资产文件(非应用内通道)

**User Action**: 回看 feature 看板门状态

**Expected Result**: 门状态经感知更新(≤5s 口径沿用感知链),与内部通道结果一致

### Step 4b: 多次推进的资产累积

**Precondition**: feature 先后完成多次阶段推进

**User Action**: 打开「阶段资产」面板逐阶段浏览

**Expected Result**: 各阶段资产按阶段完整累积、可回溯;面板内容与文档根文件一致

### Step 5b: 阶段资产渲染防注入

<!-- source: prd-spec Security(markdown 防注入:阶段资产渲染经白名单) -->

**Precondition**: 阶段资产文件内含恶意 markdown 结构(脚本注入/危险链接)

**User Action**: 浏览「阶段资产」面板

**Expected Result**: 渲染经 MarkdownView 白名单,注入内容不生效;面板严格只读(无编辑/写入口)

### Step 7b: 偏离标识不产生阻断交互

**Precondition**: 偏离标识呈现中

**User Action**: 点击偏离标识并继续正常编排操作

**Expected Result**: 任何交互不产生阻断弹窗/锁定;正常派发与浏览照旧可用(标识仅呈现)

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
