# Eval Report: worker-provisioning — Iteration 1

- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度；及格 = 总分 ≥975 且每维度 ≥ 最低线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **Scorer persona**: Senior QA Engineer（对抗式；只对纸面内容计分）
- **日期**: 2026-10-08 · ITERATION = 1（无前轮报告）

## Phase 1 — Reasoning Audit（评分前独立判断）

1. **忠实度高但溯源机制缺位**：Step 2–5 的 Expected Result 与 PRD Story 5 四条 AC 近逐字同构（「spawn 携带 agentOptions（provider / model / effort / output-token = 该档位，优先于父会话继承）」= AC1 原文）。事实根基扎实——但全文零 `source: inferred` 标注、零 fact 引用，推理/事实两类声明未做任何区分。
2. **Surface 错配是最大结构性问题**：`surface_types: ["web"]`，但 12 个步骤（5 主 + 7 边）中仅 Step 1/1b/1c 是浏览器可观察的（设置对话框）；Step 2–5 与 2b/3b/4b/5b/5c 全部断言 worker 内部状态（会话 model、toolFilter 工具面、技能目录、fix 链深），文档未给出任何浏览器观察通道。
3. **Web 强制派生 Outcome 缺席**：`session-expired` 完全缺席且无不适性记账；`validation-error` 仅以未标注的功能近似物在场（Step 1b「三项未填齐 → 保存禁用」）。
4. **不变量与边况自相矛盾（措辞级）**：不变量二「worker 会话 model **恒** = Forge设置 默认档」为无条件表述，而 Step 1b 明文记录未配置态「worker 派发将回退父会话继承」——不变量缺少「已配置」限定词。
5. **可执行性缺口**：Step 2 入口通道未指明（工具栏「派发」按钮 or 会话内 run-tasks）；Step 5 的「遇无法解决的重大问题」与 3b/4b 的越权尝试均为自主 agent 行为，Setup 未提供任何可控触发机制（无法确定性诱导）。

## Phase 2 — 维度评分

### 1. Completeness（完整性）— 160/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 元数据完整 | 47/50 | `journey: "worker-provisioning"` kebab-case ✓；`risk_level: "High"` 合法且由内容支撑（设置持久化 + 任务态转移 + worker 仓库写操作 = 状态变异）✓；`sources` 列三份文档——但 Step 1/1b/1c 的内容（「⚠ 占位说明」「保存禁用；填齐激活（脏态实时）」「错误行留场可重试」「用户数据域 forge-settings.json，core forgeSettings 单门读写」）全部取自 `prd-ui-functions.md` UF-2，该文件**不在 sources 列表**（溯源缺口计入 Fact Alignment，此处小幅计罚）。 |
| Step 必备字段完整 | 68/80 | 每步均有 User Action + Expected Result ✓，序列连贯（配置→派发→收窄→继承→逃生）✓。扣分：Step 2「发起 run-tasks 使 dispatcher 派发一个 worker」未指明发起通道（web 面的工具栏「派发」按钮 or 会话内指令——下游 agent 无从执行）；Step 4「转录其技能目录」未说明观察通道（谁来转录、在哪看）；Step 5 的触发前提（如何让 worker 确定性遇到重大问题）Setup 未提供。 |
| 覆盖 happy + 强制派生场景 | 45/70 | 7 条边况 ≥ 5 步（High 风险要求）✓，含链深边界（5b）、优先级冲突（2b）、物理不可见（4b）等高质量域内边况。但 Web surface 强制派生：`session-expired` **零在场零不适性说明**；`validation-error` 仅有未标注近似物（1b：表单未填齐 → 保存禁用 + 占位说明——语义上是「form is not submitted + 提示在场」，但未被识别/标注为该类派生）。 |

