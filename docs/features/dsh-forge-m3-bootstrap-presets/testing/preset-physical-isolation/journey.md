---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "preset-physical-isolation"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
  - docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-ui-functions.md
  - docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
  - docs/proposals/dsh-forge-m3-bootstrap-presets/spikes/s6-skill-provisioning.md
  - docs/features/dsh-forge-m3-bootstrap-presets/tasks/records/3.9-spike-residuals-verification.md
generated: "2026-10-08"
---

# Journey: preset-physical-isolation

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者核查突击会话在物理上调不到规格技能（而非「被叮嘱不要」），且双预设镜像不随上游演进漂移——模式边界靠机制不靠提示词纪律，升级 dsh 不悄悄破坏双预设。（PRD Story 6；关键场景 8 降级支；SC2 预设层/契约面）

## 测试策略分工（web surface 50/50）

本旅程承担 web surface 50/50 测试策略的 **Contract 半**：断言对象 = 预设装配的配置/文件级契约面（技能目录装配、镜像行机械 diff、YAML 形态、schema 拒绝），每步以「观察通道」行显式标注断言落点（会话投影面 / web 面 / 契约面）。**Journey 半**（用户经 UI 的模式选择与自动对齐工作流）由 mode-selection-alignment 与 overview-entry-new-session 承担——旅程间分工，非单旅程内五五。同族分工：核心包技能目录无 git-commit / git-checkout 条目（移除/未迁断言——SC2）不在本旅程，由 expedition-full-sdd-chain（Story 3 AC2）承担。下游 gen-test-scripts 按「观察通道」行分派 Contract 用例与 Journey-smoke 用例。

## Setup

- 双预设已物化：预设声明行宿主 = `{userData}/boot-overlay.yml`（产品工件——每启由三底稿重写；用户层不含预设行，行所有权归产品，tech-design「行所有权分叉：boot overlay 注行 = 每启覆盖·产品工件」）
- 突击与远征会话均可创建；会话技能目录经会话系统提示投影可转录（spike S6 实证通道：模型原样抄出目录清单，不调用工具、不加载全文）
- 上游 diff 基线钉扎：一份与被测安装同版本的 dsh 上游 checkout 在场（dsh 0.x-rc `next` 线精确锁定——proposal NFR），其 standard.patch.yml 为机械 diff 基线；版本错位会使 diff 产出假阳性漂移、Step 2「一致」失去判定效力
- 故障注入规程（Step 2b/3b 用）：注入靶 = 预设底稿（`presets/{expedition,blitz}.patch.yml` 产品工件）——**唯一持久故障源**，以损坏底稿驱动物化与 profile 装配；用户层与物化产物（boot-overlay.yml）污染均不可达（每启由底稿重写自愈，非用户层状态——单测可另以渲染纯函数直测物化形状，非持久注入通道）。2b 形态 = 底稿 standard 镜像行缺失某必填 config（模拟上游演进新增、镜像未跟进的漂移现场）；3b 形态 = 底稿 customSkillDirs 误用 `!!js` 表达式。恢复 = 还原底稿（备份先行）［source: inferred——测试规程推理：预设行每启由底稿重写（tech-design），可持久的故障态只能落在物化源（底稿），产物每启忠实重现损坏——恰是「镜像不随上游演进漂移」的故障形态本体］

## Happy Path

### Step 1: 突击会话枚举技能目录

**Precondition**: 突击会话已创建（组合 = 突击预设）

**User Action**: 单人开发者创建突击会话并转录其技能目录（会话系统提示中的技能目录清单）

**Expected Result**: 目录**不含规格技能全集**——write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks 七者零在场（突击目录物理缺 spec 技能——spike S6-3 已实证同构物理边界：突击目录物理缺 spec 探针）；**阳性对照在场**：核心包技能行可见（run-tests / brainstorm / run-tasks / submit-task——双模式共用核心包，In Scope ① 清单为准；spike S6-3 为拆包前同构实证：突击目录含 run-tests）——枚举通道有效性由此证明，缺席断言不空洞通过

**观察通道**: 会话投影面（技能目录转录——spike S6 通道；承载 50/50 的 Contract 半）

### Step 2: 机械 diff 双预设 standard 基础行

**Precondition**: 上游基线已钉扎（同版本 checkout 在场）；双预设已物化

