# Eval Report: preset-physical-isolation — Iteration 2

- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度；及格 = 总分 ≥975 且每维度 ≥ 最低线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **Scorer persona**: Senior QA Engineer（对抗式；只对纸面内容计分——修订意向不加分，残余缺陷照扣）
- **日期**: 2026-10-08 · ITERATION = 2 · **fix-2 修订后复评（supersedes 修订前报告，前轮 815/1150 · Surface Fitness 40 破线）**

## 事实核查记录（fix-2 修订稿逐条对源验证）

本轮将修订稿全部行为声明与 frontmatter `sources`（本轮已含 s6 spike 与 3.9 记录——前轮溯源断链已闭合）逐条核对：

- `spike S6-3 已实证同构物理边界：突击目录物理缺 spec 探针` ✓（s6 L26/L38：突击目录 = `[git-commit, m3-probe, run-tasks, run-tests, submit-task]`——物理不含 m3-spec-probe）；`阳性对照 run-tests 在场实证` ✓（同 L38）；`目录经会话系统提示投影转录（原样抄出、不调用工具、不加载全文）` ✓（s6 L13）。
- `tool-fs-search 的 sampleOverCapResults` + `缺 config → schema 拒绝 → 整预设 broken 不上菜单` ✓（proposal L48/L190）；`契约面清单须含行 config 全集` ✓（L190）；`!!js 全形态死刑` ✓（L46/L228）+ `3.9 补验实证（packaged-js 负对照）` ✓（3.9 记录 Test Results：N 用例「!!js 全形态死刑确认」）。
- `上游 diff 基线钉扎 = dsh 0.x-rc next 线精确锁定` ✓（proposal L190 上游锁步原文）。
- `行所有权分叉：boot overlay 注行 = 每启覆盖·产品工件` ✓（tech-design L74/L211/L293 逐字；修订稿 Setup 已按 tech-design 裁决消解前轮「物化**或**首启预置二选一」悬置——改判为每启重写单形态，与前轮 Internal Consistency 扣分项闭环）。
- `规格技能全集七者清单` ✓（prd-spec SC2 逐字：write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks）；`远征全量可见且 brainstorm 可用` ✓（SC2）；`customSkillDirs 物化绝对路径` ✓（In Scope ① + DF001）；Overview 锚点 `PRD Story 6 / 关键场景 8 后半（blitz 请求规格技能 → 物理不可见——S6 已实证）` ✓（proposal L185）。
- **新发现瑕疵两处**：(a) Step 1 阳性对照清单含 **brainstorm**——spec 核心包成员属实（prd-spec In Scope ①），但所引 S6-3 实测突击/远征目录均不含 brainstorm（spike 时点早于拆包定型），证据代际差未注记；(b) Setup「宿主 = `{userData}/boot-overlay.yml`」为 tech-design「profile patch / boot overlay 每启注行」模型的合理具体化，源文档无该逐字文件名（可接受，观察通道为契约面 diff，不依赖文件名）。

## Phase 1 — Reasoning Audit（评分前独立判断）

1. **前轮攻击项逐条核销**（对抗式复核，不因「修了」加分，只认纸面落点）：

| 前轮修复建议 | 修订稿落点 | 核销 |
|---|---|---|
| 1a validation-error 识别/标注 | Derived Outcomes 裁决节：2b/3b 显式识别为配置面本地化派生 + `source: inferred` + 规则引用 | ✓ |
| 1b session-expired 不适性记账 | 裁决节 N/A（已考虑）+ 本地单人无登录态论证 + 交接 mode-selection Step 3c + 不变量三旁证 | ✓ |
| 1c 50/50 分工声明 | 「测试策略分工」节：本旅程 = Contract 半，Journey 半归 mode-selection/overview，下游按观察通道行分派 | ✓ |
| 2 观察通道 | 每步「观察通道」行（会话投影面/web 面/契约面）；diff 与 YAML 内省显式记为契约面步骤 | ✓ |
| 3 阳性对照 | Step 1 核心包技能行可见 + 1b 远征跨会话对照（证据代际差先残留，fix-2.1 已以「In Scope ① 清单为准 / S6-3 拆包前实证」注记闭环） | ✓ |
| 4 故障注入规程 | Setup：注入靶 = 底稿、2b/3b 注入形态、恢复规程（备份先行）+「用户层不可达/每启自愈」机制论证 | ✓ |
| 5 基线钉扎/清单/不变量限定 | Setup 上游 checkout 同版本钉扎 + 错位后果；七技能清单落纸；不变量二改「突击侧……远征侧属对照面」 | ✓ |
| 6 sources 闭合 | s6-skill-provisioning + 3.9 记录入 `sources:` | ✓ |

