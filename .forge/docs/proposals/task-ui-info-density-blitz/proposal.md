---
created: "2026-10-11"
author: "faner"
status: "Draft"
intent: "enhancement"
---

# Proposal: 任务 UI 信息密度与导航——会话名/跳转/命名规范/worker 按钮（task-ui-info-density-blitz）

> **定位**：任务相关 UI 十点走查优化批次一（信息密度面）；姊妹批次二（视觉文案面）见
> `task-ui-visual-copy-blitz`。本批 = 任务↔会话的导航链路与命名规范——五点：会话名称展示、
> 弹窗双形态跳会话、任务名称 {编号} {title}、派发面板标题、列表行 worker 会话按钮。
> **血统注记**：前版 `task-ui-info-density`（expedition 血统）因 plugin-forge mode 溯源
> 读会话出生头而非当前预设投影（根因 2026-10-11 查实）注册错档，本行 = blitz 重注册。

## Problem

任务↔会话导航与命名五个摩擦点（用户实机走查裁决 2026-10-11，代码级证据）：

1. **挂接会话显示会话 id 而非名称**：时间线会话 pill 标签 = `派发⟞ ${sessionId}` /
   `执行⟞ ${sessionId}`（timeline.tsx:100）；弹窗简要形态「挂接会话」行 = sessionId 直拼
   （drawer/index.tsx:72-80）。会话名称在 dsh 账本快照已单源存在（LedgerSessionRow
   displayTitle——sidebar 同款消费），任务面未接——用户面对裸 id 无法辨认会话。
2. **弹窗简要形态不能跳会话**：完整形态时间线 pill 可点跳会话+关弹窗（jumpToSession——
   drawer/index.tsx:408-420）；简要形态挂接会话行是静态文本。两形态交互不对等，
   小弹窗看得到会话却跳不过去。
3. **任务名称带 slug 前缀，与任务子 tab 列表不一致**：列表视图行 = localId chip + 标题
   （list-view.tsx:104-108）；而 ① 派发悬浮面板行键 = `slug/localId`
   （dispatchRowKeyLabel——DispatchPanel.tsx:399-401）② 任务详情弹窗头 chip = `slug/localId`
   （taskKeyLabel——drawer/index.tsx:451-453）③ 会话内派发工具行结算后缀 = `slug/localId`
   （dispatchTaskKeyOf——DispatchToolRow.tsx:89-97）④ 诊断消息「任务：」行 =
   `{slug/localId} {title}`（message-format.ts:219）。slug（feature 目录名）冗长占宽，
   同容器上下文里是噪音。
4. **派发面板标题无容器信息**：悬浮面板头恒「派发任务」（DispatchPanelBody——
   DispatchPanel.tsx:525）；行名去 slug（点 3）后容器上下文丢失，需标题承载。
5. **任务列表行无打开 worker 会话入口**：列表视图两行卡主行仅 ⋯ 菜单（查看详情/转移
   预设——list-view.tsx:112-157）；执行中任务的 worker 子会话须开弹窗→时间线 pill 两跳。
   派发面板行已有 ⟞ 先例（fetchWorkerSession 判读 record 源非 link 派发集 +
   父会话显式地址径——DispatchPanel.tsx:330-366）。

## Solution

五条改动线（呈现面为主，一条装配通道）：

### S1 会话名称展示（点 3）

- 弹窗简要形态「挂接会话」行、完整形态时间线会话 pill 显示**会话名称**：数据源 =
  dsh 账本快照 displayTitle（plugin inject face 已有 sessions.list 快照源——plugin.ts
  ForgeSessionsService）；账本未命中（归档/旧会话/快照缺行）**回退显示 id**（fail-soft）。
- 通道：插件 inject face → ShellHost 装配层会话名解析器（sessionId → title | undefined）
  → 弹窗/时间线 pill 消费。纯呈现组件收 `sessionTitleOf(sessionId)` 注入，缺席回退 id。

### S2 弹窗双形态均可跳会话（点 4）

- 简要形态「挂接会话」行改**可点 pill**：跳对应会话 + 关弹窗——与完整形态时间线 pill
  同语义（onOpenSession + onClose 两动作一体，原型 m31-tm-sess 语义）。worker 子会话
  附库侧权威父（link 派发源）的既有判读不变。

### S3 任务名称规范 {编号} {title}（点 5）

- 四个名称位统一为 `{编号} {title}`（编号 = localId）：① 派发面板行（编号 chip + 标题，
  去 slug 键）② 弹窗头（编号 chip，标题行本就承载 title）③ 派发工具行结算后缀
  ④ 诊断消息「任务：」行。
- **前置引用编号化**：弹窗简要「前置」行、时间线「前置声明」织入、现状条前置项——只显
  编号（如 `T3`），悬停 Tooltip 补 `{编号} {title}` 全名。
- slug 消歧信息保留于既有位：诊断消息 @path 行与「所属：」行、弹窗简要「所属」行——
  跨容器场景（编号撞号）仍有 slug 可判。

### S4 派发面板标题（点 6）

- 行集**唯一 slug** → 标题「派发 {slug} 的任务」；**多 slug / 缺席** → 回退现状「派发任务」
  （纯函数：rows → 唯一 slug 判定）。

### S5 列表行 worker 会话按钮（点 8）

