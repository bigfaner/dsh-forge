# Journey Eval Report — iteration 1

- **Target**: `docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md`(1150 分 / 7 维度,target 975,每维度下限见阈值表)
- **Scorer context**: `gen-journeys/rules/surface-web.md`(SURFACE_TYPE=web,强制 outcomes = validation-error + session-expired,策略 50/50);`docs/business-rules/` 全量(workbench BIZ-workbench-006/007/008 M4 三条 + BIZ-workbench-002/005、coexistence、resilience、sot-migration、task-operations、privacy);`prd/prd-user-stories.md`(**Story 5 = ground truth**)+ `prd/prd-spec.md`(必答④⑤/SC3/DF001/DF004/性能/数据要求)+ `prd/prd-ui-functions.md`(UF1/UF2/UF8)+ `docs/proposals/dsh-forge-m4/proposal.md` Key Scenarios「改名/归档」「错误路径」
- **Date**: 2026-09-30 · **Iteration**: 1

## Verdict

| | Score | Threshold | Pass |
|---|---|---|---|
| **Total** | **921 / 1150** | ≥975 | ❌ FAIL |
| 1. Completeness | 157 / 200 | ≥120 | ✅ |
| 2. Semantic Purity | 191 / 200 | ≥120 | ✅ |
| 3. Precondition Exclusivity | 124 / 150 | ≥90 | ✅ |
| 4. Fact Alignment | 108 / 150 | ≥90 | ✅ |
| 5. Surface Fitness | 82 / 150 | ≥90 | ❌ **低于阈值** |
| 6. Internal Consistency | 129 / 150 | ≥90 | ✅ |
| 7. Workflow Coverage | 130 / 150 | ≥90 | ✅(Golden Path veto 未触发) |

**失败原因(两项)**:总分 921 < 975;Surface Fitness 82 < 90(强制 outcomes 对完全未映射,规则明文「Score 0 if mandatory Outcomes are completely absent」,仅因宿主通道失联素材可作最近似面给残分)。

---

## Phase 1 — Reasoning Audit(pre-score anchors)

**故事工作流覆盖追踪**(Story 5:归档不丢历史、改名不丢归组;必答④⑤;UF8):

| 旅程步骤 | 对应 PRD/设计锚点 | 追踪结论 |
|---|---|---|
| Step 1 查看投影状态(healthy + 生命周期动作 + 归档语义说明) | UF8 Placement「项目设置『投影与生命周期』节」+ Data Requirements(投影状态 enum healthy/degraded/deviation;生命周期动作 改名/归档/恢复/删除;归档语义说明 归档 ≠ 删除) | ✅ 逐字可溯 |
| Step 2 改名(forge 名更新/投影同步改名/分组随 workspace 保持/失败不阻断) | 必答⑤表改名行(「项目名更新 \| 同步改名 \| 分组随 workspace 保持」)+ Story 5 AC3 + UF8 Validation「失败降级不阻断改名本身(本地生效,投影待重试)」 | ✅ |
| Step 3 归档(forge 归档分区 + 会话列表不再展示;dsh workspace 保留 + 会话仍按组) | Story 5 AC1+AC2 + 必答⑤归档行 + UF1「归档项目降透明只读呈现…只读,不挂会话」 | ✅ |
| Step 4 恢复(移回活跃区;投影不变化) | UF1 Validation「恢复操作将项目移回活跃区(投影不变化——workspace 未移除)」+ UF8「归档项目可恢复或删除」 | ✅ |
| Step 5 删除(确认对话/条目删除/workspace 移除/退未分组不删历史/布局记忆清除) | 必答⑤删除行 + Story 5 AC4 + UF8 Validation「删除必须经确认对话;删除后布局记忆随之清除」+ PRD 数据要求「布局记忆…项目删除时随之清除」 | ✅ 内容可溯,**但与 Step 4 状态矛盾(见 6b)** |
| Edge 1b/1c/1d/2b | UF8 States(degraded/deviation)+ 必答④(偏差/降级)+ DF004(偏差事实:改名/删除/乱序) | ✅ |
| Edge 3b/5b/5c | UF1(归档分区呈现/删除当前项目 → 落到其余项目或空态)+ PRD 数据要求(布局记忆) | ✅(3b 前置不发散,见 3a) |

