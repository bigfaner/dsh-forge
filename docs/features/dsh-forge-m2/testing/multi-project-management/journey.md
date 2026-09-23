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

- 应用已启动且已有 1 个注册项目并处于激活状态(测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理,不以生产仓为承载、不污染真实注册表)
- 存在第二个可注册的 forge 项目路径(含 `.forge`/`docs/features` 等 forge 数据)
- 工作台自有状态(项目注册表)可正常读写
- 跨面断言口径:「项目仓内文件与 forge 数据不被改动」= 测试进程对项目目录做操作前/后文件树快照对拍;注册/激活态 = 工作台状态读数对拍(浏览器侧不自行观测文件系统)

## Happy Path

### Step 1: 进入注册向导

**User Action**: 用户从项目切换器点"添加项目"

**Expected Result**: 进入项目注册向导(浮层/分步),停在步骤 ①(选代码根目录)

### Step 2: 选择代码根目录并检出 forge 数据

**User Action**: 选择第二个项目的代码根目录

**Expected Result**: 系统扫描并检出 forge 数据(显示扫描中 loading 指示);检出通过后进入步骤 ②(选文档位置)

### Step 3: 选择文档位置并完成注册

**User Action**: 保持默认仓内文档位置,点击确认完成

**Expected Result**: ≤3 步完成注册(选代码根目录 → 选文档位置 → 完成);该项目被激活并进入工作台,以代码根目录名作为默认显示名进入项目列表(UF1 数据要求:目录名默认、可改);项目三分信息持久化为工作台自有状态(状态读数见 Setup)

### Step 4: 切换激活项目

**User Action**: 从项目切换器切换回第一个项目

**Expected Result**: 看板/feature/挂接数据完整切换到目标项目(单激活)

### Step 5: 移除一个注册项目

**User Action**: 对第二个项目执行移除并确认二次确认弹层

**Expected Result**: 仅工作台注册信息被删除,项目仓内文件与 forge 数据不被改动(校验通道见 Setup);二次确认明确提示"仅删除工作台注册信息,不动项目文件"

## Edge Cases

### Step 2b: 注册路径未检出 forge 数据

<!-- surface-web required_outcomes 映射:validation-error → 向导输入校验失败 = 本边与 Step 3b(仓外路径冲突)两处实例;错误文案 + 修正引导、停留当前步骤 -->

**Precondition**: 所选代码根目录下未检出 forge 数据(无 `.forge`/`docs/features`)

**User Action**: 用户在步骤 ① 选择该路径并确认

**Expected Result**: 显示错误引导(修正路径或提示先初始化项目);停留在步骤 ①,不得进入步骤 ②

### Step 2c: 重复注册同一项目

<!-- source: inferred:拒绝注册并提示已注册、定位既有项目卡片 —— 推自 tech-design 错误码表 ERR_PROJECT_EXISTS(code_root UNIQUE 冲突);不重复落库由 UNIQUE 约束保证 -->

**Precondition**: 向导步骤 ① 选定的代码根目录已被注册为项目

**User Action**: 用户在步骤 ① 选择该目录并确认

**Expected Result**: 提示该代码根目录已注册并定位既有项目卡片,注册不重复落库(状态读数见 Setup)

### Step 3b: 仓外文档路径与代码根目录相同

**Precondition**: 步骤 ② 选定的仓外文档位置与代码根目录为同一目录

**User Action**: 确认该文档位置

**Expected Result**: 校验失败并拒绝,要求重新选择;不得以相同路径完成注册

### Step 3c: 仓外路径需显式授权

**Precondition**: 步骤 ② 选定的文档位置为仓外本地路径,且 ≠ 代码根目录(与代码根目录相同的情形归 Step 3b)

**User Action**: 用户在步骤 ② 查看授权提示并勾选确认授权

**Expected Result**: 授权确认后方可完成注册(未确认时完成操作不可用);未显式切换仓外时,默认文档位置为仓内(外置默认关闭)

### Step 4b: 已注册项目路径失效

<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口模型),无字面会话过期面;通道失效类比 = 已注册项目数据通道(路径)失效 = 本边 -->
<!-- source: inferred:失联提示 + 重新指向/移除引导 —— 推自 UF4 校验规则「路径失效时明确提示不可访问,并提供重新指向/移除项目引导」(仓外路径既定口径推广至代码根目录,已落地 e2e sc5 失联卡同口径);「不误改」推自移除只删注册信息约束 -->

**Precondition**: 已注册项目的代码根目录已不可访问(被移动/删除)

**User Action**: 打开项目切换器并选择该项目

**Expected Result**: 该项目卡片呈现明确的失联/不可访问提示与重新指向/移除引导;应用不崩溃,项目数据不被误改

### Step 5b: 移除当前激活项目(仍有剩余)

<!-- source: inferred:激活指针置空而非自动迁移到剩余项目 —— 按 tasks 裁决与已落地 e2e(sc5-multi-project)断言:移除 ACTIVE 项目 → 激活指针清空 → 项目域页呈现引导卡 -->

**Precondition**: 待移除项目是当前激活项目,且移除后剩余注册项目 ≥1

**User Action**: 用户执行移除并二次确认

**Expected Result**: 注册信息删除,激活指针置空;任务/feature 等项目域页面呈现选择/注册引导;工作台不残留已移除项目的看板/挂接数据

### Step 5c: 移除最后一个注册项目

**Precondition**: 注册项目仅剩 1 个(即当前激活项目)

**User Action**: 用户执行移除并二次确认

**Expected Result**: 进入空态,注册向导自动进入(UF1 States empty:首次使用/全部移除);项目仓内文件不被改动(校验通道见 Setup)

## Journey Invariants

- 项目三分模型:代码根目录、工作台自有状态、过程文档位置三者独立存放;工作台自有状态不与 forge 数据混放
- 移除项目只删工作台注册信息:任何移除操作不改动项目仓内文件与 forge 数据
- 单激活约束:任意时刻至多一个激活项目

> 覆盖说明:项目显示名仅断言目录名默认(Step 3);显示名编辑与 ≤20 注册项目规模边界(prd-spec Performance 规模假设)不在本旅程断言面——前者随 UF1 编辑模式/重指向腿衔接(feature-board-docs-browsing journey),后者属性能验收腿。
