---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "expedition-full-sdd-chain"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: expedition-full-sdd-chain

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在远征会话走完整 SDD 链：brainstorm 结构化探索 → 提案评审 accepted → registerFeature 单步成链 → write-prd / ui-design / tech-design 产出文档 → breakdown-tasks 建任务 → run-tasks 派发执行 → submit 全绿——规格资产全程经 tool 读写住进 forge.db 与 feature_documents，后续里程碑可回放、可消费。（PRD Story 3；关键场景 2；业务流程三；SC5；本特性 Golden Path——复杂特性[提案/feature/文档/任务/记录多实体父子关系]，跨实体交互 8 步）

## Setup

- 远征会话已确立（registry 默认或显式选择；规格技能全集可见）
- 一个新方向待规格化；每工作区库与 feature_documents 就绪
- 工作区代码仓处于可提交状态（git 可用）

## Happy Path

### Step 1: brainstorm 结构化探索产出提案

**User Action**: 单人开发者在远征会话经 brainstorm 技能结构化探索新方向

**Expected Result**: 产出 proposal.md（经 tool 读写入提案域）；提案发现扫描建行（五态 draft 起步；mode 溯源 = expedition 创建时写入）

### Step 2: 提案评审流转至 accepted

**User Action**: 单人开发者在概览提案子 tab 评审该提案（draft → under-review → accepted，人工裁决按钮）

**Expected Result**: 提案状态落库 accepted；双面流转同门（agent 经 transitionProposal 写库与人工面一致）

### Step 3: registerFeature 单步成链

**User Action**: 远征提案 accepted 触发成链（无需人工另起步骤）

**Expected Result**: **单步成链**：feature 行 + proposal_id 谱系 + feature_records 审计行**原子写入**（远征提案专属——成链门 = accepted ∧ mode=expedition）

### Step 4: write-prd 产出需求文档

**User Action**: 单人开发者在远征会话经 write-prd 技能产出 PRD（用户故事 + 规格）

**Expected Result**: 文档经 upsertFeatureDoc 入 feature_documents；feature 子 tab 分层文档区可见真实路径（prd/ 分组）

### Step 5: ui-design / tech-design 产出设计与 UI 文档

**User Action**: 依次经 ui-design、tech-design 技能产出 UI 设计与技术设计文档

**Expected Result**: 同门 upsertFeatureDoc 入 feature_documents（ui/、design/ 分层文档真实路径清单）

### Step 6: breakdown-tasks 建任务

**User Action**: 经 breakdown-tasks 技能从技术设计拆解任务

**Expected Result**: 任务清单经 addTask 入任务域（挂 feature = 提案链；远征语义 stage-gate / eval 门在场；依赖关系构成 DAG）

### Step 7: run-tasks 派发执行

**User Action**: 发起 run-tasks（会话内或任务子 tab「派发」入口）

**Expected Result**: worker 按 DAG 依赖顺序领取执行；AC gate → commit → submitTask 全绿（提交哈希入执行记录）

### Step 8: 概览四域全景核查

**User Action**: 单人开发者打开概览核查提案 / 文档 / 任务 / 记录四域

**Expected Result**: 四域全景一致（e2e 一条链断言）：提案 accepted、feature 行与谱系在场、分层文档真实路径、任务终态与执行记录、审计行伴随

## Edge Cases

### Step 1b: 规格技能目录核查

**Precondition**: 远征会话查看技能目录

**User Action**: 枚举远征会话技能目录

**Expected Result**: 规格技能全集可见可用（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / brainstorm）；**core 包技能目录无 git-commit / git-checkout 条目**（移除/未迁断言）

### Step 2b: 打回修订循环

**Precondition**: 提案处于 under-review，评审发现需修订

**User Action**: 人工裁决打回（under-review → draft）

**Expected Result**: 提案回到 draft；修订后再走接受——评审工作流完整可用（不破坏既有扫描行）

### Step 2c: superseded 演进链

**Precondition**: 该提案已被后续版本取代

**User Action**: 将其流转至 superseded

**Expected Result**: accepted → superseded 演进链可用；取代链在提案行谱系元数据可见

### Step 3b: 成链原子性

**Precondition**: 成链写入过程中发生故障（或注入失败）

**User Action**: 检查库中 feature 行 / proposal_id 谱系 / feature_records 审计行

**Expected Result**: 三者**要么全部写入要么全不写**（单事务原子断言）——无半链状态（有 feature 行无谱系、或无审计行）

### Step 4b: 文档 upsert 幂等

**Precondition**: 同一文档经技能重复产出/修订（同名同路径）

**User Action**: 再次经 upsertFeatureDoc 写入该文档

**Expected Result**: 更新既有行而非重复建行（幂等）；feature_documents 无重复条目

### Step 6b: 任务依赖 DAG

**Precondition**: breakdown 产出带依赖关系的任务集

**User Action**: 查看任务 DAG 视图并发起派发

**Expected Result**: 依赖关系正确落库；派发按 DAG 顺序领取（前置未终态不可领取——无越序）

### Step 7b: worker 受阻恢复

**Precondition**: 某任务执行受阻（质量门未过或重大问题）

**User Action**: worker submit blocked（reason）或经 addTask 走 fix 链

**Expected Result**: 任务 blocked 落审计；fix 链自动恢复（block_source 单事务、恢复钩子——M2 机制回归）；恢复后派发继续

### Step 7c: 零手工搬文件

**Precondition**: 全链走完（或任一中间态）

**User Action**: 审计文档 / 任务 / 提案的入库通道

**Expected Result**: **全程经 tool 读写**：文档入 feature_documents（upsertFeatureDoc）、任务入任务域（addTask）、提案入提案域（createProposal / transitionProposal）——零手工搬文件（文件系统与库对账）

### Step 8b: 审计行伴随

**Precondition**: feature 域发生过多次写入（register / transition / doc-upsert）

**User Action**: 检查 feature_records 表

**Expected Result**: feature 域全部动词**每次写入伴随审计行**（表断言）；append-only（UPDATE / DELETE 直接 ABORT）

## Journey Invariants

- **全程经 tool 读写**（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → **registerFeature 单步成链原子性**（feature 行 + proposal_id 谱系 + feature_records 审计行——无半链状态）
- 归属模型恒定：**feature ⊂ 提案、任务 ⊂ 提案**（任务挂 feature = 提案链）；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records **append-only 双触发器**：feature 域每次写入伴随审计行（verb = 事件名、actor = plugin-tool/ui/core）
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费（概览四域全景一致）
