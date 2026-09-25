---
feature: "dsh-forge-m3"
journey: "session-native-ops-skill-addressing"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

# Journey: session-native-ops-skill-addressing

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

SDD 开发者的 agent 会话在已注册项目内以 dsh tool 原生操作面完成任务查询与变更(claim/submit 成功且留 actor 标识、审计可查),并以 dsh 原生扁平名调用必迁技能集(15 项,零 `forge:` 前缀障碍);dsh tool 暂不可用时得到明确的降级提示而非静默失败。

> PRD Traceability: Story 9(会话内原生操作与技能寻址);SC1(技能扁平名断言);D2(customSkillDirs 承载)、D4(知识系数据面入 tool)、D5(必迁 15 项);proposal Key Scenarios「agent 会话内查询」「技能原生寻址」「错误路径(dsh tool 不可用)」。
>
> e2e 驱动面注记:agent 动作不由 web 面直接驱动;以测试通道驱动 dsh tool 调用集(或宿主侧注入记录)模拟 agent 会话操作,回流/审计/寻址断言不受模拟方式影响。

## Setup

- 已注册并完成 SoT 迁移的项目;dsh 宿主可用,model-facing tool 已注册(spike ① 契约形态)
- customSkillDirs 已由应用写入用户层 dsh 配置(D2),必迁 15 项技能可寻址:submit-task、git-commit、git-checkout、run-tests、fix-bug、test-guide、brainstorm、write-prd、tech-design、ui-design、breakdown-tasks、quick-tasks、gen-contracts、gen-journeys、gen-test-scripts
- 备一个可执行任务(带执行 prompt)用于 claim/submit;审计日志通道可查(actor 标识可断言)

## Happy Path

### Step 1: 会话内任务查询(只读 tool)

**User Action**: 用户在已注册项目的 agent 会话内指示 agent 查询任务状态与依赖

**Expected Result**: agent 经 dsh tool 只读查询成功,零 bash spawn CLI;查询结果与数据内核一致(看板同口径)

### Step 2: 会话内任务领取(claim)

**User Action**: 指示 agent 领取(claim)该可执行任务

**Expected Result**: agent 经 dsh tool 执行 claim 成功;操作留 actor 标识(审计可查);任务状态回流看板 ≤5s

### Step 3: 会话内任务提交(submit)

**User Action**: agent 完成执行后,指示其提交(submit)任务

**Expected Result**: submit 成功;actor 标识留存(审计可查);执行记录可渲染(记录渲染入内核);看板回流任务终态

### Step 4: 技能集扁平名寻址

**User Action**: 在会话中以 dsh 原生扁平名逐一调用必迁技能集(15 项)

**Expected Result**: 全部解析成功(无 `forge:` 前缀障碍);技能经 customSkillDirs 配置路径承载,项目仓零新增文件

## Edge Cases

### Step 1b: dsh tool 不可用时的降级提示

<!-- surface-web required_outcomes 映射:session-expired → tool 通道不可用映射为会话内明确降级提示 + 恢复引导,非静默失败 -->

**Precondition**: dsh tool 暂不可用(宿主/插件面缺席)

**User Action**: 在会话中尝试任务查询/变更操作

**Expected Result**: 得到明确的降级提示(而非静默失败);提示指向可用恢复路径;不产生任何部分写

### Step 2b: 非法状态转换被状态机拒绝

<!-- source: inferred:状态机(7 态)入数据内核,非法转换必拒(如对 completed 任务 claim) -->

**Precondition**: 目标任务当前状态不允许该操作(状态机 7 态约束外)

**User Action**: 指示 agent 执行该变更

**Expected Result**: 状态机拒绝并返回明确错误;任务状态不变;审计不留成功记录

### Step 2c: 依赖未满足的变更被依赖解析拒绝

<!-- source: inferred:依赖解析入数据内核,依赖不满足的任务变更被拒 -->

**Precondition**: 任务依赖未满足(blocker 未终态)

**User Action**: 指示 agent 变更该任务

**Expected Result**: 依赖解析拒绝并返回明确错误;不产生越序状态

### Step 3b: 回流、记录与审计三方一致

**Precondition**: claim/submit 均已完成

**User Action**: 对照看板来源标记、执行记录与审计日志

**Expected Result**: actor 标识、看板来源标记、执行记录三方一致,审计链完整可回查

### Step 4b: 暂缓迁移技能缺席不阻断

<!-- source: prd-spec 技能迁移划分表(暂缓 20 项:已注册项目 dsh 会话缺席不阻断,外部会话继续可用) -->

**Precondition**: 会话调用暂缓迁移的辅助技能之一(如评估系 eval-\*)

**User Action**: 观察会话行为并回看外部会话

**Expected Result**: 已注册项目 dsh 会话内该技能缺席不阻断(无错误级失败);外部会话(冻结 CC 插件)继续可用该技能

## Journey Invariants

- 已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 `forge:` 前缀)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
