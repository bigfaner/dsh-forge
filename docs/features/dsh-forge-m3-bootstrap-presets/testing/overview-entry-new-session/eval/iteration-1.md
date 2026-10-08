# Journey Evaluation Report — iteration 1

- **Journey**: `overview-entry-new-session`（feature `dsh-forge-m3-bootstrap-presets`，surface `web`）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度 / 门槛 975 且每维度过线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **日期**: 2026-10-08
- **对照源**（本次逐条核对）：`prd/prd-user-stories.md` Story 4A（六条 AC）、`prd/prd-ui-functions.md` UF-1 第 4 条 / UF-3 第 2·3·4·5·6 条 / UF-4 第 5 条 / 数据约束 3–7 / 消息体示例①⑤、`docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md` 派发入口 v22/v23 裁决。

## 结论

**总分 838 / 1150 —— 未过门**（975 且每维度 ≥ 最低线）。**Surface Fitness 60/150 低于最低线 90**，为唯一破线维度；总分亦不达 975。与兄弟 journey（`mode-selection-alignment`，816 分）同根因：**Web 强制派生 Outcome（validation-error + session-expired）完全缺席且无不适性说明**。本文档的事实溯源质量显著优于兄弟（几乎逐句可对回 Story 4A / UF-1/3/4 / 数据约束 5–7），但新增一处渠道语义混淆（Step 4 把任务失败诊断的模式路由括注套到 feature 子图诊断头上）与一处夹具缺口（诊断失败 toast 无可触发的失败子图夹具）。

| 维度 | 得分 | 最低线 | 结果 |
|---|---|---|---|
| 1. Completeness | 132/200 | 120 | 过 |
| 2. Semantic Purity | 168/200 | 120 | 过 |
| 3. Precondition Exclusivity | 125/150 | 90 | 过 |
| 4. Fact Alignment | 100/150 | 90 | 过 |
| 5. Surface Fitness | 60/150 | 90 | **破线** |
| 6. Internal Consistency | 128/150 | 90 | 过 |
| 7. Workflow Coverage | 125/150 | 90 | 过 |
| **合计** | **838/1150** | **975** | **未过** |

---

## Phase 1 — 推理审计（评分前锚点）

1. **问题→方案契合：强。** Journey 忠实抽取 Story 4A「打开新会话带上现状（提案/feature 渠道）」全部六条 AC → 5 happy + 8 edge，Overview 明确引用「PRD Story 4A；UF-1/UF-3/UF-4；数据约束 5–7」，来源链完整且经本次逐条核实为真。
2. **证据→方案支撑：强（本文档最大优点）。** Step 1/3/5/4c/5b/5c/5d 的 Expected Result 与 UF-1 第 4 条、UF-4 第 5 条、UF-3 第 2/3/5 条、消息体示例①⑤近乎逐词一致（含 v23 派发最小消息、五态终态集、task_session_links/claim 挂接措辞）。
3. **成功判据有效性：中。** 两处判据不可由所述 Setup 可靠触发：Step 4 的「失败 toast」 presuppose validateFeatureTasks 失败，而 Setup 只提供 blocked/rejected 任务（合法态，未必构成五类检查违规）；Step 4 的模式括注暗示突击分支可达，但工具栏「诊断」仅 feature 容器存在（UF-3 第 6 条）。
4. **自相矛盾：未发现硬性自相矛盾**；四条不变量在全部 step 成立。存在的是越界泛化（Step 4 模式括注）与冗余双写（Step 5 预述 5b/5c 内容），非矛盾。

---

## Phase 2 — 维度评分（对抗核验立场）

### 1. Completeness（完整性）— 132/200

**元数据完整（48/50）**
- name `overview-entry-new-session` 合 kebab-case；`risk_level: Medium` 为合法值；sources 三条均实存；`golden_path: false` 与特性级指定（`expedition-full-sdd-chain` 为 true）一致，非缺陷。
- 扣 2：Medium 的判级标准「Workflow involves multi-step interaction without irreversible side effects」与 Step 5 自动发送派发指令（触发 run-tasks 派发循环 → worker 执行 → 任务状态迁移与提交）存在张力——这是有实质副作用的自动化执行链，非纯交互（详见 Internal Consistency c3）。