**AC 覆盖对账(Story 5 全 5 条)**:AC1→Step 3;AC2→Step 3/3b;AC3→Step 2;AC4→Step 5;AC5→Step 1c/1d。**全部覆盖** ✅。

**内部论证健全性——发现一处硬伤**:Happy Path 用单一「生命周期承载项目」(Setup:「其一为生命周期承载项目」)线性走 改名→归档→恢复→删除。Step 4 恢复后项目回到**活跃区**(「项目移回活跃区」),而 Step 5 的对象定义是「**对归档项目**执行删除并经确认对话」——Step 5 所需的归档态已被 Step 4 撤销,且 Setup 未提供第二个归档项目,也无隐式再归档步骤。交叉引用悬空:字面执行到 Step 5 时归档行不存在(恢复后只剩活跃区行菜单/设置入口的显式删除路径)。UF8 原文「归档项目可恢复或删除」本为归档态下的**两条分支**,旅程将其线性化为先后两步制造了矛盾。

**High-risk 密度规则**:happy 5 步,edge 7 例(1b/1c/1d/2b/3b/5b/5c)≥ 5 ✅。

**Golden Path veto 判定**:frontmatter `golden_path: false`(feature 级金路径在 project-workbench-home,已核)。但本旅程 Happy Path Step 1→5 为连续 5 步、域级动作(查看投影状态/改名/归档/恢复/删除),语义验证对应 Story 5 核心序列与 UF8 User Interaction Flow(查看投影状态 → 改名 → 归档 → 恢复/删除)。**veto 不触发**。

**核心弱点定位**(评分前锚点):① surface-web 强制 outcomes 对(validation-error + session-expired)零映射零注释——对照姊妹旅程 task-session-roundtrip 与 project-workbench-home 均有双映射注释且带 `source: inferred`,本旅程为 6 篇中最弱;② Step 4→5 状态矛盾;③ 删除确认对话取消分支、删除遇投影降级两条边界缺失。

---

## Phase 2 — Rubric Scoring(verification stance)

### 1. Completeness(完整性)— 157/200

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 1a metadata(0-50) | 50/50 | name kebab-case ✅;`risk_level: "High"` 合法且内容强证成——删除 = 不可逆(条目删除 + workspace 移除)+ 数据销毁面(「该项目布局记忆随之清除」),直接命中 High 判据「data loss risk / irreversible」✅;frontmatter 七字段齐全 + sources 含 prd-ui-functions.md ✅;风险分类注释保留 ✅。 |
| 1b steps 字段齐全(0-80) | 72/80 | 全部 12 步(5 happy + 7 edge)均有 User Action + Expected Result ✅;编号体系(1-5 + b/c/d)一致 ✅。−8:① 5 步的 User Action 为观察性动词(「察看」×4:Step 1b/1c/1d/3b + 5c「察看其余项目与重进行为」),动作性弱;② Step 3b 与 Step 3 期望结果重叠(「归档分区/降透明只读/会话列表不再展示」双写),边缘步骤信息增量低。 |
| 1c happy + 必备派生场景(0-70) | 35/70 | happy path 完整(Story 5 全 AC ✅,基础分 ~30);PRD 派生边界在场:降级态(1b)+ 偏差双例(1c/1d)+ 通道失败(2b)+ 活跃项目删除(5b)+ 布局记忆清除(5c)(+5)。扣分:−18 surface-web 强制对 validation-error + session-expired 双双缺席(改名输入无任何非法输入 outcome;无宿主/会话失联 mid-workflow outcome 或映射注释);−6 删除确认对话取消分支缺失(不变量断言「删除必经确认对话」却从未验证对话取消 → 零变更零残留);−6 删除遇投影降级路径缺失(不变量与必答④的非阻断清单均只列「注册/改名/归档」,删除时投影失败的行为全文未定义);−5 loading-state 缺席(投影操作 ≤2s 为异步,无中间态 outcome)。 |