### 2. Semantic Purity（语义纯度）— 160/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Outcome 自然语言 | 58/80 | 无 regex/CSS 选择器/XPath/`expect()` 类断言调用 ✓。扣分：全文散布测试编著语言「（断言）」标记（「worker 会话 model 与配置一致（断言）」「（toolFilter 断言）」「技能枚举断言」「deny 生效断言」）——描述「怎么验」而非「观察到什么」；实现细节渗入结论：「block_source 单事务」（API 参数名）、「core forgeSettings 单门读写」（内部模块设计）、「catalog 行级常驻」（装载机制内部）。 |
| Preconditions 声明式 | 55/60 | 边况前置多为状态陈述 ✓（「worker 小节三项未填齐」「持久化写入失败（如用户数据域不可写）」「父会话模型与配置档不同」「fix 链已接近最大深度」）。扣分：5c 前置「worker 追加任务时选择前缀」是动作时刻非状态条件。 |
| Step 无实现耦合 | 47/60 | Step 动作基本域级（「配置…并保存」「依次派发 coding 族 / doc 族 / gate / 验证类任务」）✓。扣分：耦合集中在 Expected Result（spawn/agentOptions/toolFilter）；Step 2「使 dispatcher 派发」引入系统内部角色且无用户可操作面；不变量四整条为纯实现陈述（「toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达」）。 |

### 3. Precondition Exclusivity（前置条件互斥性）— 130/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 同 Step 内前置互异 | 48/60 | 每步单 Outcome，结构上无同 Step 歧义；同族边况 1b（未填齐）/1c（写入失败）互斥 ✓。扣分：5b（「fix 链已接近最大深度」→ 追加 fix-N）与 5c（「选择前缀」→ fix-N 分支）处于同一动作空间——5c 的前置非状态、恒真，与 5b 在「追加 fix-N」语境下不可判别适用哪条。 |
| 前置足以唯一选定 Outcome | 44/50 | 单 Outcome 结构平凡满足；但 5c 前置无区分力（见上），happy 步依赖隐式顺序承接（Step 2 隐含 Step 1 已配置完成——未声明）。 |
| 错误/边界 Outcome 不缺前置 | 38/40 | 错误边况均带触发条件 ✓（1b 未填齐、1c 写入失败、3b「worker 请求全局拒绝集内工具」、5b 链近上限）。小扣：Step 2b 依赖「父会话模型与配置档不同」由前置自载 ✓，但 Setup 未建立该父会话存在。 |

### 4. Fact Alignment（事实依据）— 92/150（贴最低线 90 过）

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 事实声明可溯源 | 44/60 | Step 2–5 与 Story 5 四条 AC 近逐字一致（sources 在列）——真实可溯 ✓；不变量一/三/四均可在 proposal 方案⑥找到出处 ✓。扣分：Step 1/1b/1c 全部细节取自 **prd-ui-functions.md UF-2 而该文件不在 `sources:`**（「用户数据域 forge-settings.json，core forgeSettings 单门读写」还混入 tech-design 裁决）；全文无任何 fact_id/UNKNOWN 标记机制。 |
| 推理声明带规则支持 + `source: inferred` | 16/50 | 全文零 `source: inferred`、零 surface `required_outcomes` 规则引用。未标注推理至少三处：1c「已填值不丢失」（UF-2 原文仅「错误行留场可重试」）；5b「超限不放行（无无限 fix 链）」（源文档只陈述「链深 ≤6」不变量，超限时系统行为未定义于本 journey 引用面）；3b「非运行期劝阻」（机制层否定式断言）。Web 强制派生理应触发的推理（validation-error/session-expired）一处未生成。 |
| 无未分类幻觉 | 32/40 | 未发现与源文档相抵触的捏造声明（三项扩展均为合理推理而非幻觉，故不在本子项重罚）；因存在「既非带溯源事实、亦非带支持推理」的灰区声明，不给满分。 |