**Step 必备字段齐全（62/80）**
- 13 个 step（5 happy + 8 edge）均有 User Action + Expected Result，结构完整，每条 Story 4A AC 均有落位。
- 扣 8：**Step 4 的失败 toast 无夹具支撑**——「**User Action**: 在任务子 tab 点工具栏「诊断」（feature 容器），在失败 toast 中点「发送给 agent」」中「失败 toast」是前置结果而非动作；Setup 仅「存在 blocked / rejected 任务（诊断场景）」，而 blocked/rejected 是任务域合法状态，不必然使 validateFeatureTasks 五类检查（派生不变量/依赖无环/Liveness/记录链完整性/拓扑可分层）任一失败。下游执行者无法从本文档构造确定性失败子图（消息体示例④的失败样例是依赖环，Setup 未提供）。
- 扣 4：Step 2 Expected Result「会话带现状上下文 + 用户意图开工」中「开工」非可观察现象；「预填内容作为消息发出（草稿未被丢弃）」的验证面（发出消息含预填全文？）未具体化。
- 扣 3：Step 4 的消息体只给了速记「（检查项 + 任务键 + 修复指引）」，未像 4c 那样给出结构化格式（UF-3 第 4 条有完整格式：`@path → 所属 → 摘要 → [阶段] → 诊断项逐行 → 请求`），两条诊断路的消息体规格深度不对称。
- 扣 3：Setup 声明「库中存在带 mode 溯源的提案（blitz 与远征各一）」中的**远征提案从未被任何 step 消费**（提案渠道的远征对齐路径无步骤）；1c 的「提案挂有多篇文档」夹具仅在 edge 自身 Precondition 声明、未入 Setup。

**Outcome 覆盖 happy + 必备派生场景（22/70）**
- Happy path 完备、PRD 边界场景覆盖扎实（8 edge：无溯源、多文档格式边界、恒远征、非失败任务无入口、blocked 诊断、全终态置灰、执行中跳转、无单任务执行入口），若 surface 为 CLI 这可达 ~50。
- 但 Web surface 的强制派生 Outcome（`validation-error` + `session-expired`，surface-web.md「must be considered for every Web Journey」）**完全缺席**：全文无任何输入校验失败场景（如用户不改预填草稿直接发送、意图空位留空发送的行为未定义）、无任何会话失效/草稿连续性场景、无一处不适性说明（本地单用户应用无会话过期的显式记账）。按 rubric 该子项只能给低分。

### 2. Semantic Purity（语义纯度）— 168/200

**Outcome 自然语言、无 regex/选择器/断言调用（63/80）**
- 全文无 regex、无 CSS/XPath、无 `expect()`；消息体格式（`@docs/proposals/<标识>/`、`/run-tasks <容器标识>`）是用户可感知的消息内容，非程序断言，合规。
- 扣分点一：Expected Result 内嵌验证策略括注——「（座位标签断言）」「（**不自动发送**）（断言）」「（只给 dispatchTask 必要信息 = contextSlug；不含所属/摘要/阶段/任务池快照/请求行）」属「如何验证/为何如此」而非「观察到什么」，全文「断言」字样出现 10+ 次，非孤例。
- 扣分点二：「会话带现状上下文 + 用户意图开工」的「开工」为机制比喻而非观察语言。

**前置条件为声明式（56/60）**
- Setup 与各 edge Precondition 均为状态声明（「经行头入口打开的提案为扫描吸收的旧提案（无溯源字段）」「当前容器有正在执行的任务（其派发会话在场）」），无过程式代码。
- 扣 4：Setup 第二条「存在 blocked / rejected 任务（诊断场景）」的括注把两类诊断场景（feature 子图诊断 / 任务失败诊断）混为一谈——既是声明式瑕疵也是夹具语义错误（blocked 任务 ≠ 子图诊断失败，见盲区 3）。

**Step 无实现耦合（49/60）**
- Step 动作均为用户级（「点行头按钮」「补一句明确意图并手动发送」「展开详情点诊断失败」）。
- 扣分点：Expected Result 引用内部机制词——「task_session_links/claim 记录」（Step 5c）、「dispatchTask 必要信息 = contextSlug」（Step 5）、「contextSlug」（不变量 3）。这些是 PRD 原词（UF-3 第 2 条、v23 裁决原文），不算硬违规，但对下游合同生成者是数据层机制语言而非观察语言（应表述为「跳转到该任务最近一次派发所挂接的会话」并保留机制词为括注佐证）。

