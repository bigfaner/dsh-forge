---
feature: "dsh-forge-m3"
journey: "preferences-tiered-override"
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

# Journey: preferences-tiered-override

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

多项目拥有者在工作台概览页偏好编辑面完成运行偏好的三级(全局/项目/feature)查看与修改,理解生效值与覆盖来源(feature > 项目 > 全局逐级覆盖),修改后派发链的预合成系统提示词即时消费最新最终生效值。

> PRD Traceability: Story 5(偏好三级覆盖);SC5;UF4(偏好编辑面·三级);D3(键集全量三级化,surfaces 除外);proposal Key Scenarios「偏好覆盖」。

## Setup

- 应用已启动并激活一个含 ≥1 feature 的已注册项目(fixture 承载)
- 三级偏好存储可用;键集 = auto.\*/worktree.\*/eval.\* 全量(surfaces 除外);已备一个布尔键(如 auto.test.quick)在三级设不同值
- 派发链消费断言通道就绪(预合成系统提示词经测试通道直读)

## Happy Path

### Step 1: 打开偏好编辑面

**User Action**: 用户进入工作台·项目概览设置区,打开偏好面板

**Expected Result**: 呈现三级层级(全局/当前项目/当前 feature);键集固定呈现(auto.\*/worktree.\*/eval.\*),无自由键编辑;surfaces 不出现在键集

### Step 2: 查看三级值与生效解析

**User Action**: 选择三级已设不同值的键查看

**Expected Result**: 三级值分别可见;生效值 = feature 级值(feature > 项目 > 全局覆盖正确);覆盖来源标识可辨(「本级覆盖」/「继承自上级」)

### Step 3: 修改 feature 级键值

**User Action**: 修改该键的 feature 级值并保存

**Expected Result**: 保存经内核偏好 API 持久化;生效值即时更新;呈现「本级覆盖」+ 清除入口

### Step 4: 清除覆盖回落

**User Action**: 点击清除 feature 级覆盖

**Expected Result**: 生效值回落到项目级值;来源标识回到「继承自上级」

### Step 5: 派发链消费生效值断言

**User Action**: 修改任一层级偏好后派发一个任务,经测试通道断言预合成系统提示词

**Expected Result**: 生效偏好反映修改后的最终生效值(断言);编辑面呈现的生效值与派发消费值一致

### Step 6: 全局兜底

**User Action**: 依次清除项目级与 feature 级覆盖后查看生效值

**Expected Result**: 生效值 = 全局值;全局层作为兜底恒有值,项目/feature 级无值时继承链仍完整

## Edge Cases

### Step 1b: 无 feature 时 feature 级不可编辑

**Precondition**: 当前项目不存在 feature(或无激活项目)

**User Action**: 打开偏好面板尝试选择 feature 层级

**Expected Result**: feature 级不可编辑(禁用 + 说明);全局/项目级查看与修改照常可用

### Step 3b: 值类型校验失败

<!-- surface-web required_outcomes 映射:validation-error → 偏好值为固定类型(布尔/数值/枚举),非法输入就近报错不保存 -->

**Precondition**: 修改布尔键时输入非法值

**User Action**: 尝试保存

**Expected Result**: 类型校验错误就近呈现;不保存;用户改正后可重试

### Step 3c: 偏好保存通道异常

<!-- surface-web required_outcomes 映射:session-expired → 内核偏好 API 通道异常时错误呈现,不落半写状态 -->
<!-- source: inferred:偏好修改仅经偏好 API(与 dsh tool 写路径同源,无第二写者)——通道失败必不产生部分持久化 -->

**Precondition**: 保存时内核偏好 API 通道异常

**User Action**: 保存修改

**Expected Result**: 错误呈现,不落半写状态;恢复后可重试;编辑面不呈现未持久化的假生效值

### Step 4b: 覆盖与继承往返一致

**Precondition**: feature 级覆盖已清除(回落至项目级)

**User Action**: 重新设置同键 feature 级覆盖,再次清除

**Expected Result**: 往返后生效值与来源标识与此前状态一致,无残留中间态

### Step 5b: 修改不追溯已派发会话

<!-- source: inferred:预合成发生于派发时点,已启动 subagent 的系统提示词不再改写 -->

**Precondition**: 存在偏好修改前已派发的 subagent

**User Action**: 对比修改前后派发的两个 subagent 系统提示词

**Expected Result**: 已派发 subagent 的提示词不被追溯改写;仅新派发消费新生效值

## Journey Invariants

- 键集固定(auto.\*/worktree.\*/eval.\*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