### 2. Semantic Purity(语义纯度)— 191/200

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 2a 自然语言非代码/正则(0-80) | 75/80 | 无 regex/CSS 选择器/expect() 断言调用 ✅;outcome 描述用户/系统可观察事实 ✅;「(断言)」为 Story 5/SC3 原生词汇 ✅。−5:枚举词 healthy/degraded/deviation 直接入文(UF8 域词,可溯但为设计态名而非用户可观察描述);「投影通道」(Step 2b)为 host 半身通道的设计缩略语。 |
| 2b 前置条件为声明式(0-60) | 59/60 | 7 条 edge Precondition 全部为状态声明(「投影写入曾失败(workspace 不可写)」「dsh 侧手工删除 workspace 或打乱顺序」「被删项目为当前活跃项目」等)✅。−1:Step 1b「投影写入**曾**失败」为历史事件叙述(以现态「投影处于降级」表述更纯)。 |
| 2c 步骤无实现耦合(0-60) | 57/60 | 步骤均为用户级动作(打开设置/修改项目名并确认/执行归档并确认/经行菜单恢复)✅;期望结果呈两侧系统级事实(forge 侧/dsh 侧),域级而非 API 级 ✅。−3:「经归档行菜单/设置恢复项目」将两入口并列未消歧;「workspace 未移除」为存储层措辞(域词,轻)。 |

### 3. Precondition Exclusivity(前置条件互斥性)— 124/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 3a 各 Step 族前置互斥(0-60) | 42/60 | Step 1 族三态互斥清晰:happy(对账一致 → healthy)vs 1b(写入曾失败 → degraded)vs 1c/1d(手改 → deviation),与 UF8 States 表一一对应 ✅;Step 2 vs 2b(通道正常/失败)✅;Step 5 vs 5b(归档态对象/当前活跃项目对象)✅。−10:**Step 3b 前置「存在归档项目」与 Step 3 的产物状态完全等价**——边缘案例按模板要求应「describes the divergent precondition」,3b 无发散前置,与父步骤同态不可区分;−8:**Step 5c 前置「被删项目存有布局记忆」是 happy 态的子集**(Setup 已声明承载项目「含会话、布局记忆与归档前数据」),Step 5 与 5c 前置同时成立,且 5c 的核心断言「该项目布局记忆随之清除」已在 Step 5 期望结果中原句出现(重复断言,非互斥分支)。 |
| 3b 前置足以唯一选择 Outcome(0-50) | 44/50 | UF8 三态机给定对账事实即可定态 ✅;2/2b、5/5b 时间窗与对象互斥清晰 ✅。−4:1b(投影写入失败)与 1c/1d(手改偏差)组合场景未定义——workspace 不可写期间 dsh 侧又被手改时呈现何态(degraded 与 deviation 并存?)UF8 enum 为单值,旅程未声明优先序;−2:5c 的「重进行为」使 outcome 归属含糊(观察其余项目 vs 重进被删项目,后者不可能——被删项目已不存在)。 |
| 3c 错误/边界 Outcome 无缺前置(0-40) | 38/40 | 7/7 edge 均有显式 Precondition 且描述触发事实 ✅。−2:Step 2b「改名时投影通道失败」未区分通道不存在(宿主半身失联)vs 写入中途失败两类触发(恢复语义不同:前者重试前不可达,后者数据可能半写)。 |

