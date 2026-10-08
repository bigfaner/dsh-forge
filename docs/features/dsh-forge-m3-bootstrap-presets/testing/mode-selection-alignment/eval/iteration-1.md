# Journey Evaluation Report — iteration 1

- **Journey**: `mode-selection-alignment`（feature `dsh-forge-m3-bootstrap-presets`，surface `web`）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度 / 门槛 975 且每维度过线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **日期**: 2026-10-08

## 结论

**总分 816 / 1150 —— 未过门**（975 且每维度 ≥ 最低线）。**Surface Fitness 60/150 低于最低线 90**，为唯一破线维度；总分亦不达 975。核心失分集中于一个根因（Web 强制派生 Outcome 完全缺席、且无不适性说明）与两个独立事实问题（blank 锁 UI 形态与 spike 证据的矛盾、未标注的推理声明）。

| 维度 | 得分 | 最低线 | 结果 |
|---|---|---|---|
| 1. Completeness | 133/200 | 120 | 过 |
| 2. Semantic Purity | 160/200 | 120 | 过 |
| 3. Precondition Exclusivity | 125/150 | 90 | 过 |
| 4. Fact Alignment | 95/150 | 90 | 过（贴线） |
| 5. Surface Fitness | 60/150 | 90 | **破线** |
| 6. Internal Consistency | 118/150 | 90 | 过 |
| 7. Workflow Coverage | 125/150 | 90 | 过 |
| **合计** | **816/1150** | **975** | **未过** |

---

## Phase 1 — 推理审计（评分前锚点）

对文档核心推理的独立判断，先于 rubric：

1. **问题→方案契合：良好。** Journey 忠实抽取 PRD Story 1（四条 AC → 5 个 happy step + 6 个 edge），Overview 明确引用「PRD Story 1；业务流程一「模式选择与自动对齐」；SC1」，来源链清晰。
2. **证据→方案支撑：强。** 绝大多数 Expected Result 可逐句对回 prd-user-stories / prd-spec SC1 / 提案「模式绑定三律」（本次评审已逐条核对）。断言口径统一锚 UI 投影面，与 SC1 的口径修正一致。
3. **成功判据有效性：中。** 部分断言不可由所述 User Action 直接触发（见下），部分 UI 形态断言与 spike 证据存在未被文档承认的分歧（座位卸载 vs 座位锁定）。
4. **自相矛盾：发现两处。** Step 3 Expected Result 断言了未执行的动作（再点选）；Step 3 与 Step 3b 对同一场景（首回合后再点选）双重覆盖且形态描述互有出入；Step 5/5b 所用会话身份悬空。

---

## Phase 2 — 维度评分（对抗核验立场）

### 1. Completeness（完整性）— 133/200

**元数据完整（48/50）**
- name `mode-selection-alignment` 合 kebab-case；`risk_level: Medium` 为合法值；`golden_path: false` 与特性级指定（`expedition-full-sdd-chain` 为 true）一致，非缺陷。
- 扣 2：Medium 的「无不可逆副作用」与 blank 锁的不可逆性存在张力（见 Internal Consistency 维度详述），属可辩护但非零瑕疵的判定。

**Step 必备字段齐全（65/80）**
- 每个 step 均有 User Action + Expected Result，5 happy + 6 edge 覆盖了每个 happy step（1b/2b/3b/3c/4b/5b 对应 Step 1–5），结构完整。
- 扣 5：Step 3 的 Expected Result 断言了 User Action 未执行的动作——「**User Action**: 在选定突击模式的会话中发起首回合对话」而「**Expected Result**: …再点选菜单无效（UI 投影面断言：座位锁定、点选不响应）」。「再点选菜单」不在本 step 动作内，下游执行者无法判定该断言属本步还是 Step 3b。
- 扣 7：Step 5 动作不可执行——「**User Action**: 将 hero 自由创建（无提案上下文）的会话用于另一模式的 feature 工作」。「用于…工作」不是具体 UI 操作；触发「mode chip 对照 + 派发入口提示」守卫的用户动作（打开提案？派发？查看何处？）未指明。
- 扣 3：多处 Expected Result 捆绑多个独立断言于一身（如 Step 1b「预设座位不自现（开关门控）；既有会话的组合不受开关影响」——后者需要另一个既有会话在场，本步 Setup 未提供该状态）。