2. **问题→方案契合：优良。** 三主步与 Story 6 三 AC 近逐字，Setup/边况补足后步骤链（枚举→diff→装配形态→对照→两故障注入）自洽；步骤级 Precondition 已补齐（前轮「happy 步零前置」消除）。
3. **Surface 错配的处置方式是「声明分工 + 通道标注」而非内容伪装**——6 步实质仍全为契约/投影面，但每步落点显式、50/50 由旅程间分工承载。按前轮自设的修复判据（「声明本旅程承担 Contract 半的分工」）此为有效解；本维度给中高分而非满分，因 in-doc Journey 半为零与 validation-error 无 web 表单形态两点为题材固有残余。
4. **独立新查**：注入靶「底稿**或其物化输出**」的后一选项与「每启重写自愈」论证相斥（损坏物化输出会在启动时被底稿重写冲掉）——2b/3b 动作（物化并启动）实际只兼容底稿注入，措辞级自相矛盾（计入 Internal Consistency 小扣）。
5. **Delta 复核（fix-2.1，同日第二轮涉本篇 3 处修订——逐条对纸面与源验证）**：(a) 测试策略分工增补「核心包无 git-commit / git-checkout 条目断言由 expedition-full-sdd-chain（Story 3 AC2）承担」——锚点核实为真（Story 3 第二条 AC 逐字含该断言），旅程名实存 ✓；(b) Setup 注入靶收敛为「底稿 = 唯一持久故障源」，物化产物/用户层污染不可达论证自洽，「渲染纯函数直测」注记为非持久通道——新矛盾未引入 ✓；(c) Step 1 阳性对照改挂「In Scope ① 清单为准；spike S6-3 为拆包前同构实证：突击目录含 run-tests」——代际差显式化且与 S6-3 实测一致 ✓。三处均落纸，相应子项分数上调（见 Phase 2）。

## Phase 2 — 维度评分

### 1. Completeness（完整性）— 174/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 元数据完整 | 48/50 | kebab-case ✓；`risk_level: "Low"` 由内容支撑（观测核查 + 底稿级可逆注入——测试夹具而非产品状态变异）✓；`sources` 六份闭合（含 s6/3.9）✓。小扣：注入类工作流判 Low 仍有半分辩护空间（底稿为被测产品工件）。 |
| Step 必备字段完整 | 72/80 | 每步 Precondition/Action/Expected/观察通道四全 ✓；序列连贯 ✓；Setup 携带注入规程、基线钉扎、阳性对照义务 ✓；七技能清单落纸 ✓（前轮 a/b/c/d 四扣全消）。扣：Expected Results 仍杂 QA 过程语（「枚举通道有效性由此证明，缺席断言不空洞通过」）；2b 单 Outcome 捆绑三断言（broken 不上菜单 / 拒绝形态可见 / 无静默降级）。 |
| 覆盖 happy + 强制派生场景 | 54/70 | 三边况质量高（远征阳性对照 + 两类故障注入互为正负控制）✓；Web 强制派生**不再缺席**：validation-error 配置面本地化（承载步 2b/3b）+ session-expired N/A 已考虑（含交接与旁证）——满足「must be considered」并有规则引用与 `source: inferred`。不给更高：validation-error 为语义骨架映射而非规则要求的表单反馈形态；session-expired 以 N/A + 跨旅程交接承载。 |

### 2. Semantic Purity（语义纯度）— 156/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Outcome 自然语言 | 58/80 | 无 regex/选择器/断言调用 ✓；「观察通道」行把「怎么验」从 Expected Result 中分流（较前轮改善）。扣：QA 编著语言仍滞留结论内（「缺席断言不空洞通过」「阳性对照在场」「证据代际」式评审注记、证据指针内嵌「spike S6-3 已实证」「3.9 补验实证」）。 |
| Preconditions 声明式 | 56/60 | 全部为状态陈述（「处于缺失某必填 config 的不完整态（Setup 故障注入规程造成）」= 状态 + 指针，可接受）✓。小扣：2b 括注「模拟上游演进新增」仍为成因叙述。 |
| Step 无实现耦合 | 42/60 | 题材固有（被测对象即装配机制）：`customSkillDirs`/`!!js`/`standard.patch.yml`/`sampleOverCapResults` 等机制名词仍饱和；改善在于 2b/2b-web 通道给出用户可观察重述（hero 菜单缺席）与转录面重述。 |

