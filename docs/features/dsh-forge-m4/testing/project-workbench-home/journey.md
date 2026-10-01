---
feature: "dsh-forge-m4"
journey: "project-workbench-home"
risk_level: "Medium"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m4/prd/prd-user-stories.md
  - docs/features/dsh-forge-m4/prd/prd-spec.md
  - docs/features/dsh-forge-m4/prd/prd-ui-functions.md
generated: "2026-09-30"
---

# Journey: project-workbench-home

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者启动应用直接进入项目工作台:左栏全项目树枚举/切换全部项目(独立项目列表页不存在),一个工作台页内同屏看到代码区(会话/worktree 状态)与 forge 文件区(提案/feature/任务/阶段资产 + 管线入口导航占位),既有 forge 视图全部收纳进项目上下文——这是 M4「项目一页可见」的主线用户工作流(本 feature 的 Golden Path,项目中心 IA 承重层的运行载体)。

> PRD Traceability: Story 1(项目一页可见);SC1(项目一级导航·孤儿视图清零)、SC2(三区容器)、SC5(收纳零缩水观察)、SC6(首屏 ≤2s);UF1、UF2、UF3;PRD 必答①/②(导航迁移清单);proposal Key Scenarios「项目工作台(happy)」「既有能力收纳」。

## Setup

- 应用已安装并启动,M1-M3 基座可用(壳/单实例、任务看板、提案板、阶段资产面板、发起链、文档根);测试承载 = fixture 项目集(临时目录 + 隔离 userData,测试后清理)
- 已注册 ≥2 个项目:其一为活跃项目(含会话/worktree 状态/任务/提案数据),其一已归档;应用记住上次活跃项目(启动时恢复其指向)
- 断言口径(测试层,Expected Result 不重复携带):孤儿视图 0 以应用内全量路由归属枚举核验(枚举口径下沉 Contract 层,旅程层语义形 = 任何 forge 视图入口均处于项目上下文);知识区零空占位 = 空 tab/空视图/预置数据元素计数为 0;首屏 ≤2s 在 500 任务规模下计测;「视图切换不劣于重构前」以重构前构建在同 fixture 规模下同口径计测捕获的切换耗时为基线

## Happy Path

### Step 1: 启动进入项目工作台首屏

**User Action**: 编排者启动应用

**Expected Result**: 首屏 = 项目工作台(/p/:projectId,2026-09-27 裁决),恢复上次活跃项目,三区容器整台呈现;不以 dsh 原生会话列表或旧全局平铺导航为首屏

### Step 2: 左栏全项目树枚举

**User Action**: 查看左栏「项目」区全项目树

**Expected Result**: 全部注册项目可枚举(含归档分区降透明只读呈现,不挂会话);项目行带路径健康角标;不存在独立项目列表页入口(项目枚举/切换/归档分区并入左栏)

### Step 3: 点击项目行切换工作台

**User Action**: 点击另一个项目行

**Expected Result**: 工作台整台跟随切换——左栏会话组、中间会话面板、右栏项目概览均切到目标项目;切换即时生效并被记住(重启恢复目标项目,见步骤 6);无前一项目内容残留(source: inferred,推自 UF1「整台跟随」切换语义 + BIZ-workbench-002 单激活模型)

### Step 4: 同页核查三区容器

**User Action**: 展开右栏项目概览,依次点开提案/feature/任务/阶段资产子 tab

**Expected Result**: 代码区(会话列表/worktree・工作区状态)与 forge 文件区同页可见(概览子 tab:提案/feature/任务/阶段资产;管线入口以导航占位呈现);知识区为扩展位且不渲染任何空 tab/空视图/预置数据

### Step 5: 巡检 forge 视图归属与收纳零缩水

**User Action**: 依次打开提案板、feature/任务浏览、阶段资产面板、任务看板

**Expected Result**: 每个视图均处于项目上下文(孤儿视图为 0);M2 看板保持独立视图(不从属 feature),M3 提案板/阶段资产面板收纳进 forge 文件区后功能面完整可用(零缩水);发起链原位保留(挂接写入不变)

### Step 6: 重启恢复活跃项目

**User Action**: 退出并重启应用

**Expected Result**: 首屏仍为项目工作台,恢复最后活跃项目(步骤 3 切换后的项目);首屏呈现 ≤2s(500 任务规模)

## Edge Cases

### Step 1b: 无项目首启空态

**Precondition**: 无任何注册项目(全新安装)

**User Action**: 启动应用

**Expected Result**: 工作台空态 hero 引导「添加项目」(UF7 入口);不渲染空项目树/空三区骨架;无报错(source: inferred,推自 UF1 empty 态定义——空态唯一呈现即 hero 引导)

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无常规表单输入面,最近似面 = 空态引导可达的添加项目确认卡路径输入,非法输入映射为即时校验提示、留在卡内可修正(Story 4 AC1/UF7,操作细节由注册旅程承载);source: inferred(推自 surface-web 规则强制项 × Story 4 AC1 即时提示不静默) -->

### Step 3b: 路径降级项目切换

**Precondition**: 目标项目的代码区/forge 文件区路径探测失败(路径健康 degraded)

**User Action**: 点击该路径异常项目行

**Expected Result**: 切换完成且项目行路径健康角标提示异常;工作台不白屏、不静默失败(source: inferred,推自 UF1 path-degraded 角标可见提示 × 非致命失败不打断呈现的降级基线 BIZ-resilience-001)

### Step 4b: 工作台数据加载失败

**Precondition**: 工作台数据加载出错(通道异常/数据缺失)

**User Action**: 察看工作台呈现

**Expected Result**: 明确错误 + 重试按钮(error 态);loading 骨架屏不永久滞留;重试可恢复

<!-- surface-web required_outcomes 映射:network-error → 工作台数据加载失败,呈现为 error 态明确错误 + 重试入口,无数据丢失(UF2 States error);source: inferred(推自 surface-web 规则常见项映射) -->
<!-- surface-web required_outcomes 映射:session-expired → 桌面壳无独立登录会话,最近似面 = 宿主/数据通道失联,映射为本步 error 态呈现——明确错误 + 重试入口,恢复后重试可恢复,无数据丢失;source: inferred(推自 surface-web 规则强制项 × UF2 States error) -->

### Step 6b: 上次活跃项目已删除

**Precondition**: 应用记住的上次活跃项目已被删除

**User Action**: 重启应用

**Expected Result**: 首屏落到其余项目或空态;不指向已删项目、无报错残留

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