### 4. Fact Alignment(事实依据)— 108/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 4a 事实声明可溯(0-60) | 54/60 | 逐条核验:Step 1 三件套 = UF8 Data Requirements 原文;Step 2/3/4/5 主干 = 必答⑤表逐行 + Story 5 AC + UF1/UF8 Validation(「本地生效,投影待重试」近逐字);1b「degraded 态降级提示 + 手动『重试投影』入口」= UF8 flow/States;1c「deviation 明细:差异事实 + 处理建议」= UF8「偏差明细(不回流说明 + 建议)」+ DF004;5b「工作台落到其余项目或空态」= UF1 Validation 原文;Invariants 6 条全部可溯(必答④⑤/UF8/PRD 性能/PRD 不破坏段,BIZ-workbench-006 M4 四操作全覆盖)。BIZ 对账:BIZ-workbench-006(M4)的改名/归档/删除三操作 + BIZ-workbench-007/008 不在本旅程 scope(合理切分);「任何入口不得触发反向写」与 BIZ-workbench-006「任何入口禁止反向写」一致 ✅。扣分:−2 Step 5c「无孤儿布局残留」——「孤儿」词汇仅存在于 PRD 的「孤儿视图」(不同概念),布局记忆语境下为新造词,无源文出处且未标注推理;−2 Step 5b「不指向已删 id」为 UF1 断言的推理强化,未标注;−2 Step 5c「其余项目布局不受影响」由「按项目存储」推得,未标注。 |
| 4b 推理声明有 required_outcomes 支撑 + source: inferred(0-50) | 18/50 | **全文零 `<!-- surface-web required_outcomes 映射 -->` 注释、零 `source: inferred` 标注**。对照姊妹标准:task-session-roundtrip 有双映射(validation-error/session-expired 各一条),project-workbench-home 有双映射且均带 `source: inferred(推自 surface-web 规则强制项 × …)` 完整推理链;本旅程的降级/偏差素材(Step 1b/2b「投影通道失败」= 宿主通道失联的最近似面)本可承接 session-expired 映射,却完全未做。幸而多数边界 outcome 可直接溯至必答④/UF8(事实类),推理标注需求面窄,否则失分更重。 |
| 4c 无未分类幻觉声明(0-40) | 36/40 | 主动幻觉猎杀:逐条比对后未发现无源杜撰(归档≠删除链/降级承诺/不破坏/≤2s/退未分组不删历史均为源文原文);Step 3「历史可按组找回」= Story 5 So-that 原文 ✅。−4:「无孤儿布局残留」(见 4a)为最接近无分类声明者——新造复合断言(清除 + 无残留双主张),残留主张无事实出处。 |

### 5. Surface Fitness(Surface 适配)— 82/150 ❌ 低于阈值 90

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 5a 强制派生 Outcomes 齐备(0-60) | 8/60 | **validation-error:完全缺席**——旅程唯一表单型交互为 Step 2「修改项目名并确认」,无任何非法输入 outcome(空名/边界输入/错误近场提示/可修正重试全缺);删除确认对话仅作为 happy 前置出现,无取消分支。**session-expired:完全缺席**——无映射注释、无宿主/通道失联 mid-workflow 的 UX outcome;Step 2b「改名时投影通道失败」在功能上覆盖了通道失联家族(network-error 邻域,**非强制项**),但按姊妹旅程已建立的适配写法(桌面壳无登录会话 → 最近似面 = 宿主/数据通道失联),这正是 session-expired 应映射之处,却未声明。规则明文「Score 0 if mandatory Outcomes are completely absent」;给 8 残分仅因 1b/2b 的通道失联素材构成事实上的最近似面载体。 |
| 5b 测试策略比例 50/50(0-50) | 40/50 | Contract 级素材密度良好:UF8 三态矩阵(healthy/degraded/deviation)+ 偏差双例(改名/删除乱序)+ 活跃删除 + 布局清除 = 单面契约素材;Journey 级主线完整(改名→归档→恢复→删除全生命周期链)≈ 均衡 ✅。−10:12 步中 5 步为观察态步骤,contract 面呈「状态断言」而非「交互断言」;两级取用边界未声明,配比需读者自行切分。 |
| 5c 环境与执行假设现实性(0-40) | 34/40 | 浏览器交互假设现实(设置节/左栏树/行菜单/确认对话均为 DOM 可断言)✅;双应用观察口径(forge UI + dsh 原生 UI)与 SC3/项目 live-ui 探针纪律一致 ✅;Setup「测试可操控 dsh 侧数据面(手工改名/删除/乱序 workspace,供偏差构造)」fixture 思路现实 ✅;异步处理部分在场(≤2s 预算 + 降级态)。−6:无 loading/wait 策略线索(投影写入为异步,web 规则明文要求异步操作有中间态处理);≤2s 硬断言进 e2e 有抖动风险(BIZ-workbench-005「CI 计时用宽松阈值防抖动」既有纪律);跨应用(workspaceRegistry/会话分组)断言机制未提示,测试作者需自行解决观察通道。 |

