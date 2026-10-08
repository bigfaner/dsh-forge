# Journey Evaluation Report — iteration 1

- **Journey**: `blitz-direct-chain`（feature `dsh-forge-m3-bootstrap-presets`，surface `web`）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度 / 门槛 975 且每维度过线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **日期**: 2026-10-08

## 结论

**总分 866 / 1150 —— 未过门**（需 975 且每维度 ≥ 最低线）。**Surface Fitness 69/150 低于最低线 90**，为唯一破线维度；总分亦不达 975。核心失分根因一个：Web 强制派生 Outcome（validation-error / session-expired）无显式在场、无不适性记账、无 `source: inferred` 标注（该根因在三个维度分面计罚，见跨维度核验）。独立事实问题两处：Edge 2b 断言了源文档不存在的派发守卫；Edge 4c 的「无锁竞争」为未标注推理。

| 维度 | 得分 | 最低线 | 结果 |
|---|---|---|---|
| 1. Completeness | 144/200 | 120 | 过 |
| 2. Semantic Purity | 153/200 | 120 | 过 |
| 3. Precondition Exclusivity | 132/150 | 90 | 过 |
| 4. Fact Alignment | 92/150 | 90 | 过（贴线） |
| 5. Surface Fitness | 69/150 | 90 | **破线** |
| 6. Internal Consistency | 140/150 | 90 | 过 |
| 7. Workflow Coverage | 136/150 | 90 | 过 |
| **合计** | **866/1150** | **975** | **未过** |

---

## Phase 1 — 推理审计（评分前锚点）

1. **问题→方案契合：良好。** Journey 忠实抽取 PRD Story 2（三条 AC → 5 个 happy step）+ 业务流程二（四步全部落位）+ 关键场景 1，Overview 溯源链「（PRD Story 2；关键场景 1；业务流程二；SC4）」四锚全部实存且内容吻合（本次评审已逐条核对 prd-user-stories / prd-spec / proposal）。
2. **证据→方案支撑：强，但有两处越界。** 绝大多数 Expected Result 可逐句对回源文档（多处近逐字）。越界处：Edge 2b「打回期间不派发」断言了一个任何源文档都未定义的提案状态→派发守卫（Story 4A 的派发按钮亮灭条件 = 任务终态，与提案状态无关）；Edge 4c「无锁竞争」为对存储内部的推理，无源可溯且无标注。
3. **成功判据有效性：中。** Step 5 的「（或断言通道）」悬空了验证通道；Edge 1b 以「检查库中字段」为 User Action（web surface 下不可直接执行）；Edge 3b 一个前置捆绑两条逃生路径。
4. **自相矛盾：未发现。** 四条不变量在全部步骤成立；跨步引用（Step 2→Step 1 提案、Edge 2c→Step 2 accepted）无悬空；High 风险与内容（状态变更 + 不可逆 git 提交）一致；edge 数 7 ≥ happy 数 5 满足 High 密度。

---

## Phase 2 — 维度评分（对抗核验立场）

### 1. Completeness（完整性）— 144/200

**元数据完整（50/50）**
- name `blitz-direct-chain` 合 kebab-case；`risk_level: High` 合法且由内容正当化（提案/任务状态变更 + git 提交不可逆）；`golden_path: false` 与特性级指定（`expedition-full-sdd-chain` 为 true）一致；sources 三件实存；模板字段全数在场。无扣分点。

**Step 必备字段齐全（66/80）**
- 5 happy + 7 edge 共 12 步，每步均有 User Action + Expected Result，顺序连贯，edge 编号（1b/2b/2c/3b/4b/4c/5b）全部锚回 happy step。
- 扣 5：Step 5 动作通道悬空——「**User Action**: 单人开发者（或断言通道）枚举突击会话全程的技能清单」。「或断言通道」未指明通道是什么（web UI 何处可见技能清单？spike 实证用的是工具面 dump 而非 UI）；下游执行者无法确定执行手段。
- 扣 4：Edge 1b 动作为库级检查——「**User Action**: 检查库中该提案行的 mode 溯源字段」。web surface 的 journey 里这不是用户可执行动作，等效断言的用户面载体（提案子 tab mode chip）未被采用。
- 扣 3：Edge 4c 单一 Expected Result 捆绑多个独立断言（「无锁竞争」+「单次重取即见新值」+「无 watch / 无同步延迟」），下游无法拆分为可独立判定的 Outcome。
- 扣 2：Step 4 的「User Action」主语是 worker（系统协作者）而非用户——PRD 角色注记允许系统侧断言，但字段名与内容错位，属可辩护的非零瑕疵。

