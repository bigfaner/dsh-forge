---
feature: "dsh-forge-p1-mvp"
journey: "knowledge-recall-flywheel"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-p1-mvp/prd/prd-user-stories.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-spec.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-ui-functions.md
  - docs/proposals/dsh-forge-p1-mvp/proposal.md
generated: "2026-10-03"
---

# Journey: knowledge-recall-flywheel

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

知识飞轮第一圈端到端（Golden Path）：注册项目 → 发起真实 dsh 会话（系统提示词含最简知识段）→ 提出项目问题 → agent 依指引自主完成 agentic search 多步检索链（search → read-abstract）→ 回答基于命中知识呈现 → 使用事件落状态层、会话知识召回 tab 出现条目 → 知识卡片热度 +1——「哪些知识在哪些会话被用了」可见，飞轮第一圈转起来。

**PRD 溯源**: Story 4（全部 3 条 AC：系统提示词知识段 / agentic search 多步链 / 使用事件与召回 tab 与热度一致）+ Story 1 happy path（注册段）+ Story 2 第 1 条 AC（真实往返段）+ Story 3 第 3 条 AC（热度一致段）；流程三与召回飞轮流 Mermaid（prd-spec）；UF-4（知识召回 tab）、UF-6（卡片热度）；提案 Key Scenario「召回飞轮（核心）」「MVP 门走查」、SC10（召回核心子集）、SC-MVP 前半（6 步链不间断演示）。

## Setup

- 目标项目工作区目录就位，知识库目录（`<工作区>/.knowledge`）含分域知识文件（frontmatter 合规）：前端域 K1（标题 / 关键词含「部署」，正文常规长度）、前端域 K2（标题 / 关键词含「构建」，正文数量级超长——必超 token 预算极简值；阈值设计期定，UNKNOWN）、后端域条目若干（供 4b 对照）；K1 / K2 关键词零交集，命中确定
- fixture 问题（source: inferred——PRD 未定义问题文本，措辞以域词 + 知识标题关键词最大化 agent 自主选域与命中的确定性）：Q1 =「本项目的前端部署规范是什么？」（命中 K1）；Q2 =「本项目的前端构建规范是什么？」（命中 K2，供 4e / 8b）
- 使用事件基线 = 0（目标项目全新注册，Step 1 从零项目走全链，无预置事件）——热度断言基线，无需前置观察步
- dsh 会话运行时可用（模型 API 凭证归 dsh profile 域，产品不经手）；应用处于零项目状态
- 稳定性策略（source: inferred——PRD 未定义 e2e 稳定性口径，依提案 e2e 分层与降级预案）：真实模型往返非确定——观察窗 = 提问后 120s 内回答完成且轨迹出现检索链；窗内无链 → 同一 fixture 问题重发 ≤2 次；仍无 → 降级能力面 contract 通道验证同等断言并记 flake
- 场景隔离：Step 2b / 2c 以「知识目录未配置」/「已配置但为空」的专属工作区独立启动；Step 4d 以全字段不含「部署」「构建」的无关库工作区独立启动（token 规避，同兄弟 Journey 手法）——均不与基线（Q1 / Q2 可命中）叠加

## Happy Path

### Step 1: 注册项目（含知识库目录）

**User Action**: hero 空态 → 添加项目两段式流程，选定工作区目录（知识库目录取默认 `<工作区>/.knowledge`），注册表单点「确认」

**Expected Result**: 注册成功，左栏出现项目与 dsh 会话列表；「知识目录解析入应用侧索引（可重建缓存）」非浏览器可观察，其可观察代理 = Step 8 知识库网格呈现 K1 / K2 卡片——source: inferred（代理断言通道，PRD 未定义索引态的 UI 暴露）

### Step 2: 发起真实 dsh 会话

**User Action**: 点「新会话」按钮建立会话

**Expected Result**: 会话建立，其系统提示词含最简知识段——知识库存在声明、召回流程指引（遇项目问题先 search 相应域、摘要先行、按需 read-abstract）与工具说明（Story 4 AC1）；系统提示词内容非浏览器可观察，本断言经能力面 / 插件契约通道承载——source: inferred（观察通道 PRD 未定义）