### 5. Surface Fitness（Surface 适配）— 59/150（**低于最低线 90——唯一破线维度之一**）

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 强制派生 Outcome 在场 | 22/60 | surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。**`session-expired` 完全缺席**——本 journey 横跨「配置 → 派发 → 执行」多会话多环节（Step 1 的「下次派发生效」本身即是跨会话时效声明），却无任何会话中断/过期/连续性 Outcome，也无「本地单用户应用无会话过期概念」式不适性记账。`validation-error` = Step 1b 未标注近似物（表单未填齐 → 保存禁用 + ⚠ 占位说明——满足「form is not submitted」+ 提示在场，但非「error near field」的提交拒绝形态，且文档未将其识别为该派生），给部分分。 |
| 测试策略比例 50/50 | 25/50 | 12 步中仅 3 步（1/1b/1c）为浏览器面用户工作流，9 步为 worker 内部契约型断言——Web 的 Journey 侧（用户经 UI 的工作流）严重欠重；且流程四的旗舰 web 交互「任务子 tab 工具栏『派发』按钮」（v22 双路由：亮起/置灰、跳转/新开、模式路由、`/run-tasks` 单行消息自动发送）在本 journey 零覆盖，Step 2 只剩无通道的「发起 run-tasks」。 |
| Surface 执行假设现实性 | 12/40 | Step 2「spawn 携带 agentOptions…worker 会话 model 与配置一致」、Step 3「worker tool 面仅含矩阵 ✓ 列工具（toolFilter 断言）」、Step 4「转录其技能目录」、5b「链深 ≤6 纪律」——全部断言浏览器自动化**不可观察**的 child-agent 内部状态，且文档未声明任何替代观察通道（如任务子 tab 详情时间线之于「自身任务以 blocked 收尾」）。与 sibling 评审口径一致（expedition 链同类问题计入本维度）。 |

### 6. Internal Consistency（一致性）— 123/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 不变量在每步成立 | 44/60 | 不变量二「worker 会话 model **恒** = Forge设置 默认档（agentOptions 显式携带、优先于父会话继承）」为无条件表述，与 Step 1b Outcome 明文的未配置态行为「⚠ 占位说明『**worker 派发将回退父会话继承**』」直接冲突——不变量缺「已配置」限定词。因无任何步骤实际在未配置态派发（1b 只查看+保存尝试），不构成步骤级 -40 违规，按措辞级矛盾计罚。其余不变量（一/三/四）与各步一致 ✓。 |
| 跨步引用一致 | 41/50 | Step 3 依赖「任务库含多类型任务」（Setup ✓）。扣分：Step 4 依赖「远征默认会话」在场、4b 依赖突击会话在场——Setup 均未建立（仅边况前置自载）；Step 5 依赖一个会失败的任务 fixture——Setup 无。 |
| 风险级别与内容一致 | 38/40 | High 成立：设置持久化写入、任务态迁移（blocked/fix 链）、worker 经 shell/git 变异仓库——状态变异与不可逆操作在场。 |

### 7. Workflow Coverage（工作流覆盖度）— 120/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Golden Path 在场（否决项） | 48/60 | 内容层面存在：Step 1→5 连续五步，语义对应 PRD Story 5 主线（配置默认 LLM → 派发 → 收窄矩阵 → 技能继承 → addTask 逃生），域级动词（配置/派发/追加任务）非裸 API 调用——否决项不触发。扣分：Step 3/4 偏验证型（「转录其技能目录」为纯观察步，属 golden-path.md 反模式「verification-only steps」边缘）；Step 2 动作欠规格（见 Completeness）。`golden_path: false` 前置标记与 feature 级约定一致（expedition-full-sdd-chain 承担该职），不计矛盾。 |
| 多步覆盖深度 | 42/50 | 深度良好：状态迁移（blocked 收尾/源即时 blocked）、实体生命周期（addTask 建新任务→派发）、跨实体（设置↔worker↔任务↔技能目录）、错误恢复（逃生通道 + 链深上限 + 优先级冲突）。 |
| 对 PRD 范围的工作流完备性 | 30/40 | Story 5 四条 AC 全覆盖 ✓。缺口：流程四第 1 条「派发入口两途」的 web 入口（工具栏按钮行为族）无对应覆盖（可辩称归 overview-entry-new-session，但本 journey 连提及备选入口都没有）；流程四第 2 条 dispatchTask DAG 序/无单任务直执、第 5 条完成结算（submit/gate_json/commit_hash）未覆盖（归 gate-and-submit-discipline，分工可接受）。 |

## Phase 2.5 — 跨维度一致性核验

