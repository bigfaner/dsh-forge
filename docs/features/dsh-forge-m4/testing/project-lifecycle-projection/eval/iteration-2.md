# Journey Eval Report — iteration 2

- **Target**: `docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md`(REVISED;只评页面上现存内容)
- **Rubric**: `skills/eval/rubrics/journey.md`(1150 分 / 7 维度,target 975,每维度下限见阈值表)
- **Scorer context**: `gen-journeys/rules/surface-web.md`(SURFACE_TYPE=web;强制 outcomes = validation-error + session-expired;策略 50/50);`docs/business-rules/` 全量(workbench BIZ-001/002/005/006-M4 等、coexistence、resilience、sot-migration、task-operations、privacy);`prd/prd-user-stories.md`(Story 5)+ `prd/prd-spec.md`(必答④⑤/性能/数据要求)+ `prd/prd-ui-functions.md`(UF1/UF3/UF8);实现侧对拍物:`ui/workbench-layout-v2.md` §8.1 裁决 #25、`tasks/1.4`/`tasks/3.5` 及其 records、`regression-inventory.md` 开放项 E/F、`manifest.md` UF8 行
- **Date**: 2026-09-30 · **Iteration**: 2(前一报告:`eval/iteration-1.md`,921/1150 FAIL)

## Verdict

| | Score | Threshold | Pass |
|---|---|---|---|
| **Total** | **1063 / 1150** | ≥975 | ✅ **PASS** |
| 1. Completeness | 187 / 200 | ≥120 | ✅ |
| 2. Semantic Purity | 185 / 200 | ≥120 | ✅ |
| 3. Precondition Exclusivity | 141 / 150 | ≥90 | ✅ |
| 4. Fact Alignment | 141 / 150 | ≥90 | ✅ |
| 5. Surface Fitness | 129 / 150 | ≥90 | ✅(iteration-1 唯一低阈维度,已修复) |
| 6. Internal Consistency | 141 / 150 | ≥90 | ✅ |
| 7. Workflow Coverage | 139 / 150 | ≥90 | ✅(Golden Path veto 未触发) |

**结论**:iteration-1 的两大失败面(总分 921 < 975;Surface Fitness 82 < 90)均已实质修复且经逐项复核(见 Phase 1 修复核验表)。修订同时引入了以 Step 1e 为中心的新纯度/事实债与一处「设置节容器 × 已交付面」的漂移张力(详见新问题),但均在中度扣分范围,不构成阈值风险。

---

## Phase 1 — Reasoning Audit(pre-score anchors)

### 1a. Iteration-1 问题修复核验(逐项)

