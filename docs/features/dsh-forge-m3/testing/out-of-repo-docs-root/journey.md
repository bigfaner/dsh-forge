---
feature: "dsh-forge-m3"
journey: "out-of-repo-docs-root"
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

# Journey: out-of-repo-docs-root

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

SDD 开发者注册新项目时,过程文档根默认位于代码仓外(应用管理路径),仓内仅显式可选;以默认仓外注册的项目,任务/记录/阶段资产/proposals 全部读写落于文档根,代码仓保持零新增过程文档;既有仓内文档项目在 M3 读写兼容不破坏。

> PRD Traceability: Story 7(过程文档默认仓外);SC9;proposal Key Scenarios「新注册默认仓外」。

## Setup

- 应用已启动;备一个新 forge 项目代码仓(fixture:含 .git 与代码文件,无过程文档)
- 备一个既有仓内文档根的已注册项目(兼容性承载)
- 文档根路径授权机制沿用 M2;应用管理路径可写

## Happy Path

### Step 1: 注册向导到达文档位置步骤

**User Action**: 用户经项目切换器「添加项目」发起注册新项目,走到文档位置步骤

**Expected Result**: 默认值 = 仓外文档根(应用管理路径);仓内存放为可选项(非默认)

### Step 2: 以默认仓外完成注册

**User Action**: 接受默认仓外文档根并完成注册

**Expected Result**: 注册成功;项目文档根位于仓外应用管理路径;注册过程不向代码仓写入任何过程文档(若项目检出 `index.json`,向导插入迁移确认步骤,行为见 explicit-sot-migration Step 4b)

### Step 3: 过程资产读写落于文档根

**User Action**: 在该注册项目上执行任务/记录/阶段资产/proposals 的读写(看板浏览 + agent 会话产出过程资产)

**Expected Result**: 全部过程文档落于仓外文档根;代码仓内零新增过程文档(断言);indexer/看板/提案板/阶段资产全部按文档根寻址

### Step 4: 既有仓内项目兼容

**User Action**: 打开既有仓内文档根项目,执行 M3 读写(任务看板/阶段资产面板/提案看板)

**Expected Result**: 全部功能兼容不破坏;文档根仍在仓内;行为不因默认值翻转而改变

## Edge Cases

### Step 1b: 显式选择仓内文档根

**Precondition**: 文档位置步骤呈现中

**User Action**: 显式选择仓内选项并完成注册

**Expected Result**: 注册成功,文档根位于仓内;仓内文档工作流照常可用(选项保留,非淘汰)

### Step 2b: 文档根路径未授权

<!-- source: prd-spec Security(文档根路径授权沿用 M2) -->

**Precondition**: 默认仓外路径尚未经用户授权

**User Action**: 走注册向导到达文档位置步骤

**Expected Result**: 呈现授权引导(沿用 M2 机制);授权后注册与后续读写正常

### Step 3b: 长期运行后的仓内零新增边界

**Precondition**: 仓外注册项目已运行一段时间(任务/记录/阶段资产/proposals 多类读写)

**User Action**: 检查代码仓工作区(git status)

**Expected Result**: 代码仓内除用户自有改动外零新增过程文档;全部过程资产仅存在于文档根

### Step 4b: 仓内项目的外部变更回流

**Precondition**: 既有仓内项目的文档被外部(终端 CLI/编辑器)修改

**User Action**: 回看应用内工作台

**Expected Result**: 感知回流照常(≤5s 口径);兼容性含完整回流链路,非仅静态读取

## Journey Invariants

- 新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项
- 仓外注册项目:代码仓内零新增过程文档
- 全部过程资产读写按文档根寻址(indexer/看板/提案板/阶段资产同源)
- 既有仓内项目行为零破坏(默认值翻转不回溯影响存量项目)
