---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "blitz-direct-chain"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
generated: "2026-10-08"
---

# Journey: blitz-direct-chain

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者在突击会话里一句话发起 quick-tasks，直接得到提案 + 可派发的任务清单；提案 accepted 后直接进入任务阶段（无 feature 行/文档域），run-tasks 派发一路跑到提交全绿，概览三视图即时刷新——小需求不开全套 SDD 仪式也能走完整 gate 纪律。（PRD Story 2；关键场景 1；业务流程二；SC4）

## Setup

- 突击会话已确立（hero 选突击或经 blitz 提案绑定入口自动对齐）
- 一个明确的小需求（一句话可表达）
- 工作区代码仓处于可提交状态（git 可用）；概览 dock tab 可达

## Happy Path

### Step 1: 突击会话发起 quick-tasks

**User Action**: 单人开发者在突击会话中以一句话发起 quick-tasks（表达小需求）

**Expected Result**: 产出**提案**（五态 draft 起步，经 createProposal 落库）+ **任务清单**（addTask；整数 ID / 无 stage-gate / eval 豁免）——mode 溯源 = blitz 由创建技能写入（断言）

### Step 2: 提案评审 accepted → 直接进入任务阶段

**User Action**: 单人开发者在概览提案子 tab 将该突击提案流转至 accepted

**Expected Result**: **直接进入任务阶段**——任务直挂提案、即可 run-tasks 派发；**无 feature 行/文档域**（断言——突击只有提案与任务，用户裁决 2026-10-07）

### Step 3: run-tasks 派发

**User Action**: 在会话内（或经任务子 tab「派发」入口）发起 run-tasks

**Expected Result**: dispatcher 领取就绪任务并派发 worker——toolFilter 按任务类型收窄 + agentOptions 携带 Forge设置 默认 LLM（worker 供给详见 worker-provisioning 旅程）

### Step 4: worker submit 全绿

**User Action**: worker 依次执行任务并 submitTask 结算（无需人工介入）

**Expected Result**: 各任务落账；**概览三视图在写入返回后单次重取即见新值**（M2 即时口径回归）；执行记录与提交哈希入自身库

### Step 5: 全程核查技能清单

**User Action**: 单人开发者（或断言通道）枚举突击会话全程的技能清单

**Expected Result**: 全程突击会话技能清单**不含任何规格技能**（技能枚举断言——物理边界）

## Edge Cases

### Step 1b: mode 溯源写入时机

**Precondition**: quick-tasks 产出提案的瞬间（createProposal 落库时）

**User Action**: 检查库中该提案行的 mode 溯源字段

**Expected Result**: 溯源字段 = blitz 且写入时机 = 创建时（非事后补写）；后续会话预设变更不影响该值

### Step 2b: 评审打回修订

**Precondition**: 提案处于 under-review，评审发现需修订

**User Action**: 人工裁决打回（under-review → draft）

**Expected Result**: 提案回到 draft；任务阶段未进入（打回期间不派发）；修订后重新走接受

### Step 2c: 突击 accepted 误建 feature 行

**Precondition**: 突击提案被接受（accepted）

**User Action**: 检查 feature 子 tab 与文档域

**Expected Result**: **无 feature 行 / 无文档域**（断言）——突击无 feature 阶段，任务直挂提案；feature 子 tab 不出现该提案的 feature

### Step 3b: worker 受阻

**Precondition**: 某任务执行受阻（无法完成）

**User Action**: worker submitTask result=blocked（reason 必带）或经 addTask 追加逃生任务

**Expected Result**: 任务 in_progress→blocked（reason 落审计）；逃生通道前缀按语义二分（disc-N 独立问题 / fix-N 走 fix 链协议——block_source 单事务、链深 ≤6、恢复钩子，M2 机制回归）

### Step 4b: 带 AC 任务缺测试证据

**Precondition**: 某任务带 AC 清单，worker submitTask 时缺测试证据

**User Action**: worker 调 submitTask 提交（无测试证据）

**Expected Result**: **拒绝且错误信息含 AC 清单**（功能断言）——gate 纪律不折扣；补齐证据后方可过门

### Step 4c: 概览并发浏览

**Precondition**: 概览页签处于打开状态且用户正在浏览（读路径活跃）

**User Action**: 派发链写入动词（claim / submit）发生的同时用户持续浏览概览三视图

**Expected Result**: tool 写入与 UI 读取无锁竞争；列表在写入返回后**单次重取即见新值**（即时判据成立，无 watch / 无同步延迟）

### Step 5b: 突击会话请求规格技能

**Precondition**: 突击会话运行期请求任一规格技能（如 write-prd）

**User Action**: 尝试在突击会话中调用规格技能

**Expected Result**: **物理不可见**（技能枚举断言即证——目录物理缺 spec 探针，spike S6-3 同构实证）；非提示词劝阻

## Journey Invariants

- 突击链 **gate 纪律不折扣**：单写路径 / 执行记录 / 提交规范 / 验证门原样（不开全套 SDD 仪式 ≠ 免检）
- 任务语义由 **mode 溯源（blitz）** 决定：整数 ID / 无 stage-gate / eval 门豁免——不随执行会话预设漂移
- **突击无 feature 阶段**：提案与任务之外无中间层（无 feature 行 / 无文档域）
- 概览三视图**即时口径**：写入返回后单次重取即见新值（数据直读每工作区库，无 watch / 回流 / 快照同步）