### 6. Internal Consistency(一致性)— 129/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 6a Invariants 全程成立(0-60) | 58/60 | 逐条核:①归档 ≠ 删除——Step 3 保留 workspace/Step 5 才移除,全程无违反 ✅;②单向投影——1c/1d 显式断言不回流,无任何步骤反向写 ✅;③删除必经确认——Step 5/5b 均经确认对话 ✅;④降级承诺(注册/改名/归档不阻断)——1b/2b 一致 ✅;⑤不破坏——全程未触碰未注册目录数据 ✅;⑥≤2s——无步骤矛盾 ✅。−2:不变量④把「注册」纳入本旅程不变量集,但注册操作不在本旅程任何步骤中(属 project-registration-projection),不变量行使面与旅程 scope 轻微错位(忠实抄录必答④原文,可接受但未裁剪)。 |
| 6b 跨步骤引用一致(0-50) | 32/50 | edge 编号(1b-1d/2b/3b/5b/5c)全部指向真实父步骤 ✅;Setup「≥2 个项目」支撑 5b「落到其余项目或空态」✅;Setup「含会话、布局记忆」支撑 5c ✅。**−15:Step 4→Step 5 状态矛盾**——Step 4「项目移回活跃区」(恢复)之后,Step 5「**对归档项目**执行删除并经确认对话」的前提(对象处于归档态)已被撤销:单一承载项目经 Step 4 恢复后为活跃项目,Step 5 字面不可执行(需隐式再归档,或改走必答⑤「删除(归档态**或显式**)」的显式路径,但旅程未声明)。字面执行链断裂,下游 gen-contracts 将产出前置不可满足的 Step 5 契约。−3:Step 5c 的「被删项目」指代未绑定到 5 或 5b 之一(两者删除路径不同:归档行菜单 vs 确认对话)。 |
| 6c 风险级别与内容一致(0-40) | 39/40 | High = 不可逆删除(项目条目删除 + workspace 移除)+ 数据销毁(布局记忆清除)+ 归属变更(会话退未分组)✅,为 6 篇中风险证成最直接者。−1:恢复操作本身完全可逆且无副作用,混排在高危链中不稀释整体判级,仅记录。 |

### 7. Workflow Coverage(工作流覆盖度)— 130/150(veto 未触发)

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 7a Golden Path 存在(0-60,veto) | 55/60 | 连续 5 步 Happy Path 语义验证通过:对应 Story 5「归档不丢历史、改名不丢归组」核心序列(查看投影状态 → 改名 → 归档 → 恢复 → 删除),与 UF8 User Interaction Flow 的生命周期段逐段对应;域级术语(投影/归档分区/恢复/确认对话/workspace)零 API 级描述 ✅。−5:Step 4→5 状态矛盾(见 6b)使金路径的可执行性受损——语义序列成立,但字面状态链断裂,修复后应为满分候选。 |
| 7b 多步覆盖深度(0-50) | 42/50 | 深覆盖:完整实体生命周期(改名→归档→恢复→删除)、跨实体交互(forge 项目 × dsh workspace × 会话分组 × 布局记忆四实体)、状态机(三态)、错误恢复链(降级→重试→两侧一致)✅。−8:删除×降级组合未覆盖(不变量清单排除删除,行为未定义);恢复操作零 edge(如恢复一个 dsh 侧 workspace 已被手工删除的项目 = 1d 偏差 × Step 4 组合);改名输入边界零覆盖。 |
| 7c 对照 PRD/Design 工作流完备(0-40) | 33/40 | Story 5 全 5 AC 覆盖 ✅;必答④生命周期相关段(偏差/降级/不破坏)全覆盖 ✅;必答⑤三操作表全覆盖 ✅;UF1 归档分区语义覆盖(3b)✅。缺口:−4 **UF8「已归档会话」区工作流(搜索 + 逐条『解除归档』→ 会话行即时回左栏项目树)无任何旅程覆盖**(grep 全 testing/ 目录确认)——本旅程是 UF8 宿主旅程(「项目设置·投影与生命周期」),该缺口自然落在此处或需显式声明出界;−3 删除遇投影降级未定义(与 1c 同源,PRD 自身缺口,旅程未标注)。 |

---

## Deduction Log(汇总)