| # | iter-1 问题 | 复核结论 | 证据 |
|---|---|---|---|
| 1 | 强制 outcomes 对零映射(Surface 5a 8/60) | **已修** | 两条映射注释齐备且带完整推理链:`<!-- surface-web required_outcomes 映射:session-expired → …(Step 1b/2b);source: inferred(…× 必答④降级承诺…) -->`、`<!-- …validation-error → …(Step 2c)…(Step 5d);source: inferred(…× UF8「删除必须经确认对话」× 即时校验不静默基线) -->`;达到并超过姊妹旅程标准(task-session-roundtrip 双映射、project-workbench-home 双映射) |
| 2 | Step 4→5 状态矛盾(6b −15) | **已修** | Step 5 改为「对当前活跃的承载项目(Step 4 恢复后)经确认对话执行显式删除——必答⑤『删除(归档态或显式)』的显式支路」;归档态支路独立为 Step 5b(前置「不经 Step 4 恢复」显式发散);字面执行链闭合 |
| 3 | 删除确认取消分支缺失 | **已修** | Step 5d 新增:「对话关闭,零变更——项目条目/workspace/会话分组/布局记忆全部保持,不发起任何投影写(source: inferred…)」 |
| 4 | 零 source: inferred(4b 18/50) | **已修** | 5 处内联标注(Step 5/2c/5c/5d/5e)+ 2 条映射注释,全部含推理依据(规则 × 源文) |
| 5 | Step 3b 前置不发散(3a −10) | **已修** | 前置改为「存在归档项目,**且当前工作台活跃项目为另一项目**」,考察跨项目呈现;期望结果不再与 Step 3 双写 |
| 6 | Step 5c 前置为 happy 子集 + 断言重复(3a −8) | **基本已修** | 断言去重(5c 只断「其余项目不受牵连」,承载项目清除留在 Step 5);残留:发散触发态(承载项目已删除)写在 User Action 而非 Precondition(见 3c 扣分) |
| 7 | 未标注推理 + 「孤儿」新造词(4a/4c −8) | **已修** | 「无孤儿布局残留」措辞已删;「不指向已删 id」(Step 5)、「不牵连其余项目」(5c)均补 `source: inferred` + 推理依据(后者引 PRD 数据要求原文) |
| 8 | 观察性动作动词(1b −8) | **已修** | 1b 补「点击『重试投影』」;1c/1d 补「启动/刷新触发对账…展开偏差明细」;3b 补「定位归档分区,展开归档行菜单」;5c 改为可执行动作「重进该其余项目」 |
| 9 | UF8「已归档会话」区全旅程族无覆盖(7c −4) | **已修(引入新债)** | Step 1e 新增;引用核验:`ui/workbench-layout-v2.md` §8.1 #25-⑥「已归档会话解除归档入口随设置页裁撤暂缺,实现期归宿」+ `tasks/1.4:52`「归档会话恢复入口 = 上游原生设置面『已归档会话』(ui-settings-unarchive-sessions),M4 零代码(#25-⑥ 实现期归宿,任务期核对)」+ `tasks/records/3.5` Notes「已归档会话恢复 = 上游原生设置面零 M4 代码(实现注记)」——引用真实可溯;但 Expected Result 混入实现/流程元信息(见新问题 N1),且「正式归宿」在里程碑层仍为开放项(见新问题 N2) |
| 10 | 入口并列未消歧 / 1b「曾失败」历史叙述 / 2b 触发不分类(2c −3 / 2b −1 / 3c −2) | **均已修** | Step 4「经左栏归档行菜单恢复项目(UF1:恢复/删除经行菜单)」单一入口带源;1b 前置改现态「投影处于降级态」;2b/5e 前置均区分「workspace 不可写或宿主通道不可达」两类触发 |

**判定:iteration-1 攻击清单 8 条主攻全部落地,无一条为表面粉饰。**

### 1b. 故事工作流覆盖追踪(Story 5 ground truth)

AC1(归档后会话仍按组)→ Step 3 ✅;AC2(归档分区 + 会话列表不再展示)→ Step 3/3b ✅;AC3(改名同步)→ Step 2/2b ✅;AC4(删除解投影)→ Step 5/5b/5e ✅;AC5(手改不回流仅偏差)→ Step 1c/1d ✅。**全 5 AC 覆盖**。必答⑤三操作表 + 「删除(归档态或显式)」两支路(5 显式 / 5b 归档态)显式收敛断言 ✅。必答④四段(单向/偏差/降级/不破坏)全覆盖,删除×降级缺口以 5e 补全并标注 PRD open question ✅。UF8 flow 全段对应(状态查看→重试→改名→归档→恢复/删除→已归档会话区 1e)✅。

### 1c. 内部论证健全性

Happy Path 5 步状态链:活跃(healthy)→ 改名(仍活跃)→ 归档 → 恢复(回活跃)→ 显式删除(活跃态)。每步前置均被上一步终态满足,Setup(≥2 项目、承载项目含布局记忆、其余项目另存布局记忆)支撑 5b/5c/Step 5 落点。**无断裂**。High-risk 密度:5 happy + 11 edge(1b-1e/2b/2c/3b/5b-5e)≥ 5 ✅。Golden Path 语义验证:Step 1→5 对应 Story 5 核心序列与 UF8 User Interaction Flow 生命周期段,域级操作词(打开设置/改名/归档/恢复/删除),**veto 不触发**。