**Outcome 覆盖 happy + 必备派生场景（20/70）**
- Happy path 完备、边界场景有 6 个（幂等点选、重启恢复、无溯源、错配守卫等），若 surface 为 CLI 这可达 ~45–50。
- 但 Web surface 的强制派生 Outcome（`validation-error` + `session-expired`，surface-web.md「must be considered for every Web Journey」）**完全缺席**：全文无任何 form 校验失败场景、无任何会话失效/连续性场景，也无一处不适性说明（例如「本地单用户应用无会话过期概念，故不适用」之类的显式记账）。按 rubric 该子项只能给低分。

### 2. Semantic Purity（语义纯度）— 160/200

**Outcome 自然语言、无 regex/选择器/断言调用（62/80）**
- 全文无 regex、无 CSS/XPath、无 `expect()`。描述总体为用户/系统可观察现象。
- 扣分点：Expected Result 内嵌验证策略括注——「（投影断言——技能清单不含规格技能全集）」「（UI 投影面断言：座位锁定、点选不响应）」属「如何验证」而非「观察到什么」；「order 1/2」是配置级序号而非用户可感知语义（用户感知的是菜单顺序本身）。多处重复出现，非孤例。

**前置条件为声明式（55/60）**
- Setup 与各 edge 的 Precondition 均为状态声明（「`ui-settings` 行缺席或被用户运行时关闭」「应用重启，此前存在已确立模式的会话」），无过程式代码。扣 5：Setup 首条夹带机制史括注「（一次性；此后该行归用户运行时修改）」，信息与前置状态混杂但尚可读。

**Step 无实现耦合（43/60）**
- Step 动作均为用户级（「点选菜单」「发起首回合」「经绑定入口创建」）。
- 扣分点：Expected Result 直接引用平台内部机制——「blank 期 `select`」（RPC 名）、「按 agentPreset 投影重建」「`ui-settings` 行」「registry 默认」。这些多为 PRD 原词（PRD 自身使用 `blank 期 select`），故不算硬违规，但 Step 3c 的「按 agentPreset 投影重建同款组合」对下游合同生成者是机制语言而非观察语言（应表述为「重建后座位标签/工具面/技能目录与重启前一致」——该句后半其实已给出，前半机制引用冗余）。

### 3. Precondition Exclusivity（前置条件互斥性）— 125/150

**同 Step 内 Outcome 前置互异（50/60）**
- 本格式每 step 单一 Expected Result，字面上不存在同 step 双 Outcome 碰撞。
- 扣 10：正因如此，多场景被捆绑进单一 Expected Result 而无各自前置——Step 3 一个结果里混装「首回合成功」与「再点选无效」两个不同触发的 Outcome；Step 1b 混装「新会话无座位」与「既有会话组合不变」两个需要不同系统状态的断言。互斥性靠步骤拆分勉强维持，下游 gen-contracts 无法从文档恢复各 Outcome 的独立前置。

**前置足以唯一定位 Outcome（40/50）**
- 各 edge 前置互斥清晰（开关缺席 / blank 默认态 / 过首回合 / 重启 / 无溯源 / 错配），无歧义对。
- 扣 10：**Happy path 全部 step 无 step 级前置**（仅全局 Setup + 动作内嵌条件）。Step 2 的「blank 会话」藏在动作里，Step 4 的依赖（blitz 提案在场）在 Setup，Step 5 的前置（错配状态成立）完全未声明——合同生成者需自行推断。

