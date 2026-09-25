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

<!-- golden_path 语义:标识「本旅程是否为 feature 指定的 Golden Path 主旅程」(每 feature 至多一条;dsh-forge-m3 指定主旅程 = task-dispatch-execution-loop);false ≠ 缺少 Happy Path——本旅程含完整 4 步 Happy Path(Steps 1-4) -->

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
- 断言口径:浏览器面断言 = UF3 状态呈现与看板承载;文档树/备份工件/日志断言 = harness 级(测试通道直读;备份目录 `<userData>/workbench/backups/<projectId>-<ts>/` <!-- source: design/tech-design.md 迁移流程 -->);内核/源数据/外部写故障注入经测试通道(见 Step 2c/3c/3d)

## Happy Path

### Step 1: 概览页发现迁移入口

**User Action**: 用户进入工作台·项目概览,查看项目卡片区

**Expected Result**: 检出 `index.json` 的已注册项目呈现「可迁移」标识与「迁移到 M3 内核」入口;未检出 index.json 的项目不呈现迁移入口

### Step 2: 确认迁移(含备份说明)

**User Action**: 点击「迁移到 M3 内核」,在确认对话框阅读迁移内容、自动备份、迁移后 index.json 淘汰的说明并确认

**Expected Result**: 确认对话框三要素说明齐备;仅在显式确认后才进入执行(无自动/静默迁移路径)

### Step 3: 原子迁移执行与对拍结果

**User Action**: 观察迁移进度浮层直至完成

**Expected Result**: 进度按 校验/迁移/对拍/完成 呈现;完成后展示对拍结果 = 任务全集(ID/状态/依赖/标题)与迁移前零差异;备份位置在结果中可见,备份工件于所示位置在场、内容 = 迁移前库文件 + 文档树 `tasks/` 拷贝(harness 级断言);原子性观察通道 = 终态二值呈现(见 3b 分支)

### Step 4: 迁移后终态确认

**User Action**: 察看迁移结果终态呈现与任务看板,并经测试通道检查项目文档树(harness 级)

**Expected Result**: 完成态呈现「对拍结果 + index.json 已淘汰」文案(UF3 done 态);任务看板承载全部任务(与迁移前任务全集一致);概览页「可迁移」入口消失;文档树断言(harness 级):`tasks/index.json` 不存在(归档为 `index.json.migrated-<ts>`),`tasks/*.md` 与 `tasks/records/*.md` 原样留存原位置(不迁移不改动)

## Edge Cases

### Step 2b: 取消确认

<!-- source: inferred: UF3 Validation Rules「迁移必须显式确认,无自动/静默迁移路径」推演——取消即未确认,零执行、回 migratable 态(UF3 未显式定义取消路径) -->

**Precondition**: 迁移确认对话框呈现中

**User Action**: 点击取消

**Expected Result**: 不执行任何迁移;项目状态与文件零变化;迁移入口仍在,可再次发起

### Step 2c: 发起迁移时数据内核不可用

<!-- surface-web required_outcomes 映射:session-expired → 离线桌面壳无登录会话语义(N/A);类比承载 = 数据内核通道不可用 → failed-rolled-back 呈现 + 恢复重试引导,非静默 -->
<!-- source: inferred: UF3 States failed-rolled-back(失败呈现回滚状态与重试入口)推广至「内核不可用」成因;PRD 未逐项枚举失败成因 -->

**Precondition**: 发起迁移时数据内核不可用(库文件打开失败/损坏,经测试通道注入)

**User Action**: 确认迁移,观察迁移反馈

**Expected Result**: 零摄入/淘汰即失败,呈现失败回滚状态 + 「重试」入口,错误可辨非静默;内核恢复后重试可成功(对拍零差异)

### Step 3b: 迁移中断(应用被杀/崩溃)后的终态与重试

<!-- source: prd-spec SC2(迁移中断可重试且不产生半迁移态);Story 1 AC2(从备份恢复且无半迁移态,重试可成功);UF3 failed-rolled-back 态 -->

