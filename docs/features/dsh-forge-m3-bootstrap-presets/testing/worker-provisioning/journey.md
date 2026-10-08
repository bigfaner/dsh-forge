---
feature: "dsh-forge-m3-bootstrap-presets"
journey: "worker-provisioning"
risk_level: "High"
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

# Journey: worker-provisioning

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

单人开发者配置 Forge设置 的 worker 默认 LLM 档位后，派发出的 worker 按任务类型带最小工具面、继承组合技能目录、统一用默认 LLM——worker 既能干活又不越权（不问用户、不派生子代），模型档位不随父会话漂移；重大问题经 addTask 逃生通道二分处置。（PRD Story 5；业务流程四；SC2 worker 层）

## 测试策略分工（web surface 50/50）

本旅程在 web surface 50/50 策略中双半承载：**Journey 半** = 设置对话框配置流（Step 1/1b/1c/1d）、任务子 tab「派发」入口与任务详情时间线（Step 2 入口、Step 5 结算上屏）；**Contract 半** = worker 内部状态断言（Step 2/2b 会话 model、Step 3 工具面收窄、Step 3b deny、Step 4/4b 技能目录、Step 5b 链深）——后者非浏览器可观察，显式记为契约面步骤由契约测试承载。每步「观察通道」行显式标注断言落点。

## Setup

- Forge设置 分区 worker 小节可配置（Provider / Model / Reasoning 三项——UF-2 第 1 条）
- 任务库含多类型任务（coding 族 / doc 族 / gate / 验证类——收窄矩阵各类型代表）
- 派发入口两途可用：任务子 tab 工具栏「派发」按钮 / 会话内直接发起 run-tasks（流程四第 1 条——两途汇入同一 dispatcher 循环）
- 一个模型档与 Forge设置 配置不同的父会话在场（Step 2b 优先级冲突夹具）
- 可控触发夹具（自主 agent 行为无可控触发面，以任务规格内容确定性诱导）［source: inferred——测试诱导设计（fixture 构造语义，非产品行为声明）：(a) 注定受阻任务 = 带 AC 清单且执行路径必缺测试证据的任务（worker submit 被 AC gate 拒——Story 7 AC1 通道，诱导「重大问题」走 addTask 逃生）；(b) 越权诱导任务 = 规格内含「询问用户确认后继续」类指令的任务（诱导 worker 尝试 ask-user——Step 3b）］
- 远征默认会话与突击会话均可创建（Step 4/4b 技能继承对照）

## Happy Path

### Step 1: 配置 Forge设置 worker 默认 LLM

**Precondition**: 设置对话框可达；worker 小节三项未配置或可重配置

**User Action**: 单人开发者在设置对话框 Forge设置 分区 worker 小节配置默认 LLM 三项（Provider / Model 联动 / Reasoning 低|中|高）并保存

**Expected Result**: 保存成功 → 持久化（用户数据域 forge-settings.json——core forgeSettings 单门读写）、**下次派发生效**

**观察通道**: web 面（设置对话框保存反馈）

### Step 2: 派发任一 worker

**Precondition**: Forge设置 worker 档位已配置（Step 1）；任务库有可派发任务

**User Action**: 经任务子 tab 工具栏「派发」按钮（或会话内直接发起 run-tasks）派发一个 worker

**Expected Result**: spawn 携带 **agentOptions**：provider / model / effort 随配置面三项，output-token 沿机制通道默认（配置面仅三项——用户裁决去 Output 上限；机制通道能力保留四字段——流程四第 3 条）；agentOptions 显式携带、**优先于父会话继承**；worker 会话 model 与配置一致

**观察通道**: web 面（派发入口与派发会话）+ 契约面（spawn 参数与会话 model 元数据——非浏览器可观察，Contract 半承载）

### Step 3: 按任务类型族派发（收窄矩阵）

**Precondition**: 任务库含收窄矩阵各类型族代表任务（Setup）

**User Action**: 依次派发 coding 族 / doc 族 / gate / 验证类任务

**Expected Result**: worker tool 面仅含矩阵 ✓ 列工具；**全局拒绝集**（ask-user / delegation / todo / present）对所有 worker 生效；worker 携带 **submitTask + addTask**（claimTask / queryTask 不入）

**观察通道**: 契约面（工具面断言由两包 tool 面 pin 契约测试承载——G0–G2 门「契约面 pin 扩池：两包 tool 面」；Contract 半承载）

### Step 4: 远征默认会话派发 worker（技能继承）

**Precondition**: 远征默认会话在场（registry 默认即可）

**User Action**: 从远征默认会话派发 worker 并转录其技能目录（会话系统提示技能目录投影——spike S6 实证通道）

**Expected Result**: 目录 = **组合继承目录**（与父一致——spike S6-5 实证：子会话工具面/目录继承达 worker）；测试任务实际加载 run-tests、非测试任务不加载（按需加载）；远征 worker 含 spec 技能行（内容不加载）、突击 worker 不含（预设级 L1 不破）

**观察通道**: 会话投影面（技能目录转录）+ 契约面（按需加载断言——SC2 断言通道已落地，3.9 W 用例）

### Step 5: worker 遇重大问题经 addTask 追加任务

**Precondition**: 注定受阻的任务 fixture 已派发（Setup 夹具 (a)——worker 执行中将遇无法解决的重大问题）

**User Action**: worker 执行中遇重大问题（fixture 诱导），经 addTask 追加任务并结算自身

**Expected Result**: 前缀按语义二分：**disc-N**（独立问题，不阻塞源）/ **fix-N**（走 fix 链协议——block_source 单事务、链深 ≤6、恢复钩子，M2 机制回归）；自身任务以 blocked 收尾并引用新任务

