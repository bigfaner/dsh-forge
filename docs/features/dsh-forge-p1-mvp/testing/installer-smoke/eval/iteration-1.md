# Eval Report: journey installer-smoke — Iteration 1

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/installer-smoke/journey.md`
- **Feature**: dsh-forge-p1-mvp
- **Surface**: web（Electron 单机桌面应用，安装形态冒烟）
- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度 / target 975 / 各维度下限）
- **Surface rules**: `skills/gen-journeys/rules/surface-web.md`（Dimension 5 参数化依据）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Iteration**: 1（首次评分，无前次报告）
- **Date**: 2026-10-03

---

## 1. Document Identity

Journey 文件结构完整可解析：frontmatter（feature / journey / risk_level=Low / golden_path=false / surface_types=["web"] / sources×3 / generated=2026-10-03）+ Overview（含 PRD 溯源段）+ Setup + Happy Path（Step 1–4）+ Edge Cases（Step 2b / Step 3b）+ Journey Invariants（2 条）。非解析失败情形，正常评分。

事实对齐判定基线：本文档自带的事实机制 = Overview 的「PRD 溯源」叙述段 + 逐步Expected Result。溯源对象（prd-spec Goals / In Scope、UF-1 / UF-4、提案 Key Scenario「MVP 门走查」、SC-MVP 后半、SC-NFR）已逐条对照原文核实（见 Dimension 4）。

## 2. Phase 1 — Reasoning Audit（独立预判锚点）

1. **主工作流覆盖**：成立。Happy Path 4 步与 PRD Goals「安装包冒烟 4 步（安装 → 启动 → 主界面可达 → 会话面板可用）」及 SC-MVP 后半逐字对应，步骤顺序即冒烟顺序，语义上确为 PRD 用户故事。
2. **步骤序列可执行性**：大体成立但有两处断点——① Step 4 动作「在中区会话面板发起新会话」在 Setup 声明的全新安装（零项目）状态下不可直接执行：零项目时中区为 hero 空态（UF-2），新建会话入口在左栏 rail（UF-1），动作把「入口」与「目标面板」混写；② Step 2 Expected Result 断言 boot manifest 掌舵链路，浏览器/用户均不可观察，下游 agent 无从断言。
3. **Outcome 可观察性**：Step 3 / 3b / 4 基本可观察；Step 1（「应用可执行与运行时就位」）与 Step 2（「薄宿主拉起…boot manifest 掌舵完成装载」）为实现级/打包属性断言。
4. **自洽检查**：Setup「目标机器无既有安装」⇒ 全新数据库 ⇒ 零项目，而 Step 3 期望「中区面板」、Step 3b 期望「中区呈现 hero 空态」，两者在同一前置状态下同时生效、未作调和——真实矛盾点（详见 Dimension 6）。Invariant 2 无任何步骤行使（不可观察），形同虚设。

预判锚点已分别导入 Dimension 5 / 6 与 blindspot 攻击。

## 3. Phase 2 — Rubric Scoring（验证立场，逐条引用原文）

### Dimension 1. Completeness（完整性）— **144 / 200**（下限 120 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| 元数据完整（0-50） | 46 | name=installer-smoke 合 kebab-case；risk_level=Low 为合法枚举。轻微保留：旅程自身注释定义 Low = "Workflow is read-only or purely observational"，而本旅程含运行安装包与「发起新会话」（创建会话 = 状态创建），非纯只读——按走查性质可接受，扣 4。 |
| Step 字段完整（0-80） | 70 | 4 个 Happy Step 均有 User Action + Expected Result，顺序连贯（安装→启动→首屏→会话）。扣分：Expected Result 普遍单薄——Step 1「安装完成，应用可执行与运行时就位」无可观察判据；Step 4 期望把范围声明（「真实 agent 往返属知识飞轮 Journey 范围」）混入结果而非独立口径。 |
| 覆盖 happy + 必察派生（0-70） | 28 | Happy path 完整；但 web surface 必察派生 Outcome（validation-error / session-expired）**完全缺席**——既无覆盖步，也无 N/A 处置段（对照兄弟 journey session-workbench 的「Derived Outcomes（Web Surface 必察项）」段）。且全旅程零错误路径 Outcome（安装失败、启动失败均无）。 |

### Dimension 2. Semantic Purity（语义纯度）— **163 / 200**（下限 120 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| Outcome 自然语言、非代码/regex（0-80） | 70 | 全文无 regex / CSS 选择器 / XPath / `expect(...)` 类断言调用。扣分：Step 2 Expected Result「薄宿主拉起，自有前端入口 + 壳内核经 boot manifest 掌舵完成装载」描述的是装载机制而非用户/系统可观察现象，属"how"不是"what"。 |
| Precondition 声明式（0-60） | 55 | 「目标机器处于断网环境」「全新安装，应用数据库无任何项目记录」均为声明式状态描述 ✓。轻微扣分：后者引用内部存储概念（应用数据库）而非用户可理解状态，可接受但非最优。 |
| Step 无实现耦合（0-60） | 38 | 两处明显实现耦合：① Step 2 Expected Result 的「薄宿主 / 壳内核 / boot manifest 掌舵」为架构内部件；② Invariant 2「安装形态与开发形态走同一 boot manifest 掌舵链路」整条为实现层等价性断言；③ Step 1「应用可执行与运行时就位」为文件系统/打包内部断言。下游浏览器自动化无法就这些描述生成断言。 |

### Dimension 3. Precondition Exclusivity（前置条件互斥性）— **117 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| 同 Step 内 Outcome 前置互异（0-60） | 50 | 每个 Step 单一 Outcome，无同步重叠对；-20/对规则无适用实例。 |
| 前置足以唯一定选 Outcome（0-50） | 35 | 跨步歧义：Setup「目标机器无既有安装（全新安装路径）」⟹ 零项目 ⟹ Step 3b 前置「全新安装，应用数据库无任何项目记录」恒真。于是首启后 Step 3 的「中区面板」与 Step 3b 的「中区呈现 hero 空态」同时适用，下游 agent 无法判定中区应断言面板还是 hero（除非自行援引 UF-2 调和）。 |
| 错误/边界 Outcome 前置齐全（0-40） | 32 | 已有的两个边界步（2b 断网、3b 零项目）均显式声明触发前置 ✓；但错误类 Outcome 整体缺席（无对象可查），能力性缺失计小扣（主要罚则落在 Dimension 1）。 |

### Dimension 4. Fact Alignment（事实依据）— **92 / 150**（下限 90 ✓，压线）

已核实的正向事实链（对照原文）：
- 「安装包冒烟 4 步（安装 → 启动 → 主界面可达 → 会话面板可用）」= prd-spec Goals 原文 ✓；In Scope「MVP 门：飞轮端到端走查演示 + Windows 安装包启动冒烟」✓
- Step 1「静态资源本地打包，无 CDN / 远程脚本 / 远程字体依赖」= 提案 NFR「应用自身离线自足…（无 CDN / 远程脚本 / 远程字体）」✓
- Step 3 三区构成 = SC1 / UF-1 ✓；Step 3b hero 空态 + CTA = UF-2 ✓；Step 2b/Invariant 1 离线断言 = SC-NFR ✓
- 「提案 Key Scenario『MVP 门走查』、SC-MVP 后半、SC-NFR」均存在且语义相符 ✓

| 子项 | 得分 | 理由 |
|---|---|---|
| 事实声明可溯源（0-60） | 42 | 旅程级溯源段覆盖大部分断言；但两处无源：① Invariant 2「安装形态与开发形态走同一 boot manifest 掌舵链路，行为一致」——提案仅规定 boot manifest 为装载机制，「安装≡开发同链路且行为一致」的等价性主张在任何 cited source 中不存在，未标 UNKNOWN；② Step 4 括注「真实 agent 往返属知识飞轮 Journey 范围」为跨旅程归属声明且不准确——session-workbench Step 2「发起新会话并完成一次真实往返」同样承载真实往返，归属应含兄弟旅程或改写。 |
| 推理声明带 required_outcomes 依据 + source: inferred（0-50） | 22 | 全文零条 `source: inferred` 注记、零 UNKNOWN 标记；surface-web 必察项（validation-error / session-expired）未触发任何派生（连 N/A 论证也没有）。对照 session-workbench 对同输入面的显式处置，本旅程的派生纪律缺位。 |
| 无未分类虚构声明（0-40） | 28 | Invariant 2 属「既非可溯源事实、又无 inferred 注记」的未分类声明（-30/条规则的上沿情形）；因其为合理架构推断而非与源矛盾的行为捏造，按未验证未分类从轻计一次，不逐条套 -30 全额。 |

**Deduction rule 应用说明**：「Hallucinated unclassified claim -30/条」——仅 Invariant 2 一条处于该类边缘，已在子项 2/3 中折算计入，不再叠加全额 -30（避免双重计罚；若 reviser 认定该条为行为级断言，可改按全额 -30 执行，届时本维度 = 62，低于下限）。

### Dimension 5. Surface Fitness（Surface 适配）— **54 / 150**（下限 90 ✗ **未达下限**）

| 子项 | 得分 | 理由 |
|---|---|---|
| 必察派生 Outcome 在场（0-60） | **0** | surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。本旅程两者**完全缺席**：无 validation-error 步（Step 4 已把输入区拉进范围——「对话 tab 输入区可交互」——却未考虑空消息提交），亦无 session-expired 的 N/A 处置（单机离线产品本可一句话论证 N/A，见 session-workbench「session-expired — N/A：单机产品无登录会话 / 过期概念」）。按 rubric 明文「Score 0 if mandatory Outcomes are completely absent」执行 0 分。 |
| 测试策略比例（web = 50/50）（0-50） | 30 | Web 要求 Contract 与 Journey 两级均衡。本旅程 Outcome 密度低（每步一句），可拆为 Contract 级断言的素材有限（三区构成、hero CTA 可拆，但 Step 1/2 期望不可拆），粒度偏向粗粒度走查。 |
| 环境与执行假设现实性（0-40） | 24 | Windows 安装 + 断网切换 + UI 走查的组合现实；但作为 web surface（Electron）旅程，未交代浏览器自动化如何附着于**已安装**应用（dev server 假设失效：surface-web 的 Environment Readiness Checks——dev server / HTTP 200 / playwright——均不适用安装形态，文档未给出替代附着方式与等待策略）；「等待应用首屏呈现」无异步/等待口径。 |

无 -25 Surface type violation 适用（无 CLI 式断言混入 web 旅程）。

### Dimension 6. Internal Consistency（一致性）— **110 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| Invariant 逐步成立（0-60） | 48 | Invariant 1「全程无远程资源请求」在 Step 2b 被操作化 ✓，各步无违反。Invariant 2（boot manifest 同链路）无任何步骤可行使/观察——未被违反，但作为行为不变量不可验证，不变量体系有一半悬空。 |
| 跨步引用一致（0-50） | 32 | Step 4 引用 Step 3 的中区面板成立；但 Step 3（「中区面板」）与 Step 3b（「中区呈现 hero 空态」）在 Setup 全新安装前提下描述同一首屏且未调和——同一状态两个互竞期望，跨步矛盾的主体现身处。 |
| 风险级别与内容一致（0-40） | 30 | Low = "read-only or purely observational"，但旅程含运行安装包（机器状态变更）与「发起新会话」（创建实体）；更贴近 Medium（多步交互、无不可逆副作用）。分类偏差非内容性质错误，中度扣分。 |

无 -40 Invariant violation 适用（无被步骤实际违反的不变量）。

### Dimension 7. Workflow Coverage（工作流覆盖度）— **113 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| Golden Path 存在（veto, 0-60） | 55 | **Veto 未触发**：Happy Path 4 步连续、领域级（安装→启动→首屏→会话），语义上精确对应 PRD Goals「安装包冒烟 4 步」与 SC-MVP 后半——已对照 prd-spec/proposal 原文验证，非仅"存在 3+ 步"。轻微扣分：步骤期望单薄使金路的断言力弱于 SC-MVP 的验收口径。 |
| 多步覆盖深度（0-50） | 28 | Happy 之外仅两个边界步（离线启动、零项目 hero）；无状态转移、无实体生命周期、无错误恢复。对冒烟类旅程属合理下限，但深度浅。 |
| 对 PRD 范围的完整度（0-40） | 30 | 旅程自界范围（安装包冒烟）内的 PRD 要点（4 步 + SC-NFR 离线断言）已覆盖；缺口：① 提案将安装包冒烟定位为「提前验证打包/CI 链路」，Setup 直接假设「Windows 构建产物就位」而完全不触及产物来源（可接受的分层，但未声明）；② 安装形态下的升级/覆盖安装边界全无（见 blindspot）。 |

### 跨维度一致性检查

- Step 3/3b 中区状态矛盾：最清晰现形于 Dimension 6（已计 32/50），Dimension 3 仅计其"前置不足以唯一定选"面（35/50），无双重全额计罚。
- 必察派生缺席：Dimension 5 计规则明文 0/60（presence 判定），Dimension 1 计边界/错误 Outcome 整体缺失（28/70）——判据不同（前者=特定强制项在场性，后者=一般错误路径覆盖），成立。
- 实现耦合：Dimension 2 计语义纯度，其可执行性后果另入 blindspot，不重复计分。

## 4. Phase 3 — Blindspot Hunt（rubric 之外的 QA 失败模式）

1. **[blindspot] Step 4 动作在声明 Setup 下不可执行** — 引用：「**User Action**: 在中区会话面板发起新会话」。全新安装 ⇒ 零项目 ⇒ 中区呈 hero 空态（UF-2），会话面板尚不存在；新建会话的实际入口是左栏 rail 的「新会话」/品牌行（UF-1）。动作把目标面板当入口写，下游 agent 拿到的指令在初始状态下无法照做。须改为：「点左栏『新会话』（或品牌行）→ 中区切换为会话视图并新建会话」。
2. **[blindspot] 无既有安装/升级边界缺失** — 引用：「目标机器无既有安装（全新安装路径）」。安装类 QA 的经典边界是覆盖安装/升级/残留数据，旅程只有全新路径单边界且未显式声明为何排除（P1 单版本冒烟可作 N/A 记账，但须写出来）。须补一条 edge case 或显式 out-of-scope 注记。
3. **[blindspot] 安装期离线主张无观察通道** — 引用：「静态资源本地打包，无 CDN / 远程脚本 / 远程字体依赖」。这是打包产物属性而非运行时可观察行为；Step 2b 只覆盖「启动 + UI 走查」期的网络断言，安装期该主张对下游 agent 无验证通道（产物检查？拦截器？）。须声明验证通道或降格为设计前提。
4. **[blindspot] 启动失败路径零覆盖** — 引用：「**Expected Result**: 安装完成，应用可执行与运行时就位」+ Step 2 仅成功分支。Windows 安装形态最常见的真实故障（运行时缺失、首启崩溃、白屏）无一有观察口径；冒烟旅程至少应有一条「启动异常时的可见失败呈现」或显式声明失败诊断不属本旅程。

## 5. Deduction Rules 应用汇总

| 规则 | 应用 |
|---|---|
| Missing required field/section → 维度 0 分 | 不适用（结构完整） |
| Hallucinated unclassified claim −30/条 | Invariant 2 一条边缘情形，Dimension 4 内折算计入（未叠加全额，理由见 Dim 4 说明） |
| Surface type violation −25/条 | 不适用 |
| Invariant violation −40/条 | 不适用（无步骤违反不变量） |
| Precondition overlap −20/对 | 不适用（无同 Step 内重叠对；跨步歧义计入 Dim 3 子项 2 与 Dim 6） |
| Golden Path veto | **未触发**（金路存在且语义对应 SC-MVP） |
| 金路步骤 API 级描述 −15/步 | 不适用（步骤为领域级） |

## 6. Final Summary

```
SCORE: 793/1150
DIMENSIONS:
  Completeness: 144/200
  Semantic Purity: 163/200
  Precondition Exclusivity: 117/150
  Fact Alignment: 92/150
  Surface Fitness: 54/150   ← 低于下限 90（致命项）
  Internal Consistency: 110/150
  Workflow Coverage: 113/150
```

**判定：FAIL**（总分 793 < 975；且 Surface Fitness 54 < 90 未达维度下限——任一条件即不通过）。

**修复优先级（面向 reviser）**：
1. 【必改·解除下限】增设「Derived Outcomes（Web Surface 必察项）」段：validation-error 就 Step 4 输入面给出覆盖或显式移交兄弟旅程的口径；session-expired 给出单机产品 N/A 论证。
2. 【必改】调和 Step 3 与 Step 3b：明确全新安装首屏中区 = hero 空态（UF-2），三区断言改为骨架可达 + 中区相位说明。
3. 【必改】改写 Step 4 User Action 为可执行入口（左栏「新会话」），并定义「输入区可交互」的可观察判据。
4. 【必改】Invariant 2 补 source 注记（inferred/UNKNOWN）或改为可观察表述；Step 2 Expected Result 去实现耦合（boot manifest 移入审计注记）。
5. 【建议】补启动失败观察口径或显式记账；补「既有安装」边界或 N/A；修正「真实 agent 往返属知识飞轮 Journey 范围」的归属表述（应含 session-workbench）。