- 列表视图两行卡主行新增 ⟞（打开 worker 执行子会话）——点击经 fetchWorkerSession 同款
  判读（taskDetail → record 源非 link 派发集 + 父会话显式地址径），沿 DispatchPanel 先例
  按需拉取无预取；**无执行会话不呈现按钮**（未派发/纯派发任务行内不出灰钮）。
- 仅列表视图行；泳道/DAG 视图不动（用户裁决）。

## Alternatives

| 方案 | 取舍 | 结论 |
|---|---|---|
| do nothing | 五摩擦点维持——裸 id 辨会话、小弹窗两跳进 worker、slug 噪音 | 落选（用户实机走查裁决） |
| 会话名称走 core contracts 加列（SessionTaskLinkCard 增 sessionTitle） | 数据一次到位，但 forge 任务库不存会话名（会话账本在 dsh 宿主域），跨域读链路重；web 客户端已有账本快照单源（sidebar 同款消费） | 落选——账本直读 + fail-soft 回退 |
| 十点单提案一次收口 | 省协调，但信息密度面与视觉文案面改动性质/测试面不同，评审粒度粗 | 落选（用户裁决拆两批，姊妹批 task-ui-visual-copy） |
| 前置引用也用完整 {编号} {title} | 全名一致性好，但前置列表空间窄、多前置时占宽失控 | 落选（用户裁决：前置仅编号 + 悬停全名） |

## Scope

**In Scope（交付物级）**：

1. 会话名称解析通道（inject face → ShellHost → 弹窗/时间线 pill/简要行消费；
   displayTitle 命中、缺席回退 id）+ 挂接会话四面名称展示
2. 弹窗简要形态挂接会话 pill 化（可点跳会话 + 关弹窗）
3. 任务名称 {编号} {title} 四面落位 + 前置引用编号化（悬停全名）
4. 派发面板标题格式（唯一 slug 展开 / 多 slug 回退）
5. 列表视图行 worker 会话按钮（无执行会话不呈现）
6. 测试随迁（受影响组件测试 + 装配注入断言）

**Out of Scope（含理由）**：

- 会话改名/标题生成（dsh 宿主域——本批只消费账本 displayTitle）
- core contracts SessionTaskLinkCard 加列（账本直读路线已选定）
- 泳道/DAG 视图的 worker 按钮（用户裁决仅列表行）
- 派发工具行输入/输出体改造（仅结算后缀名称位）
- 视觉文案批次内容（内容结构/文字简约/图标/诊断提示词/DAG 箭头——姊妹提案
  `task-ui-visual-copy-blitz`）

## Risks

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 账本快照注入链路断裂（ShellHost 未递达解析器）→ 名称回退 id 静默劣化 | fail-soft 回退 id + 装配注入断言测试锚（SC6） |
| R2 | 去 slug 后跨容器编号歧义（不同容器同 localId） | slug 保留于诊断 @path/所属行与弹窗「所属」行；列表/面板单容器上下文 |
| R3 | 列表行 worker 按钮逐次 taskDetail RPC | 沿 DispatchPanel ⟞ 先例按需拉取；无 worker 不呈现（零无效点击） |
| R4 | 简要形态 pill 化后 440 宽多会话换行挤压 | pill 弹性换行布局 + 组件测试快照 |
| R5 | 诊断消息「任务：」行格式变更破坏快照锚 | message-format.test 快照一次随迁 |

## Success Criteria

| # | 判据 | 度量面 |
|---|---|---|
| SC1 | 挂接会话四面（简要行/时间线 pill）显示会话名称：账本命中 displayTitle、缺席回退 id | 组件测试（命中/缺席两态） |
| SC2 | 简要形态挂接会话可点：跳对应会话并关弹窗（同完整形态语义） | 组件测试 |
| SC3 | 四名称位（面板行/弹窗头/工具行后缀/诊断任务行）= {编号} {title}；前置引用仅编号 + 悬停全名 | 组件测试快照 |
| SC4 | 面板标题：行集唯一 slug → 「派发 {slug} 的任务」；多 slug/缺席 → 「派发任务」 | 纯函数单测 + 组件测试 |
| SC5 | 列表行 worker 按钮在场可打开执行子会话；无执行会话行不呈现按钮 | 组件测试（两态） |
| SC6 | 会话名解析器经 ShellHost 装配递达弹窗（注入面在场断言） | 装配/注入测试 |

**一致性检查（写作后核对）**：SC1↔交付 1；SC2↔交付 2；SC3↔交付 3；SC4↔交付 4；
SC5↔交付 5；SC6↔交付 1+6。六条 SC 每条有 In-Scope 交付项承载；无悬空 SC，无无消费
交付，SC 间无互斥。**检查结果：一致，无冲突。**

## 用户裁决记录（brainstorm 对话，2026-10-11）

1. 十点走查清单（原始输入）：本批承载第 3/4/5/6/8 点（会话名/双形态跳转/命名/面板标题/
   worker 钮），第 1/2/7/9/10 点归姊妹批 task-ui-visual-copy
2. 任务名称适用面 ①②③④（面板行/弹窗头/工具行后缀/诊断任务行）；前置引用只显编号，
   悬停补全名（选项裁决）
3. 派发面板标题：单 slug 直显「派发 {slug} 的任务」，多 slug 回退「派发任务」（选项裁决）
4. worker 按钮仅列表视图行（选项裁决）
5. 交付形状：十点拆两提案分批——信息密度批（本提案）+ 视觉文案批（选项裁决）