### 3. Precondition Exclusivity（前置条件互斥性）— 125/150

**同 Step 内 Outcome 前置互异（50/60）**
- 本格式每 step 单一 Expected Result，字面上无同 step 双 Outcome 碰撞；8 个 edge 前置互斥清晰（无溯源 / 多篇文档 / 当前语境突击 / 非失败任务 / blocked 有失败记录 / 全终态 / 执行中在场 / 任意视图查入口），无歧义对。
- 扣 10：多触发分支被捆绑进单一 Expected Result而无各自前置——Step 4 的「**会话模式 = 任务容器对应模式**（feature 容器 → 远征 / 突击提案直挂任务 → 突击）」把两个互斥容器态的结果装进一个 Outcome；Step 5 的 Expected Result 同时装「按钮亮起可点（全部任务终态时置灰）」与「新开派发会话自动发送」两个不同触发的断言（前者负例已被 5b 独立成步，此处属冗余双写压窄了互斥面）。下游 gen-contracts 无法从文档恢复各分支的独立前置。

**前置足以唯一定位 Outcome（40/50）**
- 各 edge 前置互斥且充分；5b/5c/4b/4c 触发态明确。
- 扣 10：**Happy path 全部 step 无 step 级前置**（仅全局 Setup + 动作内嵌条件）。Step 4 依赖「validateFeatureTasks 失败」（失败 toast 在场）未以任何形式声明；Step 5 依赖「当前容器存在未终态任务」藏在 Expected Result 里；Step 2 依赖 Step 1 的会话与草稿在场。

**错误/边界 Outcome 前置无缺失（35/40）**
- 八个 edge 均有 Precondition 字段且指明触发态，4c 甚至给了夹具细节「（如 fix 链源任务），有失败记录」。
- 扣 5：Step 4（名义 happy）实为条件路径（仅诊断失败时可达），其触发前置（子图存在违规）未声明；1b 的「扫描吸收的旧提案」夹具未入 Setup。

### 4. Fact Alignment（事实依据）— 100/150

**事实声明可溯源（50/60）**
- 溯源质量为七个 journey 中所见最强档：Step 1 ↔ UF-1 第 4 条逐词（含「不含模式」「我的意图：」空位）；Step 3 ↔ UF-4 第 5 条；Step 5 ↔ Story 4A AC4 + v23（「`/run-tasks <容器标识>`」单行最小消息、contextSlug 唯一必要参数、废止清单五项全对齐）；5b 终态集「completed / skipped / rejected」↔ UF-3 第 2 条 + BIZ-task-001 七态机；5c「（该任务最新派发挂接·task_session_links/claim 记录）——不新建会话、不重复发送、不切模式」↔ UF-3 第 2 条逐词；4c toast 五要素 + 5s ↔ UF-3 第 5 条；5d ↔ UF-3 第 3 条；四条不变量 ↔ 数据约束 5/6/7。
- 扣 10：**Step 4 模式括注越界**——「**会话模式 = 任务容器对应模式**（feature 容器 → 远征 / 突击提案直挂任务 → 突击）」是从 Story 4A 末条 AC（blocked 任务失败诊断）与数据约束 6 的通则复制而来，但本 step 的动作是工具栏「诊断」，而 UF-3 第 6 条 / 数据约束 3 明文「突击容器**无 feature 子图「诊断」按钮**（validateFeatureTasks 为 feature 域校验）」——即本路径的突击分支不可达，模式恒远征。文档未对该收窄做任何消解或标注，「突击提案直挂任务 → 突击」在本 step 语境构成与源文档的实质性错位。

**推理声明有规则支撑 + 标注（15/50）**
- 全文无任何一处 edge/outcome 标注推理依据或引用 surface `required_outcomes` 规则；Web 强制派生（validation-error/session-expired）既未生成也未说明不适。推理标注机制整体缺位。
- 存在两处未标注推理冒充事实：Step 2「预填内容作为消息发出（**草稿未被丢弃**）」（「草稿丢弃」话题在 PRD/UF/提案全文不出现，纯生成推理）；1b「新会话不切换模式（**保持默认远征**）」（「不切换」是 UF-1 原词，「保持默认远征」由 registry 默认值推断补足，非本 journey 语境明文）。

