---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "worker-provisioning"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: worker-provisioning

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者配置 Forge设置 的 worker 默认 LLM 档位后，派发出的 worker 按任务类型带最小工具面、继承组合技能目录、统一用默认 LLM——worker 既能干活又不越权（不问用户、不派生子代），模型档位不随父会话漂移；重大问题经 addTask 逃生通道二分处置。（PRD Story 5；业务流程四；SC2 worker 层）

## Setup

- Forge设置 分区 worker 小节可配置（Provider / Model / Reasoning 三项）
- 任务库含多类型任务（coding 族 / doc 族 / gate / 验证类——收窄矩阵各类型代表）
- run-tasks 派发通道可用（dispatcher 循环可发起）

## Happy Path

### Step 1: 配置 Forge设置 worker 默认 LLM

**User Action**: 单人开发者在设置对话框 Forge设置 分区 worker 小节配置默认 LLM 三项（Provider / Model 联动 / Reasoning 低|中|高）并保存

**Expected Result**: 保存成功 → 持久化（用户数据域 forge-settings.json，core forgeSettings 单门读写）、下次派发生效

### Step 2: run-tasks 派发任一 worker

**User Action**: 发起 run-tasks 使 dispatcher 派发一个 worker

**Expected Result**: spawn 携带 **agentOptions**（provider / model / effort / output-token = 该档位，**优先于父会话继承**）；worker 会话 model 与配置一致（断言）

### Step 3: 按任务类型族派发（收窄矩阵）

**User Action**: 依次派发 coding 族 / doc 族 / gate / 验证类任务

**Expected Result**: worker tool 面仅含矩阵 ✓ 列工具（toolFilter 断言）；**全局拒绝集**（ask-user / delegation / todo / present）对所有 worker 生效；worker 携带 **submitTask + addTask**（claimTask / queryTask 不入）

### Step 4: 远征默认会话派发 worker（技能继承）

**User Action**: 从远征默认会话派发 worker 并转录其技能目录

**Expected Result**: 目录 = **组合继承目录**（与父一致）；测试任务实际加载 run-tests、非测试任务不加载（按需断言）；远征 worker 含 spec 技能行（内容不加载）、突击 worker 不含（预设级 L1 不破）

### Step 5: worker 遇重大问题经 addTask 追加任务

**User Action**: worker 执行中遇无法解决的重大问题，经 addTask 追加任务并结算自身

**Expected Result**: 前缀按语义二分：**disc-N**（独立问题，不阻塞源）/ **fix-N**（走 fix 链协议——block_source 单事务、链深 ≤6、恢复钩子，M2 机制回归）；自身任务以 blocked 收尾并引用新任务

## Edge Cases

### Step 1b: 未配置态

**Precondition**: worker 小节三项未填齐

**User Action**: 查看 Forge设置 分区并尝试保存

**Expected Result**: ⚠ 占位说明「worker 派发将回退父会话继承」（**显式不静默**）+ 保存禁用；填齐激活（脏态实时）

### Step 1c: 保存失败

**Precondition**: 持久化写入失败（如用户数据域不可写）

**User Action**: 点保存

**Expected Result**: **错误行留场可重试**（不静默丢弃；已填值不丢失）

### Step 2b: agentOptions 优先级

**Precondition**: 父会话模型与配置档不同（父会话继承面与 Forge设置 档位冲突）

**User Action**: 派发 worker 并核对其会话 model

**Expected Result**: worker model 仍 = 配置档（**显式指定优先于父会话继承**——不随父漂移）

### Step 3b: 被拒工具调用

**Precondition**: worker 请求全局拒绝集内工具（如 ask-user 问用户）

**User Action**: worker 尝试调用被拒工具

**Expected Result**: **物理不在面**（deny 生效断言）——调用不可达，非运行期劝阻；worker 不问用户、不派生子代

### Step 4b: 突击 worker 请求 spec 技能

**Precondition**: 从突击会话派发的 worker

**User Action**: 枚举其技能目录并尝试请求 spec 技能

**Expected Result**: **物理不可见**（预设级 L1 不破——技能枚举断言）；远征 worker 含 spec 技能行但内容不加载（token 纪律）

### Step 5b: fix-N 链深边界

**Precondition**: fix 链已接近最大深度

**User Action**: worker 再经 addTask 追加 fix-N 任务

**Expected Result**: **链深 ≤6 纪律**（M2 机制回归断言）；超限不放行（无无限 fix 链）

### Step 5c: 前缀语义二分边界

**Precondition**: worker 追加任务时选择前缀

**User Action**: 分别以独立问题（disc-N）与阻塞问题（fix-N）追加

**Expected Result**: **两前缀行为分化断言**：disc-N 不阻塞源任务（源可继续）/ fix-N block_source 单事务（源即时 blocked 并引用）

## Journey Invariants

- worker **永不问用户、不派生子代**（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（agentOptions 显式携带、优先于父会话继承）
- worker 技能目录 = **组合继承目录**（catalog 行级常驻、内容按需加载——token 纪律）
- **零新装载机制**：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
