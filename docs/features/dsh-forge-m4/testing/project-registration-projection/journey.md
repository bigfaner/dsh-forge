---
feature: "dsh-forge-m4"
journey: "project-registration-projection"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m4/prd/prd-user-stories.md
  - docs/features/dsh-forge-m4/prd/prd-spec.md
  - docs/features/dsh-forge-m4/prd/prd-ui-functions.md
generated: "2026-09-30"
---

# Journey: project-registration-projection

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

编排者经工作台左栏「＋」打开添加项目确认卡,给定唯一必答的代码区路径,经侦测与证据三档门控得到文档位置预览行,确认添加后项目写入 forge 注册表(权威)并单向投影到 dsh workspaceRegistry 同名条目(顺序一致);此后经项目 cwd 派发的会话自动归组到对应 workspace,不再落入「未分组」——这是 M4「注册即归组」的主线用户工作流(注册交互按 2026-09-26 裁决 v2 定形)。

> PRD Traceability: Story 4(注册即归组·投影);SC3(单向投影);UF7(添加项目确认卡/文档位置);PRD 必答③(三区位置交互与校验,2026-09-26 修订)/必答④(投影语义与降级);裁决 docs/decisions/project-storage-and-knowledge.md §5 v2;proposal Key Scenarios「三区位置选择」「投影归组」「错误路径」。

## Setup

- 应用已启动,项目工作台可用;已有 ≥1 个注册项目(同名同序断言基线)
- 备路径 fixture 集:存在且含 .git 与仓内 forge 树特征的仓/存在但无 .git 的目录/不存在的路径/已注册项目的代码根/含 ≥2 个 .git 子仓的父目录
- dsh 侧 workspaceRegistry 投影通道就绪(可写);断言口径 = forge 注册表与 workspace 同名且顺序一致;派发归组经 dsh 原生 UI 断言;投影操作同步完成 ≤2s(失败降级不阻断)

## Happy Path

### Step 1: 打开添加项目确认卡

**User Action**: 编排者点击工作台左栏区头「＋」

**Expected Result**: 添加项目确认卡原位弹出(不跳页);唯一必答 = 代码区文件夹(拖拽/粘贴/浏览);知识区不上卡(M4 不渲染)

### Step 2: 给定代码区路径并侦测

**User Action**: 给定一个存在的 git 仓代码区路径

**Expected Result**: 侦测 git/仓内 forge 树特征/已注册/父目录多子仓;项目名自动取文件夹名(✎ 可改);侦测陈述与文档位置预览行呈现(valid 态可添加)

### Step 3: 核查文档位置预览行(证据三档门控)

**User Action**: 察看文档位置预览行

**Expected Result**: 预选由本仓证据三档门控——命中仓内 forge 树 = 沿用仓内/有 .git = 仓内新建 `<root>\docs`(懒物化)/无 .git = 应用管理主路径;✎ 展开才见模式+路径;过程留痕灰字告知

### Step 4: 确认添加项目

**User Action**: 点击「添加项目」

**Expected Result**: 注册写入 forge 项目注册表(权威条目);投影写入 dsh workspaceRegistry 同名条目且顺序与项目列表一致(断言);投影操作同步完成 ≤2s

### Step 5: 验证派发会话归组

**User Action**: 经该项目 cwd 派发会话,在 dsh 原生 UI 查看会话列表

**Expected Result**: 该会话归组到对应同名 workspace(断言);不落入「未分组」;未注册目录的既有会话仍显示为未分组(不破坏)

## Edge Cases

### Step 2b: 路径不存在

**Precondition**: 给定路径不存在(或非目录)

**User Action**: 提交路径

**Expected Result**: missing 态「路径不存在」+ 添加禁用;即时提示、留在卡内修正;不产生半注册状态

### Step 2c: 已注册代码根

**Precondition**: 给定路径已注册为某项目代码区(realpath 归一命中)

**User Action**: 提交路径

**Expected Result**: registered 态「已注册项目 — 同一代码根仅一个项目」+ 禁用;快车道 toast 打开既有项目,不出卡流程

### Step 2d: 父目录误选(多子仓)

**Precondition**: 给定目录下含 ≥2 个 .git 子仓

**User Action**: 提交父目录路径

**Expected Result**: parent 态呈现子仓 chips 一键选择具体子仓;不误注册父目录

### Step 2e: 无 .git 目录(零 git 强制)

**Precondition**: 给定存在目录但无 .git

**User Action**: 提交路径

**Expected Result**: nogit 态信息提示「未检测到 git — 文档将由应用管理」(信息,非错误);文档位置预选 = 应用管理主路径;任何流程不以「先 git init」为前置

### Step 3b: 换路径重估(黏性禁令)

**Precondition**: 已在卡内察看过一个路径的文档位置预选,再更换为另一路径

**User Action**: 给定新路径

**Expected Result**: 预览行预选仅由新路径的本仓证据决定,换路径即重估;无跨项目黏性(仓内选择不跨项目携带)

### Step 3c: 高级自定义仓外路径

**Precondition**: 用户展开高级折叠,自定义文档路径位于代码根之外

**User Action**: 输入仓外自定义路径

**Expected Result**: 呈现显式授权行(仓外需授权);未授权不可用;仓外授权收窄至高级自定义(BIZ-001/003)

### Step 4b: 投影写入失败降级

**Precondition**: workspaceRegistry 不可写或投影写入失败

**User Action**: 点击「添加项目」

**Expected Result**: 注册不被阻断(本地权威条目已写),降级为无投影继续运行(归属仅 forge 侧可见)+ 可重试提示(e2e 断言);恢复后重试成功即两侧一致;不静默失败

<!-- surface-web required_outcomes 映射:network-error → 投影通道(host 半身)写入失败,呈现为降级态 + 手动重试入口,注册数据无丢失 -->

### Step 4c: 可写性运行时复检

**Precondition**: 注册完成后运行时探测代码区/文档位置不可写

**User Action**: 察看项目行/设置页投影状态

**Expected Result**: 可写性为运行时状态(非注册门槛):呈现降级状态与提示,不回滚注册

## Journey Invariants

- forge 项目注册表为唯一权威;dsh workspaceRegistry 恒为单向投影(DF001),旅程全程无 dsh→forge 反向写
- 注册硬校验仅 2 条:代码区存在且为目录 + 可读;跨项目唯一(realpath 归一比对)
- 零 git 强制:无 .git 目录为一等公民;任何流程不得以「先 git init」为前置
- 黏性禁令:文档位置默认只由本仓证据决定,不跨项目携带仓内选择
- 投影失败不阻断注册(降级承诺,提供手动重试);健康时同名同序恒成立;投影操作 ≤2s
- 词汇统一「添加项目 / 文档位置」;场景演示 chips 不上产品 UI