**Outcome 覆盖 happy + 必备派生场景（28/70）**
- Happy path 完备；边界场景 7 个（溯源写入时机 / 打回 / 误建 feature 行反证 / 受阻逃生 / AC 拒绝 / 并发浏览 / 规格技能请求），密度与多样性良好。
- 但 Web surface 强制派生 Outcome（surface-web.md「must be considered for every Web Journey」）**无显式处置**：`session-expired` 完全缺席（无任何会话中断/连续性场景，也无不适性说明）；`validation-error` 存在一个未标注的功能近似物——Edge 4b「拒绝且错误信息含 AC 清单……补齐证据后方可过门」语义上就是 validation-error（错误信息含具体清单、可更正重试），但它发生在 worker 工具层而非 Web 表单层，且文档未以任何形式将其识别为该类派生 Outcome。按「必须被考虑」的口径，既无派生也无不适记账，只能给低分（近似物值得少量分）。

### 2. Semantic Purity（语义纯度）— 153/200

**Outcome 自然语言、无 regex/选择器/断言调用（56/80）**
- 全文无 regex、无 CSS/XPath、无 `expect()` 调用。
- 扣分点一：验证策略括注遍布——「（断言）」「（功能断言）」「（技能枚举断言——物理边界）」「（断言——突击只有提案与任务，用户裁决 2026-10-07）」「（M2 即时口径回归）」「（M2 机制回归）」，属「如何验证」而非「观察到什么」，非孤例。
- 扣分点二：Expected Result 内嵌机制与配置术语——「toolFilter 按任务类型收窄 + agentOptions 携带 Forge设置 默认 LLM」「block_source 单事务、链深 ≤6、恢复钩子」。多为 PRD 原词（PRD 自身如此表述），不算硬违规，但对下游合同生成者是机制语言而非观察语言。

**前置条件为声明式（52/60）**
- Setup 三条均为环境状态声明 ✓；多数 edge 前置为状态（「提案处于 under-review」「某任务执行受阻」「概览页签处于打开状态」）。
- 扣 4：Edge 1b 前置是时刻而非状态——「quick-tasks 产出提案的瞬间（createProposal 落库时）」。时刻在检查发生时已过去，不可作为检查时的可判定前置；应改述为状态（提案已创建、未发生预设/溯源变更）。
- 扣 4：Edge 2b 前置夹带人类判断——「提案处于 under-review，评审发现需修订」。「评审发现需修订」是心理状态非系统状态。

**Step 无实现耦合（45/60）**
- happy step 动作总体为域级操作（发起 quick-tasks / 流转 accepted / 发起 run-tasks）。
- 扣分点：Edge 1b「检查库中该提案行的 mode 溯源字段」= 数据库查询式动作；Edge 2c「检查 feature 子 tab 与文档域」= UI 面 + 文件系统域混装；Edge 4c「tool 写入与 UI 读取无锁竞争」= 内部锁机制属性，非用户可观察现象（用户观察到的是数据新鲜，锁竞争是实现细节——按 QA 视角这是「验证实现而非行为」的耦合）。

### 3. Precondition Exclusivity（前置条件互斥性）— 132/150

**同 Step 内 Outcome 前置互异（55/60）**
- 本格式每 step 单一 Expected Result，字面无同 step 双 Outcome 碰撞；7 个 edge 前置彼此互异（创建时机 / under-review / accepted / 受阻 / 缺证据 / 浏览中 / 请求规格技能）。
- 扣 5：Edge 3b 单一前置「某任务执行受阻（无法完成）」下捆绑两条不同出口——「worker submitTask result=blocked（reason 必带）**或**经 addTask 追加逃生任务」。两条出口（blocked 结算 vs 逃生任务追加）是不同 Outcome、不同 State 变更，却共享同一触发前置；下游 gen-contracts 无法从文档恢复二者的独立判定条件。

**前置足以唯一定位 Outcome（42/50）**
- 各 edge 之间无歧义对。
- 扣 8：Happy path 全部 step 无 step 级前置（仅全局 Setup）——Step 2 依赖「提案处于可接受态」、Step 3 依赖「提案已 accepted 且任务就绪」、Step 5 依赖「突击会话已运行全程」，全部靠步骤顺序隐式推断，合同生成者需自行补全。