| # | 维度 | 扣分 | 引文 | 理由 |
|---|---|---|---|---|
| 1 | Surface Fitness/5a | −42(其余为该子项残分结构) | 「**Precondition**: 改名时投影通道失败」(全文唯一通道失联素材,无映射注释) | validation-error + session-expired 强制对零考虑零映射;规则明文缺失即 0,残分 8 |
| 2 | Completeness/1c | −18 | (同上,缺席类) | 强制对双双缺席;确认取消分支、删除×降级、loading-state 亦缺 |
| 3 | Internal Consistency/6b | −15 | Step 4「项目移回活跃区」vs Step 5「对归档项目执行删除」 | 恢复撤销了删除所需的归档态,状态链断裂 |
| 4 | Fact Alignment/4b | −32 | (全文无映射注释) | 零 required_outcomes 引用、零 source: inferred 标注(姊妹旅程均有双映射) |
| 5 | Precondition Exclusivity/3a | −10 | 「**Precondition**: 存在归档项目」(Step 3b) | 边缘前置与父步骤产物态等价,无发散前置 |
| 6 | Precondition Exclusivity/3a | −8 | 「**Precondition**: 被删项目存有布局记忆…」(Step 5c) | 前置为 happy 态子集;核心断言与 Step 5 原句重复 |
| 7 | Fact Alignment/4a+4c | −8 | 「无孤儿布局残留」「不指向已删 id」「其余项目布局不受影响」 | 未标注推理;「孤儿」为跨域新造词 |
| 8 | Completeness/1b | −8 | 「**User Action**: 察看…」(×4)+ 5c「察看其余项目与重进行为」 | 观察性动作弱;3b 与 Step 3 期望重叠 |
| 9 | Workflow Coverage/7c | −7 | UF8「『已归档会话』区:搜索 + 逐条『解除归档』」(源文) | 该 UF8 工作流全旅程族无覆盖 |
| 10 | Semantic Purity | −9 | 「healthy(对账一致)」「投影通道」「经归档行菜单/设置恢复」 | 枚举态名/设计缩略语/入口并列未消歧 |

---

## Phase 3 — Blindspot Hunt(rubric 外)

1. **[blindspot] 删除遇投影降级语义真空(产品级)**——不变量「生命周期操作(注册/改名/归档)不被投影失败阻断」忠实抄录必答④,但必答④的非阻断清单本就漏列删除:删除时投影通道失败 → 本地删除完成 + workspace 残留?残留即偏差?会话是否仍按残留 workspace 分组?PRD 与旅程均未定义。建议旅程加一条显式 edge(如 Step 5d)或标注「删除×降级 = PRD 未定义,记 open question」,否则下游契约将为该组合杜撰语义。
2. **[blindspot] 「工作台落到其余项目」与 BIZ-workbench-002 指针语义的跨文档张力**——Step 5b「工作台落到其余项目或空态,不指向已删 id」照抄 UF1;但 BIZ-workbench-002(M2)记录「移除激活项目时指针在同一事务内清空」且显式否决了 ui-design「自动激活剩余首行」口径。「落到其余项目」若被测试作者读作自动激活下一项目,将与既有实现裁决冲突(指针清空 → 空态/后续显式选择)。建议断言措辞收敛为「不指向已删 id,其余行为按激活指针语义」,或先跑 eval-consistency 对账 UF1 × BIZ-workbench-002。
3. **[blindspot] 归档会话 × 归档项目词汇碰撞**——UF8 同一设置节内既有项目归档(本旅程)又有会话归档(「已归档会话」区,UF3 ⋯ 菜单归档的唯一恢复口);本旅程 Overview 与 Step 3 的「归档」全部指项目,但测试作者在项目设置页断言时必然遇到两个归档面。旅程未声明会话归档不在 scope,也未指引其归属旅程(实际无旅程覆盖,见 7c)。
4. **[blindspot] 改名输入零约束下 validation-error 无从下手是伪命题**——UF7 数据面「项目名…可改,随时可改(左栏 ⋯ / 设置)」+ 裁决 §5.1「display_name 自由改、可重复」:改名无唯一性/格式校验语义。这意味着 validation-error 的最近似面不是「非法输入被拒」而是「空名/纯空白提交」的最小防御。旅程若补 validation-error 映射,应同时向 PRD 澄清空名行为是否已定义——当前源文静默。
5. **[blindspot] ≤2s 硬断言三处入文(Setup/不变量)而无松弛口径**——「投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)」;BIZ-workbench-005 既有纪律为「CI 计时用宽松阈值防抖动」。旅程级不声明松弛,gen-test-scripts 会产出 flaky 计时断言(姊妹报告同款盲点,在本旅程同样成立)。
6. **[blindspot] 恢复操作的投影语义仅单向声明**——Step 4「投影不变化(workspace 未移除,会话分组保持)」正确,但未断言恢复**不产生新的投影写**(即恢复是纯 forge 侧状态迁移)。若实现将恢复实现为「workspace 重排序/重写」,断言「投影不变化」措辞不足以拦截;建议明确「不触发投影写操作」的可观察等价断言(如投影写时间戳不变)。
7. **[blindspot] 双应用观察通道未提示**——多处断言落在 dsh 原生 UI 侧(「dsh 侧 workspace 同名(断言)」「会话仍按该项目 workspace 分组(断言)」);项目真链路验收依赖 live-ui 探针(scripts/acceptance/live-ui-{probe,sweep}.mjs)对真实 userData 的操控。旅程 Setup 只说「测试可操控 dsh 侧数据面」,未提示断言通道,契约/脚本阶段有静默走错面(仅断言 forge 侧镜像数据)的风险。