### 3. Precondition Exclusivity（前置条件互斥性）— 141/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 同 Step 内前置互异 | 54/60 | happy 步已有步级前置（前轮结构缺失消除）✓；2b（缺 config）与 3b（`!!js` 形态）为可判别故障模态 ✓。扣：2b 三断言一 Outcome 无各自触发前置。 |
| 前置足以唯一选定 Outcome | 49/50 | 单 Outcome 结构 + 边况触发态互斥 ✓；注入规程收敛为「底稿 = 唯一持久故障源」（fix-2.1）后，2b/3b 可达路径唯一 ✓。小扣：1b「（默认或显式）」双路径为无害歧义。 |
| 错误/边界 Outcome 不缺前置 | 38/40 | 三边况均有触发前置 + 可达性规程（注入形态 + 恢复）——前轮「只述状态不述可达性」已消 ✓。 |

### 4. Fact Alignment（事实依据）— 135/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 事实声明可溯源 | 54/60 | 全部行为声明本轮逐条对源为真（见事实核查记录）✓；证据文档已入 `sources:`（前轮断链闭合）✓；阳性对照代际差已由 fix-2.1 注记消除（In Scope ① 清单为准 / S6-3 拆包前实证）✓。扣：无 fact_id/UNKNOWN 标记机制（文档级溯源替代）；boot-overlay.yml 文件名为源外具体化。 |
| 推理声明带规则支持 + `source: inferred` | 44/50 | `source: inferred` 已在关键位（Setup 注入规程推理、2b「不静默降级」否定式注记、裁决节规则引用）✓。扣：1b「brainstorm 可用」为 SC2 事实 ✓但 Step 1 阳性对照清单的组合逻辑（哪些行足以证通道有效）未分类；裁决节「不变量三持续成立即旁证」为论证性声明未标注。 |
| 无未分类幻觉 | 37/40 | 无与源相抵的捏造 ✓；灰区声明均已收敛进标注体系；注入靶措辞已唯一化（fix-2.1），含混消除。 |

### 5. Surface Fitness（Surface 适配）— 118/150（前轮 40——破线已解）

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 强制派生 Outcome 在场 | 46/60 | 双双「已考虑」且非空洞记账：validation-error 有本地化形态 + 承载步 + 规则引用 + `source: inferred`；session-expired N/A 论证成立（本地单人、无登录凭据、核查对象为静态产物）并命名交接载体（mode-selection Step 3c 实存 ✓）。不给更高：validation-error 停留在「invalid data → 拒绝不静默」的配置域骨架，无规则要求的表单近场报错/可更正重试断言面——本旅程亦无表单可承载。 |
| 测试策略比例 50/50 | 40/50 | 分工声明明确（本旅程 = Contract 半；Journey 半由 mode-selection 13 步全 UI + overview 18 步全 UI 承载——批级 50/50 连贯）；下游分派规则落纸（按观察通道行分派 Contract / Journey-smoke 用例）。扣：in-doc 每步单 Outcome，契约抽取密度一面倒；Journey 半为零由声明而非内容弥合。 |
| Surface 执行假设现实性 | 32/40 | 观察通道全部声明且各有依据（会话投影面 = spike S6 实证转录通道 ✓）；基线钉扎 + 注入靶选底稿使故障态每启确定性重现（同时消解前轮时序盲区）✓。扣：会话投影面通道需 agent 转录环节，自动化链路重；「或其物化输出」选项与现实执行相斥。 |

### 6. Internal Consistency（一致性）— 143/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 不变量在每步成立 | 57/60 | 四不变量逐步核验无违反 ✓；不变量二已加范围限定（突击侧边界证明 / 远征侧对照面）——前轮措辞级张力消除 ✓；注入靶唯一化后「每启重写」并读歧义随之消除（fix-2.1）✓。 |
| 跨步引用一致 | 48/50 | Setup 三条 + 注入规程与 2b/3b 前置对账 ✓；session-expired 交接指向 mode-selection Step 3c 实存 ✓；注入靶唯一化后与「每启自愈」论证相容（fix-2.1）✓。小扣：git-commit 断言的分工声明为旅程名引用（expedition-full-sdd-chain），闭环强度弱于 sources 文档路径引用。 |
| 风险级别与内容一致 | 38/40 | Low 成立：无产品状态变异，注入限于测试夹具且备份先行可逆 ✓。 |

### 7. Workflow Coverage（工作流覆盖度）— 123/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Golden Path 在场（否决项） | 46/60 | 否决不触发：Step 1→3 连续、语义对应 Story 6（真实用户故事）、域级动词 ✓（与前轮同判）。扣：三步全验证型 + 「机械 diff」近 QA 动作——题材固有，不因修订改变。 |
| 多步覆盖深度 | 40/50 | 注入规程使 2b/3b 从「不可达状态」变为确定性故障场景（前轮最大深度缺项修复）✓；正负控制结构完整 ✓。扣：仍零状态迁移/实体生命周期；边况间无组合场景。 |
| 对 PRD 范围的工作流完备性 | 37/40 | Story 6 三 AC + SC2 预设层/契约面行 + proposal NFR 上游锁步全覆盖 ✓；SC2 worker 层由 worker-provisioning 分工承载 ✓；git-commit / git-checkout 移除断言已由 fix-2.1 补分工声明（expedition-full-sdd-chain · Story 3 AC2——锚点经本轮对源核实为真）✓。小扣：该断言仍不在本旅程行使（分工声明而非断言落步）。 |

