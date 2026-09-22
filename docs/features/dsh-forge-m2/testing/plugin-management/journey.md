---
feature: "dsh-forge-m2"
journey: "plugin-management"
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

# Journey: plugin-management

**Risk Level**: High

## Overview

SDD 开发者(社区实践者)在工作台内查看插件清单与层级(必备/第三方),对第三方插件执行禁用/启用,且确信 forge 核心插件始终以必备身份在位、启停不损伤任何数据、产品清单不被运行时改写(两级插件模型)。

> PRD Traceability: Story 7(插件管理·两级模型);SC6(两级插件模型);G6(插件化);UF6(插件管理)。

## Setup

- 应用已启动并进入工作台,已装配 forge 核心插件与 ≥1 个第三方插件(测试 fixture,如基座 hello-world),第三方插件处于启用状态
- 产品级配置(基座预留的插件树唯一事实源)就绪;产品清单条目可对照检查

## Happy Path

### Step 1: 打开插件管理区

**User Action**: 用户打开工作台设置区(插件管理区)

**Expected Result**: 插件列表两级呈现:forge 核心插件标记"必备"且仅状态展示(无禁用入口);第三方插件显示启用状态与"禁用"动作

### Step 2: 发起禁用第三方插件

**User Action**: 对第三方插件点击"禁用"

**Expected Result**: 出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)

### Step 3: 确认禁用

**User Action**: 确认禁用

**Expected Result**: 仅该插件注入内容退出;任务看板/会话挂接等核心能力不受影响;forge 数据零损坏

### Step 4: 重新启用

**User Action**: 对该第三方插件点击"启用"

**Expected Result**: 该插件注入内容恢复且数据完整

### Step 5: 检查产品级配置完整性

**User Action**: 检查产品级配置/产品清单条目

**Expected Result**: 产品清单条目未被改写(必备清单对运行时启停只读;升级/重装不冲突)

## Edge Cases

### Step 1b: 尝试禁用 forge 核心插件

**Precondition**: 插件管理区已展示必备(核心)插件

**User Action**: 用户寻找并尝试对核心插件执行禁用

**Expected Result**: 必备插件无禁用入口,任何交互路径都无法禁用 forge 核心能力(行为结果由 SC6 验收)

### Step 2b: 禁用时第三方注入内容在线

**Precondition**: 待禁用第三方插件的注入内容当前在线(工作台内可见)

**User Action**: 对该插件发起禁用

**Expected Result**: 提示影响(会话本体与核心挂接能力不受影响);确认后仅该插件注入内容退出

### Step 3b: 启停执行中重复操作

**Precondition**: 一次启停操作正在执行(操作中指示状态)

**User Action**: 在操作完成前快速重复点击"禁用/启用"

**Expected Result**: 显示操作中(transitioning)指示;防重复执行,不产生中间损坏状态

### Step 4b: 启停后重启应用

**Precondition**: 第三方插件已被禁用

**User Action**: 重启应用并打开插件管理区与工作台

**Expected Result**: 禁用状态保持;数据完整;forge 核心插件仍以必备身份在位

### Step 5b: 禁用后核心能力波及面验证

**Precondition**: 第三方插件处于禁用状态

**User Action**: 依次使用任务看板、任务详情、一键发起会话等核心能力

**Expected Result**: 核心能力全部正常;第三方扩展内容退出说明显示(核心挂接能力不受影响);forge 数据零损坏

## Journey Invariants

- 两级插件模型恒成立:forge 核心插件始终以必备身份在位,任何操作不能使其退出或被禁用
- 启停仅触碰插件装载状态:forge 数据与项目文件零改动(数据零损坏)
- 运行时启停不得写产品清单条目(必备清单对运行时启停只读)
- 禁用第三方只收敛该插件注入内容,工作台核心能力(任务看板/会话挂接)不受影响