---

## Attack List(修订优先级)

1. **[Surface Fitness]** 强制 outcomes 对完全未考虑——全文无任何 `<!-- surface-web required_outcomes 映射 -->` 注释(姊妹 task-session-roundtrip/project-workbench-home 均有双映射 + `source: inferred`)——必须补两条映射:validation-error → 改名/删除确认对话的输入与取消边界(空名防御、取消零残留);session-expired → 宿主/投影通道失联 mid-workflow 的呈现与恢复(Step 1b/2b 已是最近似面,补声明即可)。
2. **[Internal Consistency]** Step 4→5 状态矛盾——「**Expected Result**: 项目移回活跃区」之后接「**User Action**: 对归档项目执行删除」——改为二选一:Step 5 走显式删除路径(「对当前活跃项目经确认对话显式删除」,必答⑤「删除(归档态或显式)」有据),或在 Step 4/5 之间声明再归档;并把 5c 的「被删项目」绑定到具体删除路径。
3. **[Completeness]** 删除确认对话取消分支缺失——不变量「删除必经确认对话」从未验证对话取消——补 Step 5 变体(取消 → 项目与投影零变更、布局记忆保留)。
4. **[Workflow Coverage]** UF8「已归档会话」区工作流全旅程族无覆盖——本旅程为 UF8 宿主——补会话归档恢复步骤/edge,或在 Overview 显式声明其归属另一旅程并确保该旅程存在。
5. **[Precondition Exclusivity]** Step 3b 前置不发散(「存在归档项目」= Step 3 产物态)、Step 5c 前置为 happy 子集且断言与 Step 5 重复——为 3b 换发散前置(如「归档项目 ≥1 且工作台处于另一活跃项目」,考察跨项目呈现),5c 收敛为 Step 5 断言的细化注记或独立化为「重进其余项目」的可执行动作。
6. **[Fact Alignment]** 未标注推理与跨域新造词——「无孤儿布局残留」「不指向已删 id」「其余项目布局不受影响」——补 `source: inferred` 与推理依据,或改写为源文可溯措辞(PRD 数据要求「布局记忆:按项目存储…项目删除时随之清除」)。
7. **[Completeness]** 删除×投影降级未定义——不变量非阻断清单只列「注册/改名/归档」——补 Step 5 edge(删除时通道失败的行为)或显式标注 PRD open question,防下游契约杜撰语义。
8. **[Semantic Purity/Workflow Coverage]** 观察性动作动词——「**User Action**: 启动/刷新触发对账,察看 forge 侧」「察看左栏全项目树归档分区与工作台」「察看其余项目与重进行为」——将 5c 的「重进行为」具体化为可执行动作(重进某其余项目并断言其布局恢复),并为察看类步骤补驱动的用户决策分支。

---

*Iteration 1 verdict: **FAIL(921/1150 < 975;Surface Fitness 82 < 90 为唯一低阈维度)**。修复主线:①补 surface-web 强制 outcomes 双映射 + source: inferred 标注纪律(攻 1,可回收 ~35 分);②修 Step 4→5 状态矛盾(攻 2,回收 ~15 分并使金路径字面可执行);③补确认取消/删除×降级/UF8 已归档会话三个边界(攻 3/4/7,回收 ~20 分)。三项落地后预计 990+,需 iteration 2 复评。*