**错误/边界 Outcome 前置无缺失（35/40）**
- 7 个 edge 均有显式 Precondition 且指明触发态，好于同批平均。
- 扣 5：Edge 5b 的前置「突击会话运行期请求任一规格技能（如 write-prd）」把触发输入（请求技能）混进前置（应为状态：会话为突击预设且规格技能不在其物理目录），前置与 Input 未分离。

### 4. Fact Alignment（事实依据）— 92/150

**事实声明可溯源（50/60）**
- 实质溯源为同批最强档：Step 1 ↔ Story 2 AC1 近逐字；Step 2 ↔ Story 2 AC2 近逐字（含「用户裁决 2026-10-07」注记）；Step 4 ↔ Story 2 AC3 + SC7（commit_hash）；Step 3 ↔ 业务流程二第 3 步 + DF003；Edge 3b ↔ Story 5 AC4 逐字（disc-N/fix-N 二分、链深 ≤6、恢复钩子）；Edge 4b ↔ Story 7 AC1 逐字；Edge 5b ↔ 关键场景 8 后半 + Story 6（spike S6-3 实证注记同源）；Edge 1b ↔ DF006「写入时机 = 创建时」+ SC3；Edge 2b ↔ 关键场景 3（under-review → draft）；「后续会话预设变更不影响该值」↔ 关键场景 4「下游读溯源字段不读会话预设」——措辞仔细限定为「会话预设」而非人工变更，与 SC3 人工变更即时更新不冲突，无矛盾。
- 扣 10：(a) Edge 4c「tool 写入与 UI 读取无锁竞争」——「无锁竞争」在 PRD/spec/提案/宪法全文均不出现，是对存储层的生成推理，无标注；(b) Edge 2c 的「误建」反证框架（检查「不出现」）属生成推理而非源断言的直接转写，未标注。

**推理声明有规则支撑 + 标注（12/50）**
- 全文无任何一处 `source: inferred` 标注或对 surface `required_outcomes` 规则的引用；Web 强制派生既未生成也未说明不适。推理标注机制整体缺位。Edge 4b 实为 validation-error 的功能近似物，但未被识别、未被规则溯源——按本子项口径只能取低位分。

**无未分类幻觉（30/40）**
- 未发现与源文档直接矛盾或无中生有的实体/数值。
- 扣 10：Edge 2b「任务阶段未进入（打回期间不派发）」断言了一个源文档不存在的系统行为——PRD 全部文本中，派发可用性由任务终态决定（Story 4A：「当前容器存在未处于终态的任务……按钮亮起可点」），无任何「提案未 accepted 则不可派发」的守卫定义；任务在 Step 1（quick-tasks）即经 addTask 落库，非接受后才存在。若实现按 Story 4A 字面落地，该 Expected Result 会对着可亮起的派发按钮失败。属「未分类的越界断言」——若为合理推理须标注，若为事实须给出处，二者皆无。

### 5. Surface Fitness（Surface 适配）— 69/150 【破线】

**强制派生 Outcome 在场（15/60）**
- surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。
- `session-expired`：**完全缺席**——无任何会话中断/过期/连续性 Outcome，也无「本地单用户应用无会话过期概念」之类的不适性记账。本文档的链路横跨提案接受→派发→执行多环节，天然存在「中断后恢复」的本地化适配位，却完全未触及。
- `validation-error`：Edge 4b 为实质功能近似物（无效提交被拒 + 错误信息含具体清单 + 可更正重试），值得部分分；但它发生在 worker 工具层而非 Web 表单层，不满足规则语义的「error message displayed near the relevant field」断言面，且文档未以任何形式将其识别为该类派生。
- 无一处显式不适性说明。修订路径二选一：补派生 Outcome（含对 4b 的规则级识别与 Web 面断言化），或补显式不适记账 + 近似物映射声明。

**测试策略比例（32/50）**
- Web 应 50/50（Contract/Journey）。Journey-smoke 素材扎实（12 步、多实体链）；Contract 侧素材尚可（7 个 edge 各带独立前置/动作/结果，可抽取为分支 Outcome），但每 step 单一 Outcome、同 step 无分叉，Contract 层密度低于 50/50 预期。