### Step 3: 提出前端域项目问题

**User Action**: 在对话 tab 以自然语言发送 fixture 问题 Q1「本项目的前端部署规范是什么？」

**Expected Result**: 消息上屏、agent 开始处理；agent 依知识段指引决定检索路径——用户无需指定域或工具，agent 依问题自主选域（Q1 域词落在前端域，fixture 保证）

### Step 4: agent 自主完成多步检索链（agentic search）

**User Action**: 将问题交由 agent 处理（agent 自主编排检索）

**Expected Result**: agent 自主完成 `search`（选前端域前缀 + 关键词细分）→ 命中 K1 → `read-abstract` 读摘要的多步检索链；链时序的直接 UI 证据由 Step 6 行使

### Step 5: 回答基于命中知识呈现

**User Action**: 等待 agent 完成回答

**Expected Result**: 回答呈现于对话 tab 且内容基于命中知识；会话继续可用（可继续追问）

### Step 6: 切「轨迹」tab 验证检索链时序

**User Action**: 点会话面板顶部「轨迹」页签

**Expected Result**: 台账按时间序呈现本轮工具调用，含 `search` 与 `read-abstract` 两条且 search 先于 read-abstract（检索链发生及其顺序的唯一直接 UI 证据）；切回对话 tab 不重置——回答仍在原位

### Step 7: 查看会话知识召回 tab

**User Action**: 切到会话「知识召回」页签

**Expected Result**: 统计头实例化——召回次数 = 1、覆盖条数 = 1（事件基线 0 + 本链 1 次）；K1 分组行（动词明细 / 最近时间 / 热度徽章 = 1；动词取值 UNKNOWN，见 Invariants）呈现。「条目与状态层使用事件数据一致」为同源数据属性（UF-4 断言）：浏览器侧以本步实例化数字断言，事件表逐条核对归审计通道（状态层直读）——source: inferred（观察通道拆分，PRD 未定义）

### Step 8: 验证知识卡片热度闭环

**User Action**: 左栏进入「知识库」浏览视图，查看 K1 卡片

**Expected Result**: K1 热度徽章 = 1（基线 0 + 本链 +1——「召回前」由 Setup 事件基线声明）；与召回 tab 热度徽章同数字（同源数据两处呈现一致）

## Edge Cases

### Step 2b: 项目未配置知识目录的会话

**Precondition**: 项目知识目录未配置（依 Setup 场景隔离，专属工作区独立启动）

**User Action**: 建立新会话并发起对话

**Expected Result**: 会话正常可用（不报错）；系统提示词仍含知识段（fix-11 设计期裁决 B 侧：知识段 = 能力性指引随插件加载无条件注入——段文本自声明 "may be registered"、两 tool 同为无条件注册、精确门控在设计边界内不可实现；原文「不含知识段」为 Story 4 AC1 反向派生的 provisional 断言，随裁决撤销）；agent 依段内回落指引转常规检索原语（source: inferred + adjudicated）

### Step 2c: 知识目录已配置但为空的会话

**Precondition**: 知识目录已配置且为空（无任何知识文件；依 Setup 场景隔离独立启动，与 2b 未配置态可区分）

**User Action**: 建立新会话并发起对话

**Expected Result**: 会话正常可用（不报错）；系统提示词仍含知识段（原注入口径 UNKNOWN 已随 fix-11 裁决收口为 B 侧无条件注入——空目录与未配置两态的区分承载于检索行为与召回事件，非段有无）

### Step 3b: 空问题发送被拦截（validation-error）

**Precondition**: 对话 tab 输入框为空或仅空白字符（衔接 Step 3 输入面）

**User Action**: 直接点发送

**Expected Result**: 不发送——无消息上屏、无 agent 往返、无检索链与使用事件；空会话引导态保持，焦点仍在输入框（见 Derived Outcomes）

### Step 4b: search 域前缀过滤正确性