**错误/边界 Outcome 前置无缺失（35/40）**
- 六个 edge 均有 Precondition 字段且指明触发态。扣 5：Step 5（happy）实为守卫场景（非纯 happy），其错配前置未以任何形式声明，只能从动作描述反推。

### 4. Fact Alignment（事实依据）— 95/150

**事实声明可溯源（45/60）**
- 实质溯源强：Step 1（座位/菜单/order/中文直出）↔ Story 1 AC1 + SC1；Step 2（组合切换 + 技能清单断言）↔ SC1/SC2；Step 4（blank 期 select + 投影断言）↔ AC3/SC1；Step 5（守卫 = mode chip 对照 + 派发入口提示）↔ AC4 逐词一致；Step 3c（投影重建）↔ SC1；Step 4b（无溯源 → 缺省占位）↔ SC6；Step 5b（整数 ID / eval 豁免照旧）↔ SC3/关键场景 4。Setup 的装配/首启预置 ↔ DF001 + Data Requirements。
- 扣 15：(a) 两处未标注推理冒充事实——「组合不漂移（幂等点选）」（「幂等」在 PRD/spec/提案全文均不出现，纯生成推理）与「既有会话的组合不受开关影响」（由「开关只控可见性」推断，非 PRD 明文），均无 `source: inferred` 或任何标注；(b) blank 锁 UI 形态断言（见下条 c3）未承认源文档的双信号分歧。

**推理声明有规则支撑 + 标注（15/50）**
- 无任何一处 edge/outcome 标注推理依据或引用 surface `required_outcomes` 规则；Web 强制派生（validation-error/session-expired）既未生成也未说明不适。推理标注机制整体缺位，2b 幂等场景属「合理但未分类」的推理。

**无未分类幻觉（35/40）**
- 未发现与源文档矛盾或无中生有的声明（2b/1b 定性为未标注推理而非幻觉）。扣 5：blank 锁形态存在与 spike 证据的实质冲突——journey 断言「（UI 投影面断言：座位锁定、点选不响应）」且 Step 3b 让用户「再次点开座位菜单尝试切换至另一模式」（预设菜单仍可展开），而提案 S5 spike 实证为「blank 锁（首回合后**座位卸载** = UI 面）」、PRD SC1 给出的断言基是「**座位卸载/点选超时**」双信号。journey 单方面采用「锁定在场」读法且 3b 的动作可执行性依赖该读法——若实现遵循 spike 的「卸载」，3b 的动作对象（座位菜单）根本不存在。文档未对源内分歧做任何消解或标注。

### 5. Surface Fitness（Surface 适配）— 60/150 【破线】

**强制派生 Outcome 在场（0/60）**
- surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。本文档两者**完全缺席**：无表单校验失败场景（本 journey 亦无任何带输入校验的表单交互被描述）、无会话过期/连续性 Outcome、无一处显式的不适性说明。rubric 明文「Score 0 if mandatory Outcomes are completely absent」→ 0/60。
- 需说明：文档存在**近似物**——Step 3b（无效模式切换被拒）近似 validation-error 的状态机类比，Step 3c（重启恢复）近似会话连续性类比——但均非按 Web 规则语义派生（无「错误提示近场显示、可更正重试」「未保存数据保留/警示」等规则要求的断言面），也未以任何形式被识别为该两类 Outcome 的适配。修订路径二选一：补派生 Outcome，或补显式不适性记账（本地单用户、无登录会话、无自由文本表单）+ 声明近似物映射。

**测试策略比例（30/50）**
- Web 应 50/50（Contract/Journey）。本 journey 提供了扎实的 Journey-smoke 素材（11 步、每步 2–4 断言），但 Contract 侧粒度薄：每步单一 Outcome、分支场景全部上提为独立 edge step，无同 step 多 Outcome 分叉，合同抽取后每 step 仅一场景，Contract 层可测密度低于 50/50 预期。