**User Action**: 将两预设的 standard 基础行与上游 standard.patch.yml 机械 diff

**Expected Result**: **一致**（镜像行契约）；镜像行含**必填 config 全集**（如 tool-fs-search 的 sampleOverCapResults）

**观察通道**: 契约面（文件级 diff：物化产物 vs 上游基线——显式记为 Contract 面步骤，非浏览器交互步）

### Step 3: 检查预设行装配的 customSkillDirs

**Precondition**: 双预设行已物化（Setup 第一条）

**User Action**: 检查预设行的 customSkillDirs 装配形态

**Expected Result**: 一律**物化绝对路径**（`!!js` 表达式形态零在场——spike 裁决全形态死刑）

**观察通道**: 契约面（YAML 内省——显式记为 Contract 面步骤）

## Edge Cases

### Step 1b: 远征会话枚举对照

**Precondition**: 远征会话已创建（默认或显式）

**User Action**: 转录远征会话技能目录并尝试 brainstorm

**Expected Result**: **规格技能全集七者可见且 brainstorm 可用**（对照面——物理隔离只作用于突击组合；跨会话阳性对照）

**观察通道**: 会话投影面（同 Step 1）

### Step 2b: 镜像行缺必填 config

**Precondition**: 预设底稿的 standard 镜像行处于缺失某必填 config 的不完整态（Setup 故障注入规程造成）

**User Action**: 以该底稿物化装配并启动应用，查看 hero 预设菜单

**Expected Result**: **整预设 broken 不上菜单**（缺 config → 装配校验拒绝——spike 教训：schema 拒绝；契约面清单含 config 全集义务兜底）；拒绝形态显式可见，无静默降级［source: inferred——源证「broken 不上菜单」；「不静默降级」= broken 缺席即显式失败形态的否定式注记，非源文档明文］

**观察通道**: web 面（hero 预设菜单缺席该预设——SC1 菜单枚举面）+ 契约面（schema 拒绝原因）

### Step 3b: `!!js` 表达式形态

**Precondition**: 预设底稿 customSkillDirs 处于误用 `!!js` 表达式的形态（非物化路径——Setup 故障注入规程造成）

**User Action**: 以该底稿物化装配并启动

**Expected Result**: 该预设 **broken 确认**（packaged-js 负对照——3.9 补验实证：`!!js` 行 broken）；不上菜单、不静默降级

**观察通道**: web 面（预设菜单缺席该预设）+ 契约面（装配失败形态）

## Derived Outcomes 裁决（web surface 规则）

依 gen-journeys surface-web 规则 Required Outcome Reference（每条 Web Journey 必须考虑以下派生 Outcome），逐项裁决：

- **validation-error**: **适配在场（配置面形态）**。本旅程无用户表单交互面（核查型观测工作流），web 表单形态（字段近场报错、表单不提交、可更正重试）N/A；其本地化派生 = Step 2b/3b——无效配置数据（镜像行缺必填 config / `!!js` 形态）→ 装配校验**拒绝**（整预设 broken 不上菜单），满足「invalid data → 拒绝且不静默」的语义骨架［source: inferred——surface-web validation-error 规则本地化映射至配置装配域；承载步 = Step 2b/3b］
- **session-expired**: **N/A（已考虑）**。产品为本地单人工作台，无登录态与服务端会话凭据；「会话」= dsh 对话会话（账本在 dsh 本体），本旅程核查对象（技能目录 / 镜像行 / 装配形态）均为本地静态产物，无会话过期路径。最邻近的连续性边界 = 应用重启后预设组合投影重建与技能边界保持——由 mode-selection-alignment Step 3c 承担（旅程分工声明），本旅程不变量三在重启后持续成立即其旁证

## Journey Invariants

- **模式边界靠机制不靠提示词纪律**：物理调不到（目录物理缺），而非「被叮嘱不要」
- 物理边界 = **枚举面即证**：**突击侧**边界证明无需运行期探测（远征侧对照 Step 1b 含 brainstorm 行使，属对照面而非边界证明通道）
- 双预设镜像**不随上游演进漂移**：契约面清单 + 机械 diff 跟踪（含行 config 全集义务；diff 基线版本钉扎）
- `!!js` 表达式形态全形态死刑；customSkillDirs 恒物化绝对路径