**环境与执行假设现实（22/40）**
- 断言基大量落在库级/工具级（mode 字段、feature 行、审计、技能枚举、toolFilter）而非浏览器可观察面；本 journey 声明 surface `web` 但 12 步中明确经 Web UI 的验证仅 Step 2（提案子 tab）、Edge 2c（feature 子 tab）、Edge 4c（概览三视图）。「枚举技能清单」的 Web 可见位置未指明（PRD 亦未指明，非本文档独有，但 surface 声明与断言通道错位是本文档的责任）。「即时刷新」无 loading/异步稳定性考虑——surface-web.md 的 async handling 原则未反映。正面：toolFilter/agentOptions 断言显式移交 worker-provisioning 旅程（「worker 供给详见 worker-provisioning 旅程」），避免了跨面错配，值得肯定。

### 6. Internal Consistency（一致性）— 140/150

**不变量在每步成立（55/60）**
- 核验通过：不变量 1（gate 纪律）在 Step 4（commit_hash）/Edge 4b（验证门）成立；不变量 2（mode 溯源定语义）在 Step 1/Edge 1b 成立且「后续会话预设变更不影响该值」与 SC3 人工变更通道不矛盾（措辞已限定「会话预设」）；不变量 3（无 feature 阶段）在 Step 2/Edge 2c 成立；不变量 4（即时口径）在 Step 4/Edge 4c 成立且与宪法 BIZ-product-001/007 一致。无违反。
- 扣 5：不变量 1 的「单写路径」分项无任何步骤验证载体（声明而不测）；属声明-验证覆盖缺口而非违反。

**跨步引用一致（47/50）**
- Step 2「该突击提案」→ Step 1 产出 ✓；Step 3 任务 → Step 1 清单 ✓；Step 4「执行记录与提交哈希」与 SC7 对齐 ✓；Edge 2c 前置锚 Step 2 的 accepted ✓；Edge 4c「派发链写入动词（claim / submit）」锚 Steps 3–4 ✓；「worker-provisioning 旅程」实存 ✓。无悬空引用。
- 扣 3：Edge 1b 的时机型前置（「产出提案的瞬间」）使该步骤与 happy Step 1 的时序关系不可复核——检查动作发生在瞬间之后，文档未声明由何状态承载「时机 = 创建时」的判定（如审计行时间戳 vs 后续事件缺位）。

**风险级别与内容一致（38/40）**
- High 成立：提案状态流转、任务创建/结算、git 提交（不可逆）俱在；edge 密度 7 ≥ 5 满足。小额保留：Step 5 与 Edge 2c/4c/5b 为只读核查步，High 的权重由核心链（1–4）承担，判定无误但非零歧义。

### 7. Workflow Coverage（工作流覆盖度）— 136/150

**Golden Path 存在（veto 项，55/60）**
- veto 未触发：Steps 1→4 构成 4 步连续域级操作序列（一句话发起 quick-tasks → 提案流转 accepted → run-tasks 派发 → submit 全绿），逐条对应 PRD Story 2 核心工作流与关键场景 1，语义核验通过；步骤均为域级用户/协作者操作，无 API 级描述。`golden_path: false` 元数据与特性级指定（expedition-full-sdd-chain）一致，非缺陷。
- 扣 5：Step 5 为纯核查步（verification-only），不推进用户目标——golden-path 反模式明令禁止的形态；连续核心序列实为 Steps 1–4（已足够 3+，故不触 veto）。

**多步覆盖深度（45/50）**
- 覆盖状态转移（draft→accepted、under-review→draft、in_progress→blocked）、实体生命周期（提案+任务创建→执行→记录落账）、跨实体（任务直挂提案、feature 缺席反证）、错误恢复（fix 链/disc 逃生、AC 拒绝后补证重过门）。深度为同批上层。
- 扣 5：受阻恢复只走到 blocked 落账与逃生任务建立，「恢复钩子反查后继 blocked→pending→再派发→全绿」的续行链未走完（Edge 3b 仅以「M2 机制回归」一语带过）——SC4 的「submit 全绿」在受阻分支下无达成路径。

**对 PRD/Design 范围的完整度（36/40）**
- Story 2 三条 AC 全覆盖；业务流程二四步全落位；SC4 全要素（mode 溯源 / 无 feature 行 / 派发 / 全绿 / 即时刷新 / 物理边界）均有对应步骤。
- 扣 4：(a) 派发入口的双途细节（任务子 tab「派发」按钮的亮灭/跳转/新开语义）仅以括号带过「（或经任务子 tab「派发」入口）」，其裁决语义（v22/v23）零覆盖——已由 overview-entry-new-session 旅程分担，可接受但本文档未做分工声明；(b) 突击任务的 DAG 依赖序（Story 4A「必须按 DAG 依赖顺序领取」）在派发步无断言。

