---
feature: "dsh-forge-m2"
journey: "multi-project-management"
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

# Journey: multi-project-management

**Risk Level**: High

## Overview

多项目拥有者注册多个 forge 项目、在应用内快速切换激活项目,并在不触碰项目文件与 forge 数据的前提下移除注册信息(项目三分模型:代码根目录 + 工作台自有状态 + 过程文档位置)。

> PRD Traceability: Story 5(多项目管理);G5(项目管理);UF1(项目注册与管理);SC5 涉及仓外路径注册(与 feature-board-docs-browsing journey 衔接)。

## Setup

- 应用已启动且已有 1 个注册项目并处于激活状态
- 存在第二个可注册的 forge 项目路径(含 `.forge`/`docs/features` 等 forge 数据)
- 工作台自有状态(项目注册表)可正常读写

## Happy Path

### Step 1: 进入注册向导

**User Action**: 用户从项目切换器点"添加项目"

**Expected Result**: 进入项目注册向导(浮层/分步),停在步骤 ①(选代码根目录)

### Step 2: 选择代码根目录并检出 forge 数据

**User Action**: 选择第二个项目的代码根目录

**Expected Result**: 系统扫描并检出 forge 数据(显示扫描中 loading 指示);检出通过后进入步骤 ②(选文档位置)

### Step 3: 选择文档位置并完成注册

**User Action**: 保持默认仓内文档位置,点击确认完成

**Expected Result**: ≤3 步完成注册(选代码根目录 → 选文档位置 → 完成);该项目被激活并进入工作台;项目三分信息持久化为工作台自有状态

### Step 4: 切换激活项目

**User Action**: 从项目切换器切换回第一个项目

**Expected Result**: 看板/feature/挂接数据完整切换到目标项目(单激活)

### Step 5: 移除一个注册项目

**User Action**: 对第二个项目执行移除并确认二次确认弹层

**Expected Result**: 仅工作台注册信息被删除,项目仓内文件与 forge 数据不被改动;二次确认明确提示"仅删除工作台注册信息,不动项目文件"

## Edge Cases

### Step 1b: 注册路径未检出 forge 数据

**Precondition**: 所选代码根目录下未检出 forge 数据(无 `.forge`/`docs/features`)

**User Action**: 用户在步骤 ① 选择该路径并确认

**Expected Result**: 显示错误引导(修正路径或提示先初始化项目);停留在步骤 ①,不得进入步骤 ②

### Step 2b: 仓外文档路径与代码根目录相同

**Precondition**: 用户在步骤 ② 切换"仓外路径"并选择了与代码根目录相同的目录

**User Action**: 确认该文档位置

**Expected Result**: 校验失败并拒绝,要求重新选择;不得以相同路径完成注册

### Step 3b: 仓外路径需显式授权

**Precondition**: 用户在步骤 ② 选择仓外本地路径作为文档位置

**User Action**: 查看授权提示并确认(或不选择仓外)

**Expected Result**: 仓外路径必须显式选择并确认授权;未显式选择时默认文档位置为仓内(外置默认关闭)

### Step 4b: 移除当前激活项目

**Precondition**: 待移除项目是当前激活项目

**User Action**: 用户执行移除并二次确认

**Expected Result**: 注册信息删除后激活态正确处理(切换到剩余项目,或全部移除后自动进入注册向导空态);工作台不残留已移除项目的看板/挂接数据

### Step 5b: 注册路径不可访问

**Precondition**: 已注册项目的代码根目录已不可访问(被移动/删除)

**User Action**: 打开项目切换器/项目列表并选择该项目

**Expected Result**: 明确的不可访问/错误提示,应用不崩溃;项目数据不被误改

### Step 6b: 重复注册同一项目

**Precondition**: 该代码根目录已被注册为项目

**User Action**: 再次走注册向导选择同一目录

**Expected Result**: 系统明确处理(提示已注册或复用既有注册项),不产生重复或损坏的注册记录

## Journey Invariants

- 项目三分模型:代码根目录、工作台自有状态、过程文档位置三者独立存放;工作台自有状态不与 forge 数据混放
- 移除项目只删工作台注册信息:任何移除操作不改动项目仓内文件与 forge 数据
- 单激活约束:任意时刻至多一个激活项目