**观察通道**: web 面（任务子 tab 详情时间线：源任务 blocked 行 + 新任务行上屏——M2 写入返回后单次重取即见口径）+ 契约面（fix 链协议断言）

## Edge Cases

### Step 1b: 未配置态

**Precondition**: worker 小节三项未填齐

**User Action**: 查看 Forge设置 分区并尝试保存

**Expected Result**: ⚠ 占位说明「worker 派发将回退父会话继承」（**显式不静默**）+ 保存禁用；填齐激活（脏态实时）——此即 validation-error 的 web 表单原生形态（必填缺失 → 拒绝提交 + 近场占位说明，见 Derived Outcomes 裁决）

**观察通道**: web 面（设置对话框占位与按钮态）

### Step 1c: 保存失败

**Precondition**: 持久化写入失败（如用户数据域不可写）

**User Action**: 点保存

**Expected Result**: **错误行留场可重试**（不静默丢弃；已填值不丢失）［source: inferred——UF-2 第 3 条原文为「错误行留场可重试」；「已填值不丢失」= 表单控件态独立于持久化结果的合理扩展，源未明文］

**观察通道**: web 面（错误行 + 表单值保持）

### Step 1d: 配置时效边界（在途 worker 不受改档影响）

**Precondition**: 一个 worker 已在途（派发时档位 = 旧档）；用户随后改档并保存成功

**User Action**: 查看在途 worker 会话 model，再派发一个新 worker 查看其 model

**Expected Result**: 在途 worker 会话 model 保持旧档（agentOptions 在 spawn 时点合成，已 spawn 会话不回改）；新 worker model = 新档［source: inferred——「下次派发生效」语义边界（UF-2 第 3 条）：生效时点 = 派发，spawn 后不回溯］

**观察通道**: 契约面（两会话 model 元数据对比）

### Step 2b: agentOptions 优先级

**Precondition**: 父会话模型与配置档不同（Setup 冲突夹具在场）

**User Action**: 从该父会话派发 worker 并核对其会话 model

**Expected Result**: worker model = 配置档（**显式指定优先于父会话继承**——不随父漂移）

**观察通道**: 契约面（会话 model 元数据）

### Step 3b: 被拒工具调用

**Precondition**: worker 执行含越权指令的任务 fixture（Setup 夹具 (b)——诱导请求全局拒绝集内工具如 ask-user）

**User Action**: worker 尝试调用被拒工具

**Expected Result**: **物理不在面**——调用不可达（deny 生效，非运行期劝阻）；worker 不问用户、不派生子代

**观察通道**: 契约面（deny 断言——Contract 半承载）

### Step 4b: 突击 worker 请求 spec 技能

**Precondition**: 从突击会话派发的 worker

**User Action**: 转录其技能目录并尝试请求 spec 技能

**Expected Result**: **物理不可见**（预设级 L1 不破——技能枚举面）；远征 worker 含 spec 技能行但内容不加载（token 纪律——Step 4 对照）

**观察通道**: 会话投影面（技能目录转录）

### Step 5b: fix-N 链深边界

**Precondition**: fix 链已接近最大深度（链上 fix 任务数近 6）

**User Action**: worker 再经 addTask 追加 fix-N 任务

**Expected Result**: **链深 ≤6 纪律**（M2 机制回归）；超限不放行（无无限 fix 链）［source: inferred——源证「链深 ≤6」不变量；「超限不放行」= 不变量在边界的行为推论，源未明文定义超限态系统响应］

**观察通道**: 契约面（链深断言）+ web 面（任务列表无第 7 层 fix 行）

### Step 5c: 前缀语义二分边界

**Precondition**: 两个受阻场景各一在场——独立问题型与阻塞问题型（Setup 夹具 (a) 双份，均可确定性诱导 worker 走 addTask）

**User Action**: 分别经 addTask 以独立问题（disc-N）与阻塞问题（fix-N）追加

**Expected Result**: **两前缀行为分化**：disc-N 不阻塞源任务（源可继续）/ fix-N block_source 单事务（源即时 blocked 并引用）

**观察通道**: web 面（两源任务状态分化上屏）+ 契约面（block_source 事务断言）

## Derived Outcomes 裁决（web surface 规则）

依 gen-journeys surface-web 规则 Required Outcome Reference（每条 Web Journey 必须考虑以下派生 Outcome），逐项裁决：

- **validation-error**: **适配在场（web 表单原生形态）**。承载步 = Step 1b：worker 小节三项未填齐（必填字段缺失形态）→ 保存禁用 + ⚠ 占位说明（表单不提交 + 近场提示——UF-2 第 2 条），填齐后可保存（可更正重试）［source: inferred——surface-web validation-error 规则本地化映射；承载步 = Step 1b/1c（1c 为持久化失败留场重试的姊妹形态）］
- **session-expired**: **适配在场（本地化 = 配置时效/档位连续性）**。产品为本地单人工作台，无登录态与服务端会话凭据，登录过期形态 N/A；规则语义的本地化派生 = Step 1d（改档后在途 worker 保持旧档、新 worker 用新档——pending 状态按 spawn 时点快照，不静默回改；配置持久化落盘 forge-settings.json 由 Step 1 承载）［source: inferred——surface-web session-expired 规则本地化映射；承载步 = Step 1d］

## Journey Invariants

- worker **永不问用户、不派生子代**（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（**已配置时**——agentOptions 显式携带、优先于父会话继承；未配置回退父会话继承，见 Step 1b）
- worker 技能目录 = **组合继承目录**（catalog 行级常驻、内容按需加载——token 纪律）
- **零新装载机制**：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