**无未分类幻觉（35/40）**
- 未发现无中生有的声明；消息格式、终态集、例外清单均与源一致。
- 扣 5：Step 4 模式括注（见 c1）在本维度计为「与源文档存在未承认的收窄错位」而非幻觉；另 Step 2「开工」属于不可验证的模糊断言，归入未分类弱声明。

### 5. Surface Fitness（Surface 适配）— 60/150 【破线】

**强制派生 Outcome 在场（0/60）**
- surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。本文档两者**完全缺席**：无输入校验失败场景（本 journey 最接近的素材——预填草稿的「我的意图：」空位留空直接发送——未被作为边界提出）、无会话过期/连续性 Outcome、无一处显式的不适性说明。rubric 明文「Score 0 if mandatory Outcomes are completely absent」→ 0/60。
- 需说明：文档存在**近似物**——5b「按钮置灰不可点（tooltip 说明）」是状态门控反馈而非输入校验（不满足规则要求的「error message displayed near the relevant field, user can correct and retry」语义）；4b「动作区**无「诊断失败」按钮**」是负向可用性断言而非任一类强制 Outcome。均未被识别或映射为该两类 Outcome 的适配。修订路径二选一：补派生 Outcome（意图空位留空发送 → 校验反馈；草稿在导航/会话中断下的保留语义），或补显式不适性记账（本地单用户、无登录会话、预填草稿非受控表单）+ 声明近似物映射。

**测试策略比例（30/50）**
- Web 应 50/50（Contract/Journey）。本 journey 提供了扎实的 Journey-smoke 素材（13 步、每步 2–4 断言点），但 Contract 侧粒度薄：每步单一 Outcome、全部分支场景上提为独立 edge step（5/5b/5c 三步本可为一 step 三前置分叉），无同 step 多 Outcome 分叉，合同抽取后每 step 仅一场景，Contract 层可测密度低于 50/50 预期。

**环境与执行假设现实（30/40）**
- 断言基 UI 投影面（座位标签、输入框草稿、toast、按钮态）与 PRD 口径一致，Playwright 自动化可行；「不自动发送」以草稿在场断言，形态现实。
- 扣分点：(a) 4c 要求在「5s 自动消失」的 toast 内点击「发送给 agent」——时限竞态无等待策略与过期恢复路径（toast 消失后能否重开诊断）说明，Web 规则的 async handling 原则未反映；(b) Step 4/5 自动发送后的会话就绪（新会话创建→模式切换→消息落账）为异步链，无稳定性断言口径。

### 6. Internal Consistency（一致性）— 128/150

**不变量在每步成立（55/60）**
- 四条不变量逐一核验：不变量 1（预填一律不发送）在 Steps 1/3/1b/1c/3b 均显式「不自动发送」，诊断两路与派发的自动发送均在例外清单内 ✓；不变量 2（模式路由）与各 step 的模式断言无冲突 ✓；不变量 3（@path 锚 + 不含模式 + 派发例外）与 Step 1/1c/5 一致 ✓；不变量 4（派发按钮语义恒定）与 Step 5/5b/5c 一致 ✓。未发现违反。
- 扣 5：不变量 2 的表述「诊断发送与派发新会话 → 任务容器对应模式」为通则，Step 4 将其按字面套用到工具栏诊断路径（突击分支不可达）——不变量本身无错，但 step 级应用产生了文档内的语义悬空（动作域 feature 容器 vs 结果域含突击分支）。

**跨步引用一致（42/50）**
- Step 2 对 Step 1 的依赖（「在预填草稿末尾」）明确 ✓；4c 对 Setup 的 blocked 任务 ✓；5c 的派发会话身份经挂接记录锚定 ✓（优于兄弟 journey 的悬空第三会话）。
- 扣 5：Step 5 Expected Result 预述了 5b（「全部任务终态时置灰——断言」）与 5c（「当前容器无执行中任务 →」隐含跳转分支）的内容——同场景三处双写，措辞一旦漂移即成矛盾源（当前尚一致）。
- 扣 3：Setup 的「远征提案」夹具无任何 step 消费——Setup 与步骤覆盖面不对账（夹具声明了却无人用，或漏写了消费它的步骤）。