**环境与执行假设现实（30/40）**
- 断言基 UI 投影面（座位标签/工具面/技能目录）与 PRD SC1 口径一致，Playwright/Electron 自动化可行；「技能目录与突击组合一致」的 UI 投影位置未指明（PRD 亦未指明，非 journey 独有缺陷）。异步点选切换（「组合即时切换」）无 loading/稳定性考虑——Web 规则的 async handling 原则未被反映。

### 6. Internal Consistency（一致性）— 118/150

**不变量在每步成立（55/60）**
- 四条不变量与各 step 无实质违反：Step 2 的 blank 期切换不违反不变量 1（「一经首回合确立」才锁定）；Step 5b 的溯源语义不违反不变量 2（组合由预设决定、语义由溯源决定，正交）；Step 3c 重启重建与不可切换一致。
- 扣 5：Step 3 Expected Result 越界断言「再点选菜单无效」属 Step 3b 的领地，同场景双写且两处形态表述不完全一致（「座位锁定、点选不响应」 vs 「点开座位菜单…点选无效」——后者预设菜单可展开）。

**跨步引用一致（35/50）**
- Step 3 引用 Step 2 会话（「选定突击模式的会话」）✓；Setup 支撑 Step 4（blitz 提案在场）✓。
- 扣 15：Step 5 与 Step 5b 所用会话身份悬空——Step 5「hero 自由创建…的会话」未指明是否即 Step 2 的（突击）会话；Step 5b 前置「hero 自由会话（远征）」引入了一个从未在任何步骤创建、也未在 Setup 声明的第三个会话。下游执行者需自行构造。

**风险级别与内容一致（28/40）**
- 文档自带的判级标准：「High = Workflow involves state mutation, data loss risk, or irreversible operations」。本 journey 核心操作「模式一经首回合确立，会话内不可再切换」即会话生命周期内的**不可逆操作**（错档只能新开会话补救），且 Step 2 的模式点选直接改写会话工具面/技能目录（状态变更）。按文档自己的标准可争 High；Medium 的辩护（错配非阻断、守卫兜底、无数据丢失）成立但非零歧义。若定 High，edge 数 6 ≥ happy 数 5 亦满足密度要求，不存在改级障碍。

### 7. Workflow Coverage（工作流覆盖度）— 125/150

**Golden Path 存在（veto 项，55/60）**
- veto 未触发：Step 1→4 构成 3+ 连续域级操作序列（查看预设座位 → 点选突击模式 → 发起首回合确立 blank 锁 → 经提案绑定入口自动对齐），逐条对应 Story 1 AC1–AC3，语义核验通过；步骤均为域级用户操作（点选模式、发起首回合、绑定入口创建），无 API 级描述。`golden_path: false` 元数据与特性级指定（expedition-full-sdd-chain）一致。
- 扣 5：5 个 happy step 并非单一连续用户流——Step 4 切换到另一创建通道、Step 5 又切到第三个（未声明的）会话语境，「连续序列」实为 Step 1–4。

**多步覆盖深度（38/50）**
- 覆盖状态转移（blank → 锁定）、生命周期（创建 → 确立 → 重启恢复）、跨实体（会话 ↔ 提案溯源 ↔ 错配守卫）。扣 12：无任何错误恢复路径（本工作流内无可失败环节被描述——异步切换失败、座位加载失败均未触及）；无 mode 人工升降级联动（提案子 tab 改 mode 后「下一个经绑定入口创建的会话自动对齐新值」在 proposal-review-mode-transition journey 的辖域，本 journey 不重复尚可接受）。