**Precondition**: 知识库同时存在前端域与后端域知识条目（基线 Setup 即满足）

**User Action**: 以「前端」域前缀发起 search 查询——产品 UI 无直调检索原语的入口，本步经能力面 contract 直测通道驱动（source: inferred——测试基建契约，PRD 未定义；提案降级预案同通道）

**Expected Result**: 前端域查询不返回后端域条目——域前缀过滤正确，命中集只含前端域知识（SC10 原文）

### Step 4c: 域前缀省略 = 全域检索

**Precondition**: 能力面 contract 通道可用（同 4b 通道；省略域前缀本身即 agent 自主决策的一种取值，非用户指定域）

**User Action**: 经同一 contract 通道发起不带域前缀的 search 查询

**Expected Result**: 检索跨全域进行，命中不受域限制（前端域与后端域条目均可命中）；域选择是 agent 自主决策而非用户指定

### Step 4d: search 无命中时转常规检索

**Precondition**: 知识库中不存在与问题相关的知识（依 Setup 场景隔离：无关库工作区，全字段不含「部署」「构建」——Q1 无命中确定）

**User Action**: 在对话 tab 发送 Q1（search 未获命中为该库态下的确定前置，非用户动作）

**Expected Result**: agent 转常规检索原语（grep / glob 等）继续处理，回答正常完成不阻塞、不出错；无知识使用事件落库（热度面排除哨兵行——fix-11 哨兵行口径裁决：零命中 search = 已发生的召回事件，至多记哨兵行入召回次数、不计覆盖与热度；召回 tab 若实走知识检索则呈零命中召回统计而非占位，占位语义 = 零召回事件，与 Step 7b 互证）

### Step 4e: read-abstract 摘要先行（正文不整段注入）

**Precondition**: 命中知识的正文较长（基线 K2 正文数量级超长，必超 token 预算极简值——阈值设计期定，UNKNOWN）；以 Q2 提问命中 K2

**User Action**: 在对话 tab 发送 Q2，agent 对命中知识执行 read-abstract

**Expected Result**: 默认返回摘要而非整段正文——token 预算受控，agent 按需决定是否继续读取（SC10 断言）

### Step 7b: 本会话暂无召回占位

**Precondition**: 会话尚未发生任何知识召回

**User Action**: 切到「知识召回」页签

**Expected Result**: 呈现「本会话暂无召回」占位（不报错、无空列表）

### Step 7c: 召回条目跳转知识详情

**Precondition**: 召回 tab 存在分组行条目

**User Action**: 点一条知识分组行

**Expected Result**: 跳转打开对应知识详情抽屉（UF-6）；若索引未命中该知识（已被外部删除），行级失效标注，不阻塞列表其它条目

### Step 8b: 事件即时累积（次数与覆盖分离）

**Precondition**: 同一会话中已发生过一次召回（衔接 Step 7 终态：tab 有 K1 条目，统计 1/1）

**User Action**: 发送 Q2 触发对 K2 的新一次召回，再查看召回 tab 与 K2 卡片热度

**Expected Result**: 召回 tab 即时累积——统计头召回次数 = 2、覆盖条数 = 2（与 Step 7 的 1/1 分离，聚合语义可区分于回显）；K2 分组行出现且热度徽章 = 1（基线 0 + 1）、K1 徽章保持 1；「与使用事件表一致」同源属性归审计通道（口径同 Step 7）

## Derived Outcomes（Web Surface 必察项）

- **validation-error** — 实步覆盖（Step 3b）：唯一输入面 = 会话消息输入框，空 / 纯空白提交不产生往返、检索链与使用事件——source: inferred（surface-web required_outcomes 必察项 × UF-4；PRD 未定义空消息行为，与兄弟 Journey session-workbench 同口径）
- **session-expired** — N/A：单机产品无登录会话 / 过期概念（PRD 单机安全边界，同兄弟 Journey 口径）；最近邻 = dsh 运行时不可用，属环境故障非过期（Setup 环境前置）——source: inferred（必察项 × PRD 安全边界映射）

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态