**Precondition**: 迁移执行中应用被杀/崩溃(仅此成因——外部写入冲突所致失败归 Step 3c,二者成因互斥);中断时点相对迁移提交未知(提交前/提交后均可能)

**User Action**: 重启应用,查看概览页终态呈现;若处回滚态则再次发起迁移

**Expected Result**: 按中断时点呈现二值终态之一,无第三态——
- 提交前中断:呈现已回滚状态 + 「重试」入口;`tasks/index.json` 完整在位,任务全集与 Setup 基线一致(恢复锚点 = Step 3 备份,harness 级断言其在场);重试可成功且对拍零差异
- 提交后中断:等价迁移成功终态——概览页无迁移入口,看板承载全部任务,事件与对拍结果经日志可回查(见 4c);不出现回滚/重试呈现

### Step 3c: 迁移时外部写入冲突

<!-- source: proposal 错误路径(迁移冲突:迁移时外部写入)检测与重试 -->

**Precondition**: 迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据;注入机制(harness 级,确定性命中,不依赖竞态时序):于摄入完成后、提交前经测试通道对 `tasks/index.json` 注入一次外部写

**User Action**: 查看迁移结果

**Expected Result**: 冲突被检测;迁移失败并回滚至干净态(不产生两源混合数据);失败呈现含冲突原因可辨;提示后可重试成功

### Step 3d: 校验阶段检出 index.json 损坏/不可读

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为迁移校验阶段源数据校验失败(index.json 损坏/不可读)的阻止 + 错误呈现 + 修正后可重试 -->
<!-- source: inferred: UF3 进度首阶段 = 校验 + prd-spec 迁移线「原子迁移」,推演源数据非法阻止于摄入/淘汰之前(PRD 未显式定义源损坏分支) -->

**Precondition**: 项目文档树内 `tasks/index.json` 损坏或不可读(JSON 解析失败/结构缺失,经测试通道注入),检出发生于校验阶段

**User Action**: 确认迁移,查看迁移反馈

**Expected Result**: 迁移终止于校验阶段;零摄入/淘汰,`tasks/index.json` 原样在位;错误明确且原因可辨;修复源文件后可从入口重试成功(对拍零差异)

### Step 4b: 注册向导内的同一迁移确认

<!-- source: Story 1 AC4(向导内同一迁移确认步骤,含备份说明);UF3 Placement(向导步骤②后插入,仅检出 index.json 时) -->

**Precondition**: 注册一个检出 `index.json` 的既有 forge 项目

**User Action**: 走注册向导,在文档位置步骤后遇到迁移确认步骤并确认

**Expected Result**: 向导内呈现同一迁移确认步骤(含备份说明);确认后完成迁移与注册;结果与概览页路径一致(对拍零差异/index.json 淘汰/md 留存)

### Step 4c: 迁移事件可回查

<!-- source: UF3 Validation Rules(结果不可当场关闭而无痕,可回查日志);prd-spec Monitoring(迁移事件:备份/对拍结果留本地日志可查) -->

**Precondition**: 迁移已完成(或已失败回滚)

**User Action**: 察看迁移结果呈现的结论要素,并经测试通道回查应用本地日志(harness 级)

**Expected Result**: 浏览器面:迁移结果呈现含备份位置与对拍结论,不因当场关闭而无痕;harness 级:本地日志含迁移事件(备份位置/对拍结果/失败原因)逐项可查

## Journey Invariants

- 迁移恒为显式触发(确认 + 迁移前自动备份);不存在自动/静默迁移路径
- 原子性:任何时刻项目处于「迁移前完整」或「迁移后完整」其一,永不出现半迁移态
- 任务/记录 md 永不迁移不改动;结构化状态迁移后以 SQLite 为唯一权威,`tasks/index.json` 终态淘汰
- 完成态必呈对拍结论;迁移事件全程留日志(备份/对拍结果)
- 自动备份恒先于摄入/淘汰;备份工件于完成态与失败回滚态均在结果所示位置在场(断言见 Step 3/3b),为不可逆淘汰的唯一恢复锚点;备份保留/清理策略 PRD 未定界,不作断言