### 1d. 修订引入的新问题(N1-N7,详见各维度扣分)

- **N1**:Step 1e Expected Result 约 7 成篇幅为实现出处/流程元信息(「实现归宿 = 上游原生设置面,M4 零代码(裁决 #25-⑥,任务 1.4/3.5 注记)」+ 归档面 scope 说明),用户/系统可观察结果仅一句「会话行即时回左栏项目树」。
- **N2**:「设置节容器 × 已交付面」漂移——旅程 Steps 1/1b/1c/1d 锚定「项目设置『投影与生命周期』节」(PRD UF8 Placement 原文),而旅程自身在 Overview/1e 引用的 #25 裁决语境正是「C8 设置独立页裁撤,设置各项随 GUI 逐项归宿」(§8.1 #25-⑤);已交付 UF8 归宿 = 右栏概览投影状态行 + 左栏 ⋯ 菜单 + 确认 Dialog(`tasks/3.5` AC、manifest UF8 行)。同一文档同时依赖 PRD 容器口径与实现归宿口径,未消歧投影状态/生命周期动作究竟在哪个面呈现。
- **N3**:Step 5d 前置「操作者选择取消」把动作写进前置(声明性漏)。
- **N4**:Step 5c 的发散触发态(「承载项目删除(Step 5)完成后」)在 User Action 而非 Precondition。
- **N5**:不变量③「确认后不可逆(条目删除 + **workspace 移除** + 布局记忆清除)」与 Step 5e「投影删除保留待重试…恢复后重试成功 → workspace 移除」的即时态不一致(终态与即时态混写)。
- **N6**:Step 1e「经上游原生设置面」的可达性未建立——壳内左栏 ⚙ 设置入口为 toast 占位、归宿为开放项(`tasks/records/3.5` Notes;regression-inventory 开放项 E/F)。
- **N7**:loading-state / 异步等待策略、≤2s 计时松弛口径仍未入文(iter-1 遗留)。

---

## Phase 2 — Rubric Scoring(verification stance)

### 1. Completeness(完整性)— 187/200

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 1a metadata(0-50) | 50/50 | name kebab-case ✅;`risk_level: High` 证成不变(不可逆删除 + workspace 移除 + 布局记忆清除 = data loss risk)✅;frontmatter 七字段 + 3 sources ✅;风险分类注释在场 ✅。 |
| 1b steps 字段齐全(0-80) | 76/80 | 16 步(5 happy + 11 edge)均有 User Action + Expected Result ✅;编号体系一致(1-5 + b/c/d/e,父步骤全部真实存在)✅;动作性动词修复到位 ✅。−2:Step 1e User Action「经上游原生设置面…」依赖一条未建立的导航路径(N6,可执行意图不完整);−2:Step 5d User Action「在确认对话点击取消」与前置动作句重复(字段冗余)。 |
| 1c happy + 必备派生场景(0-70) | 61/70 | happy 完整(Story 5 全 AC,~30);派生边界强:三态(1b/1c/1d)+ 通道失败(2b)+ **validation-error(2c)** + 确认取消(**5d**)+ **删除×降级(5e)** + 跨项目归档呈现(3b)+ 归档态删除支路(**5b**)+ **UF8 已归档会话(1e)** + 布局隔离(5c)(+31)。扣分:−4 loading-state 缺席(投影写入异步 ≤2s,无中间态 outcome;web 规则常见项,非强制);−3 恢复操作零 edge(如恢复一个 dsh 侧 workspace 已被手工删除的项目 = 1d × Step 4 组合);−2 degraded × deviation 并存场景未定义。 |

### 2. Semantic Purity(语义纯度)— 185/200

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 2a 自然语言非代码/正则(0-80) | 71/80 | 无 regex/选择器/断言调用 ✅;「(断言)」为项目原生词 ✅。−3:枚举态名 healthy/degraded/deviation 直接入文(UF8 域词,均带括注,可溯);−5:Step 1e Expected Result 混入实现出处元信息「实现归宿 = 上游原生设置面,M4 零代码(裁决 #25-⑥,任务 1.4/3.5 注记)」——任务编号/裁决号/代码量为过程元数据,非用户可观察事实(N1);−1:「宿主通道不可达」为设计缩略语(2b/5e)。 |
| 2b 前置条件为声明式(0-60) | 58/60 | 11 条 edge 前置全部为状态声明 ✅(1b 已由「曾失败」改现态「处于降级态」)。−2:Step 5d 前置「删除确认对话已弹出,**操作者选择取消**」内嵌动作(N3)。 |
| 2c 步骤无实现耦合(0-60) | 56/60 | 步骤均为用户级动作 ✅;恢复入口已消歧并带 UF1 源 ✅;期望结果呈两侧系统级事实 ✅。−3:Step 1e 的「上游原生设置面」「M4 零代码」为实现范围耦合(N1/N6);−1:「workspace 未移除」存储层措辞(域词,轻)。 |

### 3. Precondition Exclusivity(前置条件互斥性)— 141/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 3a 各 Step 族前置互斥(0-60) | 57/60 | Step 1 族四分支互斥:healthy(对账一致)/ 1b(降级)/ 1c-1d(手改偏差,事实类型二分)/ 1e(对象不同 = 会话)✅;2/2b/2c(通道正常/失败/非法输入)三分互斥 ✅;3 vs 3b(本台归档动作 vs 跨项目呈现,活跃项目不同)✅;5 族四分支(显式删除/归档态/取消/通道失败)两两互斥 ✅。−3:Step 5c 前置「其余活跃项目存有布局记忆」为贯穿性 Setup 常态(删除前即成立),族内分支选择实际依赖 User Action 中的时序标记,前置自足性不足(N4)。 |
| 3b 前置足以唯一选择 Outcome(0-50) | 46/50 | 三态机给定对账事实即可定态 ✅;2/5 族时间窗与对象清晰 ✅。−4:degraded(投影写入失败)× deviation(dsh 手改)并存时呈现何态未定义——UF8 enum 为单值,旅程未声明优先序(iter-1 遗留)。 |
| 3c 错误/边界 Outcome 无缺前置(0-40) | 38/40 | 11/11 edge 均有显式前置且描述触发事实(2b/5e 已区分「workspace 不可写或宿主通道不可达」两类触发)✅。−2:Step 5c 的触发态「承载项目已删除」未入前置(仅「其余活跃项目存有布局记忆」),单独读前置不足以判定该 outcome 何时适用(N4)。 |

### 4. Fact Alignment(事实依据)— 141/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 4a 事实声明可溯(0-60) | 56/60 | 逐条核验:Step 1-5 主干 = 必答⑤表 + Story 5 AC + UF1/UF8 Validation 原文(近逐字);1b/1c/1d = UF8 States + 必答④;5b 双支路收敛 = 必答⑤「删除(归档态或显式)」单行语义;5e「快照/挂接等自有数据级联随清」= BIZ-workbench-001「移除注册仅级联清除快照/挂接等自有数据」;**Step 1e 的 #25-⑥ / 任务 1.4/3.5 注记经 grep 实证存在**(workbench-layout-v2 §8.1 #25-⑥、tasks/1.4:52、tasks/records/3.5 Notes);不变量 6 条全部可溯。扣分:−2 Step 1e 以定式断言「实现归宿 = 上游原生设置面」而里程碑层 `regression-inventory.md` 开放项 F 记录「『已归档会话』的恢复面(C8 设置页裁撤后)**未落正式归宿**——与 E 的设置面归宿同批裁决」,且 tasks/1.4 原文自带「任务期核对」限定——确定性超出记录链;−2 Step 3b「归档分区在**任何活跃项目**的左栏全项目树中均呈现」标 `(UF1)`,但「任何活跃项目下均呈现」系由「全项目树为应用级」推得,未标注推理。 |
| 4b 推理声明有规则支撑 + source: inferred(0-50) | 47/50 | 5 处内联 source: inferred(Step 5 指针语义 × BIZ-workbench-002、2c、5c、5d、5e)+ 2 条映射注释均含「规则强制项 × 源文」完整推理链,达到姊妹旅程最佳标准(project-workbench-home 同款写法)✅。−3:不变量④将 5e 的补全口径升格为旅程法则(「删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)」),open question 标注仅存于 5e 步内,不变量行未随注——下游若只读不变量会把推补口径当 PRD 事实。 |
| 4c 无未分类幻觉声明(0-40) | 38/40 | 主动猎杀:「孤儿布局残留」新造词已删;全部新边界步骤有源或已标注;#25-⑥ 引用真实。−2:session-expired 映射注释尾部「无数据丢失」为超出必答④原文的扩展主张(降级期改名本地生效确无丢失,但「无数据丢失」作为该面的一般性承诺无源文出处),虽处 inferred 注释内,属未单独分类的增强声明。 |

### 5. Surface Fitness(Surface 适配)— 129/150 ✅(iter-1 82 → 修复)

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 5a 强制派生 Outcomes 齐备(0-60) | 55/60 | **validation-error:在场且成步骤**——Step 2c(空名/纯空白 → 即时校验提示、留在编辑态可修正)满足规则断言三件套(error near field / not submitted / correct & retry);Step 5d(确认取消 → 零变更)补确认边界;映射注释含推理链 ✅。**session-expired:在场**——映射注释声明「桌面壳无独立登录会话,最近似面 = 宿主/投影通道失联 mid-workflow,映射为 Step 1b/2b 降级态呈现」,与姊妹旅程适配写法一致,降级提示 + 手动重试 + 恢复后一致 ✅。−5:validation-error 面仅空名/纯空白一种(有据:改名无唯一性/格式校验语义),映射注释未声明该面为有意收窄,测试作者无从判断是否还需边界长度等输入面;删除确认对话作为 validation 面承载取消分支属最近似面,注释已声明,可接受。 |
| 5b 测试策略比例 50/50(0-50) | 45/50 | Contract 级素材密度优秀:三态矩阵 + 偏差双例 + 校验 + 取消 + 删除×降级 + 跨项目呈现 + 隔离断言;Journey 级主线完整(1→5 全生命周期 + 归档/显式两删除支路)≈ 均衡 ✅。−3:11 edge vs 5 happy 偏 contract 侧,1c/1d 仍以「展开明细」类断言为主;−2:两级取用边界未声明(哪些 outcome 服务 contract、哪些服务 journey smoke 需读者自切)。 |
| 5c 环境与执行假设现实性(0-40) | 29/40 | 浏览器交互假设总体现实(设置节/状态呈现/左栏树/行菜单/确认对话均可 DOM 断言)✅;双应用观察口径与 SC3 纪律一致 ✅;Setup 的 dsh 侧数据面可控(fixture)✅。扣分:−3 Steps 1/1b/1c/1d 锚定「项目设置『投影与生命周期』节」,而已交付 M4 面(裁决 #25-⑤ + `tasks/3.5` AC)将 UF8 各项归宿为**右栏概览投影状态行 + 左栏 ⋯ 菜单 + 确认 Dialog**,设置独立页已裁撤——字面选择器将落空(PRD 侧 Placement 未随 #25 回写为根因,旅程未消歧,N2);−3 无 loading/wait 策略线索(投影写入异步;web 规则明文要求异步操作有等待策略而非固定超时,N7);−3 ≤2s 硬断言入文无松弛口径(BIZ-workbench-005「CI 计时用宽松阈值防抖动」既有纪律,N7);−2 Step 1e 依赖「上游原生设置面」而壳内 ⚙ 入口为 toast 占位、归宿开放(regression-inventory E/F),导航可达性未建立(N6)。 |

### 6. Internal Consistency(一致性)— 141/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 6a Invariants 全程成立(0-60) | 57/60 | ①归档≠删除 ✅(3 保留 / 5·5b 移除,无违反);②单向投影 ✅(1c/1d/2c/5d 四处显式不回流/不发起写);③删除必经确认 ✅(5/5b/5e 均经确认对话,5d 取消零变更);④降级承诺——注册 scope 已注记由注册旅程承载,删除补全口径已标 Step 5e 来源 ✅;⑤不破坏 ✅;⑥≤2s 无矛盾 ✅。−3:不变量③「确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除)」与 Step 5e 降级时序冲突——确认后即时态为「本地删除生效,**投影删除保留待重试**」,workspace 移除发生在重试成功后;不变量括注把终态写成确认的即时结果,未区分即时态/终态(N5)。 |
| 6b 跨步骤引用一致(0-50) | 44/50 | iter-1 主扣(Step 4→5 断链)已修:Step 5「(Step 4 恢复后)」显式绑定;5b「不经 Step 4 恢复」显式分支;5c「承载项目删除(Step 5)完成后」+「(Step 5 断言)」绑定;Setup ≥2 项目支撑 5b/5c/Step 5 落点;1b↔2b↔5e 降级语义同构 ✅。−4:设置容器口径内部张力(N2)——Overview/1e 引用的 #25 语境即「设置独立页裁撤、各项逐项归宿」,而 Steps 1/1b/1c/1d 仍在「项目设置『投影与生命周期』节」上操作,文档未声明投影状态/生命周期动作的最终呈现容器,读者无法判定两口径谁是现行;−2:Step 1e 编号挂 Step 1 族(设置节)而动作面已离开设置节(上游原生设置面),族归属与动作面错位(编号体系一致性小伤)。 |
| 6c 风险级别与内容一致(0-40) | 40/40 | High = 不可逆删除(条目删除 + workspace 移除)+ 数据销毁(布局记忆 + 快照/挂接级联)+ 归属变更(会话退未分组),证成直接;恢复(可逆)混排不稀释整体判级。 |

### 7. Workflow Coverage(工作流覆盖度)— 139/150(veto 未触发)

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 7a Golden Path 存在(0-60,veto) | 58/60 | 连续 5 步语义验证通过:查看投影状态 → 改名 → 归档 → 恢复 → 显式删除,对应 Story 5 核心序列与 UF8 User Interaction Flow;域级操作词,零 API 描述;状态链经 5b 分支补全后**字面可执行**(iter-1 −5 已回收)。−2:Step 1 的容器锚点(设置节)相对已交付面(概览状态行 + 左栏 ⋯ 菜单)过时,金路径第一步的表面定位需在脚本期重映射(N2)。 |
| 7b 多步覆盖深度(0-50) | 44/50 | 深覆盖:完整实体生命周期(改名→归档→恢复→删除,删除双支路)、四实体交互(项目 × workspace × 会话分组 × 布局记忆)、三态机、错误恢复链(降级→重试→两侧一致)、校验/取消边界。iter-1 三缺口已补其二(删除×降级 → 5e;改名输入边界 → 2c)。−4:恢复操作仍零 edge(恢复 × dsh 侧 workspace 已手工删除 = 1d 偏差 × Step 4 组合,行为未探);−2:degraded × deviation 并存未探。 |
| 7c 对照 PRD/Design 工作流完备(0-40) | 37/40 | Story 5 全 5 AC ✅;必答④四段全覆盖 ✅;必答⑤表 + 双删除支路 ✅;UF1 归档分区(3b)✅;**UF8「已归档会话」区工作流已覆盖(1e)——iter-1 全旅程族缺口闭合** ✅;删除×降级已定义并标注 open question ✅。−2:覆盖声明锚定的「设置『投影与生命周期』节」容器与已交付面漂移,脚本期需重对齐(N2 的覆盖面投影);−1:UF8「归档语义说明(归档≠删除)」static copy 仅 Step 1 happy 断言,无降级/偏差态下的呈现稳定性断言(轻)。 |

---

## Deduction Log(汇总)

| # | 维度 | 扣分 | 引文 | 理由 |
|---|---|---|---|---|
| 1 | Surface/5c | −3 | 「打开项目设置『投影与生命周期』节」(Steps 1/1b/1c/1d) | 容器锚点 vs 已交付面(#25-⑤ + tasks/3.5 概览状态行/左栏 ⋯ 菜单)漂移,字面选择器落空 |
| 2 | Semantic/2a+2c | −8 | 「实现归宿 = 上游原生设置面,M4 零代码(裁决 #25-⑥,任务 1.4/3.5 注记)」(Step 1e) | Expected Result 混入实现出处/任务编号元信息,非可观察结果(N1) |
| 3 | Internal/6b | −4 | Overview「经上游原生设置面承载(Step 1e)」vs Step 1「项目设置『投影与生命周期』节」 | 同文档并存 PRD 容器口径与 #25 实现归宿口径,未消歧(N2) |
| 4 | Fact/4a | −2 | 「实现归宿 = 上游原生设置面,M4 零代码」 | regression-inventory 开放项 F「未落正式归宿」+ tasks/1.4「任务期核对」——确定性超出记录链 |
| 5 | Fact/4a | −2 | 「归档分区在任何活跃项目的左栏全项目树中均呈现(UF1)」(Step 3b) | 「任何活跃项目下均呈现」为未标注推理 |
| 6 | Fact/4b | −3 | 「删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)」(不变量④) | 推补口径升格入不变量集,open question 标注未随行 |
| 7 | Internal/6a | −3 | 「确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除)」vs 5e「投影删除保留待重试」 | 终态混写为确认即时结果,与 5e 降级时序冲突(N5) |
| 8 | Precondition/3a+3c | −5 | 「**Precondition**: 其余活跃项目存有布局记忆」/「承载项目删除(Step 5)完成后」(5c,时序标记在 Action) | 触发态未入前置;前置为 Setup 常态,自足性不足(N4) |
| 9 | Precondition/3b | −4 | (degraded × deviation 并存未定义) | UF8 enum 单值,优先序未声明(iter-1 遗留) |
| 10 | Surface/5c | −3+−3+−2 | 「投影操作 ≤2s」/ Step 1e「经上游原生设置面…」 | 无 wait 策略;计时无松弛口径;上游设置面可达性未建立(N6/N7) |
| 11 | Completeness/1c | −4−3 | (loading-state 缺;恢复零 edge) | 异步中间态 outcome 缺席;恢复×偏差组合未探 |
| 12 | Semantic/2b+1b | −4 | 「**Precondition**: 删除确认对话已弹出,操作者选择取消」(5d) | 前置内嵌动作 + 字段重复(N3) |
| 13 | Fact/4c | −2 | 「…两侧一致,无数据丢失」(session-expired 映射注释) | 「无数据丢失」为超出源文的一般性承诺,未单独分类 |
| 14 | Surface/5a | −5 | 「改名输入为空名或纯空白」(2c,唯一 validation 面) | 有意收窄未在映射注释声明,测试作者无从判断面边界 |

---

## Phase 3 — Blindspot Hunt(rubric 外)

1. **[blindspot·重要] PRD UF8 Placement 未随 #25 回写 → 全旅程族容器错锚(产品/文档管线级)**——PRD prd-ui-functions.md UF8 仍写「/p/:projectId/settings · 项目设置『投影与生命周期』节」(page map 亦保留该路由),而 #25-⑤ 裁撤设置独立页、tasks/3.5 已按「概览投影状态行 + 左栏 ⋯ 菜单 + 确认 Dialog」交付验收。本旅程忠实于 PRD(管线纪律正确),但 gen-test-scripts 将按设置节生成选择器而落空。建议:旅程加一行容器消歧注记(「PRD UF8 Placement 为 #25 前口径;已交付面 = 概览状态行 + 左栏 ⋯ 菜单,PRD 对账记 open question」),或先跑 eval-consistency 修 PRD。
2. **[blindspot] Step 1e 的「上游原生设置面」在壳内无导航路径**——左栏 ⚙ 为 toast 占位、设置为归宿开放项(regression-inventory E/F);e2e 若无法经 UI 到达上游原生设置,只能经 dsh 侧真链路探针(live-ui-probe 纪律)操作。旅程未提示断言/操作通道,脚本期有静默走错面风险(iter-1 盲点 7 的 1e 特化)。
3. **[blindspot] loading-state 与异步等待策略缺位(iter-1 盲点,未修)**——投影写入为异步(≤2s 预算 + 降级态的存在即为证据);web 规则要求「appropriate wait strategies, not fixed timeouts」。全文无中间态 outcome、无等待策略线索;建议补 Step 2/5 的 pending/loading 呈现或在 Setup 声明等待口径。
4. **[blindspot] ≤2s 硬断言三处入文无松弛口径(iter-1 盲点,未修)**——BIZ-workbench-005「CI 计时用宽松阈值防抖动」;不变量⑥原样照抄会产出 flaky 计时断言。
5. **[blindspot] Step 4「投影不变化」缺可观察等价断言(iter-1 盲点,未修)**——若实现把恢复做成 workspace 重写,现措辞拦不住;建议补「不触发新的投影写」的可观察代理(如投影写时间戳/重试入口不出现)。
6. **[blindspot] degraded × deviation 并存优先序**——workspace 不可写期间 dsh 侧又被手改,UF8 enum 单值无定义;旅程与 PRD 均静默,下游契约将被迫杜撰。
7. **[blindspot] 2c「不发起投影写、两侧零变更」的断言通道**——「未发起写」是反事实断言,e2e 只能经代理观察(workspace 名不变/无降级态出现);脚本期需具体化,旅程可预先给出可观察面。

---

## Attack List(残留弱点,按回收价值排序)

1. **[Surface Fitness/Internal Consistency]** 设置容器漂移——「打开项目设置『投影与生命周期』节」vs Overview「经上游原生设置面承载(Step 1e)」(#25 语境)——加容器消歧注记或对账 PRD,四步 + 金路径首步的表面锚点即可对齐已交付面(可回收 ~8 分)。
2. **[Semantic Purity/Fact Alignment]** Step 1e Expected Result 元信息污染——「实现归宿 = 上游原生设置面,M4 零代码(裁决 #25-⑥,任务 1.4/3.5 注记)——…两个归档面,互不混淆」——将实现出处/scope 说明移入步骤注记或 HTML 注释,Expected Result 只留「会话行即时回左栏项目树(+ 搜索命中)」;「实现归宿」降格为「实现期归宿(task 1.4/3.5 注记),正式归宿 = regression-inventory 开放项 F」(~6 分)。
3. **[Internal Consistency]** 不变量③终态混写——「确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除)」——改为「确认后不可逆;终态 = 条目删除 + workspace 移除 + 布局记忆清除(通道失败时 workspace 移除经重试达成,Step 5e)」(~3 分)。
4. **[Precondition Exclusivity]** Step 5c 触发态入前置——「承载项目删除(Step 5)完成后」应进 Precondition;顺带修 5d 前置去动作化(~5 分)。
5. **[Completeness/Surface Fitness]** loading-state + wait 策略 + ≤2s 松弛口径三件套缺位——补一条 pending 态 outcome 或 Setup 等待口径注记(~7 分)。
6. **[Workflow Coverage]** 恢复零 edge——补 Step 4b(恢复 × dsh 侧 workspace 已手工删除 → 恢复后偏差提示,不自动重建/不反向写)(~4 分)。
7. **[Precondition Exclusivity]** degraded × deviation 并存优先序声明(一句即可:「并存时按 deviation 呈现,降级重试入口保留」或标注 PRD open question)(~4 分)。

---

*Iteration 2 verdict: **PASS(1063/1150 ≥ 975;全部 7 维度过阈,Surface Fitness 129 ≥ 90 修复确认)**。iteration-1 全部 8 条主攻已实质落地并逐项复核;残留弱点以 Step 1e 元信息污染与设置容器漂移为首,均为中度、可在一次小修内回收 ~35 分。若进入 iteration 3,按 Attack List 1/2/3 处理即可接近满分段;亦可选停并经 gen-contracts 阶段的契约前置核对兜底容器漂移。*