- 根因聚敛：Surface Fitness 破线的同一根因（Web 强制派生缺席 + 非浏览器断言面）在 Completeness c3、Fact Alignment c2 分面计罚——与 rubric 自身交叉引用设计及 sibling 评审（blitz-direct-chain 866、expedition 56/150、mode-selection 60/150 的 Surface Fitness 处置）口径一致，无双重计分滥用。
- Fact Alignment 92 与 Surface Fitness 59 的落差自洽：前者由 Step 2–5 的逐字可溯性撑起，后者由 surface 适配缺位拖垮——两维度量的是不同性质。
- 总分核算：160+160+130+92+59+123+120 = **844/1150**。

## 结论

**总分 844 / 1150 —— 未过门**（需 ≥975 且每维度 ≥ 最低线）。**Surface Fitness 59/150 低于最低线 90**，为唯一破线维度；总分亦不达 975。核心失分根因与 sibling journeys 同构：Web 强制派生 Outcome（validation-error / session-expired）无显式在场、无不适性记账、无 `source: inferred` 标注；叠加本 journey 特有的 surface 错配加重项——9/12 步断言浏览器不可观察的 worker 内部状态且无观察通道声明。独立问题：不变量二与 Step 1b 回退语义的措辞级矛盾、UF-2 内容未列入 sources、Step 2/4/5 可执行性缺口。

## Phase 3 — Blindspot Hunt（rubric 之外）

1. **[blindspot] 自主 agent 行为无可控诱导机制。** 「worker 执行中遇无法解决的重大问题，经 addTask 追加任务并结算自身」（Step 5）、「worker 尝试调用被拒工具」（3b）、「尝试请求 spec 技能」（4b）——三处都要求测试者观察**自主 LLM agent 的偶发行为**，Setup（「任务库含多类型任务」）未提供任何确定性触发手段（如注定失败的任务 fixture、诱导越权的任务规格）。下游测试代理无法稳定复现这些步骤——这是测试可控性（determinism/controllability）设计缺口，rubric 的 Completeness 只查「action 描述清晰」，不查行为可诱导性。
2. **[blindspot] 配置时效边界静默断言而未成边况。** Step 1「保存成功 → 持久化…、**下次派发生效**」隐含一个重要的时间边界：配置变更不影响在途 worker（已 spawn 的会话保持旧档）。该边界是 load-bearing 语义（与不变量二「优先于父会话继承」共同构成档位生命周期），却没有任何边况验证「改档后既有 worker 照旧 / 新 worker 用新档」——恰是 session-expired 强制项在本工作流的天然本地化派生位之一。
3. **[blindspot] output-token 断言与三项配置面的张力未调和。** Step 2 断言「provider / model / effort / **output-token** = 该档位」，而配置面只有「Provider / Model / Reasoning 三项」（Step 1；PRD 用户裁决已去 Output 上限，机制通道能力保留）。第四个字段（output-token）的档位值从何而来（常量？跟随模型默认？）在 journey 内悬空——逐字搬运 AC 时未消解源文档内部的三配四断张力，测试代理无从断言一个无配置来源的值。

## 修复建议（供 reviser）

1. **补 Web 强制派生 Outcome 或显式不适性记账**（预计 +90~130，解 Surface Fitness 破线）：`validation-error` = 将 Step 1b 显式识别为该类派生并补标注（或扩展：非法 Provider 值提交被拒）；`session-expired` 本地化形态 = 配置时效边界（见 blindspot 2：改档 vs 在途 worker / 应用重启后 worker 派发续行）。每条派生补 `source: inferred` + 规则来源。
2. **为 9 个 worker 内部断言步声明观察通道**：能走 UI 的走 UI（如 Step 5 源任务 blocked + 新任务行 = 任务子 tab 详情时间线）；不能走 UI 的显式记为契约面断言（对应 50/50 的 Contract 半），并补工具栏「派发」按钮作为 Step 2 的 web 入口形态。
3. **不变量二加限定**：「worker 会话 model 恒 = Forge设置 默认档**（已配置时；未配置回退父会话继承，见 Step 1b）**」。
4. **`sources:` 增补 `prd/prd-ui-functions.md`**（Step 1/1b/1c 的 UF-2 出处）。
5. **补可控触发 fixture**：为 Step 5/3b/4b 在 Setup 提供确定性诱导手段（注定失败的任务、规格中含越权指令的任务）。
