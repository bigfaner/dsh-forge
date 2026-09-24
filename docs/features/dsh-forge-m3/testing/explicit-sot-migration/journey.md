---
feature: "dsh-forge-m3"
journey: "explicit-sot-migration"
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

# Journey: explicit-sot-migration

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

M2 升级用户对已注册且文档树含 `tasks/index.json` 的项目,在工作台显式发起一次性 SoT 迁移(确认 + 自动备份 + 原子执行 + 迁移前后对拍),或将同一迁移确认带入新项目注册向导;中断/失败可回滚重试,零半迁移态,完成后 index.json 终态淘汰、任务/记录 md 原样留存。

> PRD Traceability: Story 1(显式迁移到数据内核);SC2;UF3(显式迁移);D1(显式迁移触发方式);proposal Key Scenarios「既有项目迁移(一次性)」「错误路径(迁移冲突)」。

## Setup

- 应用已启动并激活一个 M2 已注册项目,其文档树含 `tasks/index.json`(含 ≥10 任务、覆盖多状态/依赖结构;测试承载 = 一次性 fixture 项目,迁移含不可逆文件淘汰,不得以生产仓为承载)
- 数据内核(SQLite)可用;迁移发起前记录任务全集基线(ID/状态/依赖/标题)用于对拍
- 项目文档树含任务 md(`tasks/*.md`)与执行记录(`tasks/records/*.md`)

## Happy Path

### Step 1: 概览页发现迁移入口

**User Action**: 用户进入工作台·项目概览,查看项目卡片区

**Expected Result**: 检出 `index.json` 的已注册项目呈现「可迁移」标识与「迁移到 M3 内核」入口;未检出 index.json 的项目不呈现迁移入口

### Step 2: 确认迁移(含备份说明)

**User Action**: 点击「迁移到 M3 内核」,在确认对话框阅读迁移内容、自动备份、迁移后 index.json 淘汰的说明并确认

**Expected Result**: 确认对话框三要素说明齐备;仅在显式确认后才进入执行(无自动/静默迁移路径)

### Step 3: 原子迁移执行与对拍结果

**User Action**: 观察迁移进度浮层直至完成

**Expected Result**: 进度按 校验/迁移/对拍/完成 呈现;迁移原子执行;完成后展示对拍结果 = 任务全集(ID/状态/依赖/标题)与迁移前零差异;备份位置在结果中可见

### Step 4: 迁移后终态确认

**User Action**: 检查项目文档树与任务看板

**Expected Result**: 项目文档树内 `tasks/index.json` 不存在;`tasks/*.md` 与 `tasks/records/*.md` 原样留存于原位置(不迁移不改动);任务看板正常承载全部任务(SQLite 权威);概览页「可迁移」入口消失

## Edge Cases

### Step 2b: 取消确认

**Precondition**: 迁移确认对话框呈现中

**User Action**: 点击取消

**Expected Result**: 不执行任何迁移;项目状态与文件零变化;迁移入口仍在,可再次发起

### Step 3b: 迁移中断/失败后的回滚与重试

**Precondition**: 迁移执行中中断(应用被杀/崩溃)或迁移失败

**User Action**: 重启应用,重新查看概览页并再次发起迁移

**Expected Result**: 呈现已回滚状态 + 「重试」入口;无半迁移态(index.json 完整在位或已淘汰且内核完整,二者其一);重试可成功完成且对拍零差异

### Step 3c: 迁移时外部写入冲突

<!-- source: proposal 错误路径(迁移冲突:迁移时外部写入)检测与重试 -->

**Precondition**: 迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据

**User Action**: 查看迁移结果

**Expected Result**: 冲突被检测;迁移失败并回滚至干净态(不产生两源混合数据);提示后可重试成功

### Step 4b: 注册向导内的同一迁移确认

**Precondition**: 注册一个检出 `index.json` 的既有 forge 项目

**User Action**: 走注册向导,在文档位置步骤后遇到迁移确认步骤并确认

**Expected Result**: 向导内呈现同一迁移确认步骤(含备份说明);确认后完成迁移与注册;结果与概览页路径一致(对拍零差异/index.json 淘汰/md 留存)

### Step 4c: 迁移事件可回查

**Precondition**: 迁移已完成(或已失败回滚)

**User Action**: 回查应用本地日志

**Expected Result**: 迁移事件(备份位置/对拍结果/失败原因)留日志可查;结果不可当场关闭而无痕

## Journey Invariants

- 迁移恒为显式触发(确认 + 迁移前自动备份);不存在自动/静默迁移路径
- 原子性:任何时刻项目处于「迁移前完整」或「迁移后完整」其一,永不出现半迁移态
- 任务/记录 md 永不迁移不改动;结构化状态迁移后以 SQLite 为唯一权威,`tasks/index.json` 终态淘汰
- 完成态必呈对拍结论;迁移事件全程留日志(备份/对拍结果)