**风险级别与内容一致（31/40）**
- 文档自带判级标准：「Medium = Workflow involves multi-step interaction without irreversible side effects」。Step 5 的自动发送派发指令会触发 run-tasks 派发循环 → dispatchTask 领取 → worker 执行（任务状态迁移 in_progress、代码提交）——这是**有实质状态变更的自动化执行链**，与「无不可逆副作用」的 Medium 定义存在真实张力（git 提交与状态迁移可回退/可审计，故 High 亦非定论，但非零歧义）。若定 High，edge 数 8 ≥ happy 数 5 亦满足密度要求，不存在改级障碍。

### 7. Workflow Coverage（工作流覆盖度）— 125/150

**Golden Path 存在（veto 项，55/60）**
- veto 未触发：Steps 1→2→3→4→5 为 3+ 连续域级操作序列（提案行头打开新会话 → 补意图手动发送 → feature 行头打开新会话 → 诊断失败发送 → 派发），逐条对应 Story 4A 六条 AC，语义核验通过；步骤均为域级用户操作（点行头按钮、补意图发送、点诊断/派发），无 API 级描述。
- 扣 5：5 个 happy step 并非单一连续用户流——Step 1–2（提案渠道）、Step 3（feature 渠道）、Step 4（诊断渠道）、Step 5（派发入口）是同一 Story 下的四个独立入口子流，中间无状态承接；「连续序列」实为按 AC 排列的并行切片。

**多步覆盖深度（38/50）**
- 覆盖状态门控（亮起/置灰/跳转三态路由）、多实体交互（提案/feature/任务容器 → 会话模式路由）、负向断言（无单任务执行入口、非失败任务无诊断入口）、错误路径（诊断两路自动发送直达修复）。深度优于平均。
- 扣 12：(a) **诊断成功路径缺席**——UF-3 第 4 条「成功『子图健康 ✓』1s 自动消失」在全文无对应 step（虽不开新会话、可辩解为域外，但 Step 4 已进入诊断交互域，成功分支同一交互面却缺席）；(b) 用户不改草稿直接发送（「我的意图：」空位留空发送）的行为未覆盖——既是深度缺口也是 validation-error 的本地化适配位；(c) 派发指令发出后的会话侧响应（run-tasks 循环开启）无断言延伸（可辩解为 worker-provisioning journey 辖域）。

**对 PRD/Design 范围的完整度（32/40）**
- Story 4A 六条 AC 全覆盖（AC1=Step1、AC2=Step3、AC3=Step4、AC4=Step5、AC5=5d、AC6=4c）✓；数据约束 5/6/7 的全部条款落入步骤与不变量 ✓。
- 扣 8：(a) **「突击容器无 feature 子图诊断按钮」边界缺席**（UF-3 第 6 条 / 数据约束 3 明文，且与本 journey 的诊断域直接相关——正是消解 Step 4 模式括注错位的边界）；(b) 远征提案渠道打开新会话（对齐远征）无步骤，Setup 夹具已备；(c) 诊断成功 toast（1s）缺席（同 c2a）。

---

## 跨维度一致性核验

- 最大失分根因（Web 强制派生 Outcome 缺席）在三个维度各自计罚：Completeness（结果覆盖 22/70）、Surface Fitness（0/60）、Fact Alignment（推理标注 15/50）。这是 rubric 的分面设计（存在性 / surface 合规 / 标注纪律），非重复计罚；修订该根因可同时回收约 80–110 分。
- Step 4 模式括注错位同时影响 Fact Alignment（c1，与 UF-3 第 6 条的收窄错位）与 Precondition Exclusivity（c1，双触发分支捆绑）——合计已控制在该两维度内，Internal Consistency 仅计其不变量应用层面的悬空（-5）。
- 「诊断失败 toast 夹具缺口」同时影响 Completeness（Step 4 可执行性）与 Workflow Coverage（成功/失败两分支不对称）——按各自判据独立计罚，修订一处可双回收。
- 各维度间无相互矛盾的判分：`golden_path: false`（元数据）与 Workflow Coverage 给分（veto 未触发）一致；risk Medium 的保留意见同时反映在 Completeness（-2）与 Internal Consistency（c3）的小额扣分中。
- 与兄弟 journey（mode-selection-alignment，816 分）的评分基线对齐：同判 Surface Fitness 60/150（同根因、同结构缺陷），本文档因溯源更扎实（Fact Alignment +5）、跨步引用更干净（Internal Consistency +10）、语义更干净（Semantic Purity +8）而总分略高。