**对 PRD/Design 范围的完整度（32/40）**
- Story 1 四条 AC 全覆盖；SC1 的「registry 默认 = 远征 e2e」（Step 1）与「恢复投影重建」（3c）均落到步骤。
- 扣 8：(a) 不变量 4 断言「（设置 UI 保存正常持久化）」但**无任何步骤经由设置 UI 切换 hero 开关**——声明了却不可验证；(b) 提案 SC1 有「恢复/**分叉**会话按 agentPreset 投影重建同款组合（e2e 各一条）」，prd-spec SC1 收窄为仅「恢复」——journey 随 PRD 只覆盖恢复，分叉会话重建无覆盖，与声明来源（proposal.md 在 frontmatter sources 内）存在缺口，未做取舍说明。

---

## 跨维度一致性核验

- 最大失分根因（Web 强制派生 Outcome 缺席）在三个维度各自计罚：Completeness（结果覆盖 20/70）、Surface Fitness（0/60）、Fact Alignment（推理标注 15/50）。这是 rubric 的分面设计（存在性 / surface 合规 / 标注纪律），非重复计罚；修订该根因可同时回收约 90–120 分。
- 「座位锁定 vs 座位卸载」矛盾同时影响 Fact Alignment（c1/c3）与 Internal Consistency（Step 3/3b 双写不一致），合计已控制在该两维度内。
- 各维度间无相互矛盾的判分：golden_path: false（元数据）与 Workflow Coverage 给分（veto 未触发）一致；risk Medium 的保留意见同时反映在 Completeness 与 Internal Consistency 的小额扣分中。

---

## Phase 3 — Blindspot 猎查（rubric 之外）

1. **[blindspot] blank 期重启的悬空语义。** Step 3c 只测「已确立模式」的恢复——「**Precondition**: 应用重启，此前存在已确立模式的会话」；而 Step 2 的点选发生在 blank 期（「在未发首回合的 blank 会话中点选菜单「突击模式」」）。**点选后、首回合前**重启：该选择是否持久化、恢复后座位显示远征（registry 默认）还是突击（已选未锁）？PRD 与本 journey 均未定义此中间态。这是一个真实的边界洞，恰好也是 session-expired/连续性强制的本地化适配位。
2. **[blindspot] 守卫的触发动词与渲染位置缺失。** 「**User Action**: 将 hero 自由创建（无提案上下文）的会话用于另一模式的 feature 工作」——「用于」不可执行；「mode chip 对照 + 派发入口提示」渲染在哪里（提案子 tab？会话头？派发按钮旁？）未指明。Semantic Purity 管语言纯度，Workflow Coverage 管覆盖，均不直接管「可执行性」——这是 QA 视角的独立缺陷。
3. **[blindspot] Setup 夹具不完整。** Setup 只声明「库中存在 mode 溯源 = blitz 的提案（供自动对齐步骤使用）」，但 Step 5 需要「另一模式的 feature」（远征 feature + 其工作语境）、Step 5b 需要「突击提案的直挂任务」（blitz 提案 + 已建任务）。两步骤依赖的实体在 Setup 中缺席，下游 gen-test-scripts 的 fixture 规格无法从本文档推导。

---

## 修订指引（按回收分值排序）

1. **补 Web 强制派生 Outcome 或显式不适性记账**（预计 +80~120，解 Surface Fitness 破线）：validation-error 的本地化适配（如 blank 锁后的无效点选应有可见反馈而非静默）+ session-expired 的本地化适配（blank 期重启 = blindspot 1，顺带填补中间态语义）；若判不适，须在文档显式记录理由。
2. **消解 blank 锁 UI 形态分歧**（预计 +15~25）：以 spike 实证「座位卸载」或 PRD 双信号择一并统一 Step 3 与 3b 的表述，消除 3b 对「菜单可展开」的隐含预设。
3. **为推理声明补标注**（+10~20）：2b 幂等、1b 既有会话不受影响等生成推理补 `source: inferred` 类标注。
4. **使 Step 5/5b 可执行化**（+10~15）：给出守卫触发的具体 UI 动作与守卫渲染位置；Setup 补远征 feature 与带直挂任务的 blitz 提案夹具。
5. **将 Step 3 越界断言归还 Step 3b；声明 Step 5b 的会话来源**（+5~10）。