---

## 跨维度一致性核验

- 最大失分根因（Web 强制派生 Outcome 无显式处置 + 标注机制缺位）在三个维度分面计罚：Completeness（28/70）、Fact Alignment（12/50）、Surface Fitness（15/60）。这是 rubric 的分面设计（存在性 / 标注纪律 / surface 合规），非重复计罚；修订该根因（补派生或不适用记账 + 近似物映射 + 推理标注）可同时回收约 100–140 分并解除破线。
- Edge 2b 的越界守卫断言同时计入 Fact Alignment（未分类越界）与其自身可验证性（Surface Fitness 的断言通道错位一并反映），未再扩散到其他维度。
- 各维度判分互不矛盾：golden_path: false（元数据）与 Workflow Coverage 给分（veto 未触发，Steps 1–4 构成合格序列）一致；High 风险的保留意见反映在 Internal Consistency 小额扣分；Setup 三条均被步骤消费，无摆设夹具。

---

## Phase 3 — Blindspot 猎查（rubric 之外）

1. **[blindspot] 链路中断/重启语义零覆盖。** 全链横跨「接受→派发→执行→落账」多个环节，但没有任何 edge 处理中断续行——若应用在 Step 2（accepted）与 Step 3（派发）之间重启，accepted 状态与任务可派发性是否原样恢复？文档只考虑了并发（「派发链写入动词（claim / submit）发生的同时用户持续浏览概览三视图」）与 M2 的 worker 中断幂等重入（未提），用户侧/链路侧的连续性完全悬空。这恰是 session-expired 强制项的天然本地化适配位。
2. **[blindspot] 用户侧输入无任何无效边界。** Setup 假定「一个明确的小需求（一句话可表达）」恒成立；全 journey 唯一的输入校验边界在 worker 侧（Edge 4b）。一句话需求过于含糊、quick-tasks 无法结构化出提案/任务时系统行为如何，零覆盖——这是 validation-error 在本工作流用户侧的真实派生位。
3. **[blindspot] 「就绪」语义未定义导致派发断言不可判定。** Step 3 Expected Result「dispatcher 领取就绪任务并派发 worker」——「就绪」未定义（宪法 BIZ-task-004：就绪选择仅扫 pending 池、序 = 分支延续优先→priority→创建序；依赖终态守卫 = BIZ-task-002）。突击任务清单若含依赖，「领取就绪任务」应断言依赖序与越序拒绝；若全并行，断言退化为平凡。两种形态下测试脚本写法完全不同，文档未给判定条件。

---

## 修订指引（按回收分值排序）

1. **补 Web 强制派生 Outcome 或显式不适性记账**（预计 +90~130，解 Surface Fitness 破线）：优先做本地化派生——validation-error 的用户侧形态（含糊需求/quick-tasks 无法结构化，见 blindspot 2）与 worker 侧形态（将 Edge 4b 显式识别为该类派生并补 Web 面断言化表述）；session-expired 的本地形态 = 链路中断续行（blindspot 1）。若判不适，须在文档显式记录理由与近似物映射。
2. **修正 Edge 2b 的越界守卫断言**（+10~20）：「任务阶段未进入（打回期间不派发）」或给出源依据（如实现确有提案态守卫，引 db-schema/tech-design 条目），或改写为可溯源表述（如「提案回到 draft；任务保持既有状态不受打回影响」），或标注 `source: inferred` 并给出推理基础。
3. **补推理标注**（+10~15）：「无锁竞争」「误建反证框架」等生成推理补 `source: inferred` 类标注与依据。
4. **提高 Web 面可执行性**（+10~20）：Edge 1b 改为用户面断言（提案子 tab mode chip）或明确库级断言通道的执行许可；Step 5 明确技能清单的枚举通道；Edge 4c 拆分独立 Outcome 并以用户可观察语言重述。
5. **拆分 Edge 3b 双出口**（+5~10）：blocked 结算与 addTask 逃生各自成 Outcome，补独立前置；顺带把「就绪」的定义或依赖序断言补进 Step 3（blindspot 3）。