---

## Phase 3 — Blindspot 猎查（rubric 之外）

1. **[blindspot] 5s 自消 toast 的竞态与过期恢复语义缺失。** 4c 要求「失败摘要 toast（状态 + 原因 + 最近记录 + 任务键，5s 自消）」之后「再点『发送给 agent』」——点击必须落在 5s 窗口内，但 toast 过期后「诊断失败」结果能否重开（重展开详情再点一次？结果是否有缓存？）在 PRD 与本 journey 均未定义。对 e2e 这是首要 flake 源（固定 sleep vs 元素等待），对用户是失去错误信息的可达性问题。rubric 的 env-realism 条款只触及异步等待，不覆盖「过期后恢复路径」这一行为语义。
2. **[blindspot] 连续两次「打开新会话」之间的草稿碰撞未定义。** Step 1「消息输入框预填格式化上下文……且**不自动发送**」与 Step 3「输入框预填 `@docs/features/<标识>/` 开头的同构上下文」——若用户在未发送前从提案行头再点 feature 行头（或反之），第一份草稿被覆盖还是保留？新会话各持独立输入框还是会话切换共享输入框？PRD 静默，journey 通过把 Step 2（发送）排在 Step 3 之前悄悄绕开了该问题。这恰是 session-expired 强制 Outcome 的本地化适配位（未保存数据保留/警示）。
3. **[blindspot] Setup 夹具语义错误：blocked/rejected 任务 ≠ 诊断失败。** Setup「任务子 tab 容器（feature 容器 + 突击提案容器）有任务；存在 blocked / rejected 任务（诊断场景）」——blocked/rejected 是任务域合法状态（BIZ-task-001 七态机成员；blocked 是 fix 链正常形态），validateFeatureTasks 的五类检查（派生不变量/依赖无环/Liveness/记录链完整性/拓扑可分层）针对的是结构违规（如消息体示例④的 1.3→1.4→1.3 依赖环）。一个健康的 fix 链 blocked 任务五项全绿。Setup 用「blocked/rejected 任务」同时充当两类诊断的夹具，对 4c（任务失败诊断，blocked 即可）成立、对 Step 4（子图诊断失败，需构造真实违规）不成立——下游 gen-test-scripts 会据此刻出一个恒绿的 Step 4。Completeness 的扣分覆盖「动作 presuppose 状态」，此处指出的是「状态构造语义本身错误」这一独立层次。

---

## 修订指引（按回收分值排序）

1. **补 Web 强制派生 Outcome 或显式不适性记账**（预计 +80~110，解 Surface Fitness 破线）：validation-error 的本地化适配（「我的意图：」空位留空直接发送的行为定义与反馈——也是修订指引 3(b) 的同一处）+ session-expired 的本地化适配（草稿在连续入口/中断下的保留语义——盲区 2）；若判不适，须在文档显式记录理由（本地单用户、无登录会话、预填草稿非受控表单）+ 近似物映射（5b tooltip、4b 负向可用性）。
2. **修正 Step 4 模式括注的渠道收窄**（预计 +15~20）：工具栏「诊断」为 feature 容器专属 → 模式恒远征；顺带补「突击容器无诊断按钮」边界 step（UF-3 第 6 条），一次修订同时回收 Fact Alignment、Precondition Exclusivity、Workflow Coverage 三处扣分。
3. **补齐 Step 4 夹具与消息体规格**（预计 +10~15）：Setup 增加「存在结构违规的 feature 子图（如依赖环）」夹具；Step 4 Expected Result 按 UF-3 第 4 条补结构化消息体格式；消除「（诊断场景）」括注的双义。
4. **为推理声明补标注**（+10~15）：「草稿未被丢弃」「保持默认远征」补 `source: inferred` 类标注；Step 2「开工」改为可观察表述。
5. **风险级别再裁决**（+5~8）：Step 5 自动派发触发的执行链按文档自身标准更接近 High；或保留 Medium 并补一句无数据丢失/可回退的理由明示。