## Phase 2.5 — 跨维度一致性核验 + 总分核算

- 前轮破线根因（Web 强制派生缺席 + 全契约面 + 零通道声明）已按 rubric 分面在三处回收：Completeness c3（38→54）、Fact Alignment c2（12→44）、Surface Fitness（40→118）——回收量 +136 落在前轮报告自估「+50~120」区间的上缘，与修订动作的覆盖面（裁决节 + 全步通道 + 注入规程 + 分工声明）成比例，非分数灌水。
- Fact Alignment 132（实质溯源强）与 Surface Fitness 118（形态适配中上）的落差收敛但仍存在：前者量内容、后者量形态——本旅程内容全真、形态经声明对齐但题材非浏览器域，两数自洽。
- 与同批口径：preset（0 浏览器步、声明分工）SF 118 < mode 126 < overview 130 < worker 120——梯度按「Journey 半实量 + 派生适配强度」排列，无倒挂。
- Delta 后总分核算：174+156+141+135+118+143+123 = **990/1150**（fix-2 基线 976 + fix-2.1 Delta 回收 +14：PE +3 / FA +3 / IC +3 / WC +5——逐项对应涉本篇的 3 处修订，其余维度不动）。

## 结论

**总分 990 / 1150 —— 过门**（≥975 ✓，裕量 +15；每维度 ≥ 最低线 ✓：最低维 Surface Fitness 118 / 线 90）。同时高于配置目标 850。前轮 6 条修复建议全部在纸面落地，fix-2.1 Delta 三处收尾（git-commit 分工声明、注入靶唯一化、阳性对照代际注记）经逐条对纸面与源验证后回收 +14，脱离评分噪声带。残余失分集中在题材固有项（validation-error 无表单形态、Journey 半为零、Golden Path 验证型）与盲区 3（基线同版本核验手段未落纸）。

## Phase 3 — Blindspot Hunt（rubric 之外）

1. **[blindspot→已解（fix-2.1）] 阳性对照的证据代际差。** Step 1 阳性对照清单（run-tests / brainstorm / run-tasks / submit-task）中 brainstorm 出自拆包定型后的 spec（prd-spec In Scope ①），而通道有效性证据 S6-3 的实测突击目录（`[git-commit, m3-probe, run-tasks, run-tests, submit-task]`）不含 brainstorm——spike 早于拆包。若拆包后核心包技能挂载形态与 spike 时代不同，阳性对照可能系统性误报/漏报。**→ 已解：Step 1 现注「In Scope ① 清单为准；spike S6-3 为拆包前同构实证：突击目录含 run-tests」，代际差显式化、证据分工干净。**
2. **[blindspot→已解（fix-2.1）] 注入靶双选项的执行歧义。** 「注入靶 = 预设底稿**或其物化输出**」——后支在 2b/3b 的动作序列（物化并**启动**）下不可行：boot 每启由底稿重写会冲掉对物化输出的注入，故障永不及被观测。**→ 已解：注入靶收敛为「底稿 = 唯一持久故障源」，物化产物/用户层污染不可达论证成立，「渲染纯函数直测」注记为非持久通道，无新矛盾引入。**
3. **[blindspot] 基线「同版本」的核验手段未落纸。** Setup 钉扎「与被测安装同版本的 dsh 上游 checkout 在场（proposal NFR）」——版本一致的判定通道（版本查询命令/lockfile 比对）未声明。基线错位正是本旅程要抓的漂移形态，核验手段缺失使 Step 2 的「一致」断言存在前提性漏洞。

## 修复建议（供下轮，如需迭代）

1. **已解（fix-2.1）**：注入靶「或其物化输出」歧义支已删，收敛为底稿唯一持久故障源（PE +3 / IC +3）。
2. **已解（fix-2.1）**：Step 1 阳性对照补证据注记（In Scope ① 清单为准 / S6-3 拆包前实证）（FA +3）。
3. **未解**：Setup 补基线同版本核验手段（版本查询通道 / lockfile 比对）（预计 +3~5，Completeness/盲区 3）。
4. **已解（fix-2.1）**：git-commit / git-checkout 移除断言补分工声明（expedition-full-sdd-chain · Story 3 AC2——锚点核实为真）（WC +5）。
