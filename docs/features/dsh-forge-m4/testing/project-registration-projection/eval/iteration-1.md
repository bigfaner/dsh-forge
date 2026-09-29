# Journey Eval Report — iteration 1

- **Target**: `docs/features/dsh-forge-m4/testing/project-registration-projection/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md`(1150 分 / 7 维度,target 975)
- **Scorer context**: `gen-journeys/rules/surface-web.md`(SURFACE_TYPE=web);`docs/business-rules/` 全量(coexistence / privacy / resilience / sot-migration / task-operations / workbench);`prd/prd-user-stories.md`(Story 4 = ground truth)+ `prd/prd-spec.md`(必答③ 2026-09-26 修订 / 必答④ / SC3 / DF001-DF004)+ `prd/prd-ui-functions.md`(UF1/UF7/UF8)+ `docs/decisions/project-storage-and-knowledge.md` §5 v2
- **Date**: 2026-09-30 · **Iteration**: 1

## Verdict

| | Score | Threshold | Pass |
|---|---|---|---|
| **Total** | **1007 / 1150** | ≥975 | ✅ PASS |
| 1. Completeness | 173 / 200 | ≥120 | ✅ |
| 2. Semantic Purity | 186 / 200 | ≥120 | ✅ |
| 3. Precondition Exclusivity | 139 / 150 | ≥90 | ✅ |
| 4. Fact Alignment | 117 / 150 | ≥90 | ✅ |
| 5. Surface Fitness | 114 / 150 | ≥90 | ✅ |
| 6. Internal Consistency | 143 / 150 | ≥90 | ✅ |
| 7. Workflow Coverage | 135 / 150 | ≥90 | ✅(Golden Path veto 未触发) |

---

## Phase 1 — Reasoning Audit(pre-score anchors)

**故事工作流覆盖追踪**(侦测→确认卡→注册→投影→归组→降级):

| 旅程步骤 | 对应 PRD/设计锚点 | 追踪结论 |
|---|---|---|
| Step 1 打开确认卡(原位弹卡、唯一必答、知识区不上卡) | UF7 Placement「工作台左栏区头「＋」原位弹卡」+ Secondary Pages「当前页(原位弹卡,不跳页)」+「知识区不上卡(M4 不渲染)」 | ✅ 逐字可溯 |
| Step 2 给路径+侦测四项(仓内 forge 树/已注册/父目录多子仓/git) | UF7 User Interaction Flow「给路径 → 侦测(git / 仓内 forge 树特征 / 已注册 / 父目录多子仓)」 | ✅ |
| Step 3 证据三档门控(沿用仓内/仓内新建 `<root>\docs` 懒物化/应用管理主路径)+ ✎ 展开 + 灰字留痕 | 裁决 §5.3 D9 表 + §5.4 预览行形态 + UF7 Description | ✅ |
| Step 4 注册(权威条目)+ 投影同名同序(断言)+ ≤2s | 必答④「顺序一致性:项目列表顺序 ↔ workspace 顺序」+ Performance「投影操作…同步完成 ≤2s」 | ✅ |
| Step 5 派发会话归组 + 未注册目录不破坏 | Story 4 AC3「forge 派发会话(项目 cwd)…归组到对应 workspace(断言)」+ 必答④「不破坏」+ DF002 | ✅ |
| Edge 2b/2c/2d/2e/3b/3c/4b/4c | UF7 States 表(missing/registered/nogit/parent/custom-outside)+ UF7 Validation Rules(黏性禁令/硬校验 2 条)+ 必答④降级流 + 裁决 §5.5 可写性运行时化 | ✅ |

**内部论证健全性**:步骤编号体系(1-5 + b/c/d/e 变体)交叉引用全部指向真实存在的父步骤;Step 5 依赖 Step 4 的注册产物(成立);Setup「已有 ≥1 个注册项目(同名同序断言基线)」支撑 Step 4 顺序断言与 Step 5 未分组不破坏断言(成立);Step 4b「本地权威条目已写」与 Step 4「注册写入 forge 项目注册表(权威条目)」措辞一致(成立)。降级链完整:4b(写入失败→降级+重试→恢复后两侧一致)与 4c(运行时复检→不回滚)构成 PRD 降级流的两段。

**High-risk 规则**:happy 5 步,edge 8 例(2b/2c/2d/2e/3b/3c/4b/4c)≥ 5 ✅。

**Golden Path veto 判定**:frontmatter `golden_path: false`(feature 级金路径在 `project-workbench-home`),但本旅程 Happy Path Step 1→5 为连续 5 步、域级动作(确认卡/侦测/文档位置/添加项目/归组),语义验证对应 Story 4(注册即归组·投影)全部 4 条 AC(AC1→Step 2b-2e;AC2→Step 4;AC3→Step 5;AC4→Step 4b)。**veto 不触发**。

**核心弱点定位**(评分前锚点):surface-web 强制 outcomes 对(validation-error + session-expired)仅 validation-error 被实质覆盖(未标注),session-expired 完全未被考虑;全文唯一 required_outcomes 映射注释是 network-error(非强制项)且缺 `source: inferred` 标注。这是 Surface Fitness 与 Fact Alignment 的主要失分源。

---

## Phase 2 — Rubric Scoring(verification stance)

### 1. Completeness(完整性)— 173/200

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 1a metadata(0-50) | 49/50 | name kebab-case ✅;`risk_level: "High"` 合法值且内容证成(注册 = 权威注册表写入 + 投影 + 向用户仓写入 docs 位置 = 状态突变)✅;frontmatter 七字段齐全 + sources 含 prd-ui-functions.md ✅;风险分类注释保留 ✅。−1:High 的「data loss risk」面在文中较弱(移除注册仅级联自有数据,BIZ-workbench-001),依赖读者推断。 |
| 1b steps 字段齐全(0-80) | 76/80 | 全部 13 步(5 happy + 8 edge)均有 User Action + Expected Result ✅;顺序连贯 ✅。−4:Step 3「察看文档位置预览行」与 Step 5「验证派发会话归组」的 User Action 为观察性动词,动作性弱(见 Attack 6)。 |
| 1c happy + 必备派生场景(0-70) | 48/70 | happy path 完整;边界态丰富(missing/registered/parent/nogit/黏性/仓外授权/投影降级/可写复检 8 例)。−12:session-expired(surface-web 强制项)零覆盖零处置——对照姊妹旅程 task-session-roundtrip 已映射「宿主/会话通道不可用 → open-failed」,本旅程未做任何等价考虑;−5:loading-state 未考虑——「侦测陈述与文档位置预览行呈现(valid 态可添加)」只断言终态,侦测为异步操作无中间态 outcome;−5:validation-error 被实质覆盖(Step 2b「missing 态…+ 添加禁用;即时提示、留在卡内修正」)但无 required_outcomes 映射注释。 |

### 2. Semantic Purity(语义纯度)— 186/200

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 2a 自然语言非代码/正则(0-80) | 72/80 | 无 regex/CSS 选择器/expect() 断言调用 ✅;outcome 描述用户/系统可观察事实 ✅;「(断言)/(e2e 断言)」为 PRD AC 原生词汇(Story 4 AC 原文含「e2e 断言」)✅。−8:实现邻近词渗入:Step 2c「realpath 归一命中」、Step 3「懒物化」、4b 注释「host 半身通道」——均可溯至 UF7/裁决原文,属 PRD 域词汇,但密度高于用户可观察语言。 |
| 2b 前置条件为声明式(0-60) | 58/60 | 8 条 edge Precondition 全部为状态声明(「给定路径不存在(或非目录)」「给定目录下含 ≥2 个 .git 子仓」等)✅。−2:Step 3b「已在卡内察看过一个路径的文档位置预选,再更换为另一路径」夹带历史动作叙述(轻微软性)。 |
| 2c 步骤无实现耦合(0-60) | 56/60 | 步骤均为用户级动作 ✅。−4:Step 5「经该项目 cwd 派发会话」——cwd 为技术词(但为 Story 4 AC 原文用语「forge 派发会话(项目 cwd)」);Step 4 直接命名存储层「注册写入 forge 项目注册表…投影写入 dsh workspaceRegistry」(同为 PRD 原文语),系统级而非纯用户级。 |

### 3. Precondition Exclusivity(前置条件互斥性)— 139/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 3a 各 Step 内前置互斥(0-60) | 55/60 | Step 2 族的路径状态机(missing/registered/parent/nogit/valid)互斥清晰,与 UF7 States 表一一对应 ✅。−5:① Step 2 happy「给定一个存在的 git 仓代码区路径」未显式排除「已注册」,靠 valid 态定义(「路径存在且未注册」)隐式互斥;② parent 态「给定目录下含 ≥2 个 .git 子仓」未定义与「目录自身含 .git」的优先级(父目录自身是 git 仓且含 ≥2 子仓时路由未定)。 |
| 3b 前置足以唯一选择 Outcome(0-50) | 46/50 | UF7 状态机给定路径事实即可确定唯一态 ✅;4b(点击时投影写入失败)与 4c(注册后运行时复检失败)时间窗互斥清晰 ✅。−4:parent+own-git 角例与 nogit-with-subrepos 角例(父目录无自身 .git 且仅 1 个 .git 子仓 → nogit)未声明。 |
| 3c 错误/边界 Outcome 无缺前置(0-40) | 38/40 | 8/8 edge 均有显式 Precondition 且描述触发事实 ✅。−2:Step 4b「workspaceRegistry 不可写或投影写入失败」为二合一 OR 条件,未区分通道不存在 vs 写入中途失败两类触发。 |

### 4. Fact Alignment(事实依据)— 117/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 4a 事实声明可溯(0-60) | 53/60 | 逐条核验:Step 1 三断言 = UF7 Placement 原文;Step 3 三档 = 裁决 §5.3 表逐字;Step 4「同名条目且顺序与项目列表一致」= 必答④ + SC3;≤2s = Performance Requirements;Step 5 归组/不破坏 = Story 4 AC3 + 必答④;2b/2c/2e/3b/3c 文案 = UF7 States/Validation Rules 近逐字;4b 降级链 = 必答④ 降段落逐字(「归属仅 forge 侧可见」「恢复后重试成功即两侧一致」);Invariants 6 条全部可溯(DF001/裁决 §5.5/D9/UF7/PRD perf/UF7 词汇统一)。BIZ 对账:BIZ-workbench-006(M4)四操作同步仅注册入本旅程 scope(改名/归档/删除归 project-lifecycle-projection,合理切分);「仓外授权收窄至高级自定义(BIZ-001/003)」与裁决 §8 回写清单一致。−3:Step 4c 归属面混淆——「察看项目行/设置页投影状态」:代码区/文档位置可写性降级按 UF1 应呈「项目行路径健康角标(ok/degraded/invalid)」,UF8 设置页「投影状态 degraded」的触发是投影写失败,两口径被并置未区分;−2:Step 2b「不产生半注册状态」无直接 PRD 原文(可由裁决 §5.5「注册入 BEGIN IMMEDIATE 事务」+ 必答③「留在卡内修正」推得,但未标注推理来源);−2:Step 2c 卡内 registered 态与「不出卡流程」快车道并存未声明触发差异(源文档 UF7 自身两处并述,旅程照搬)。 |
| 4b 推理声明有 required_outcomes 支撑 + source: inferred(0-50) | 25/50 | 全文唯一映射注释:「<!-- surface-web required_outcomes 映射:network-error → 投影通道(host 半身)写入失败,呈现为降级态 + 手动重试入口,注册数据无丢失 -->」——引用了规则来源 ✅ 但 network-error 属 surface-web「Additional common」非强制项,且无 `source: inferred` 标注 ❌;两个强制项(validation-error/session-expired)零引用 ❌。幸而本旅程边界 outcomes 几乎全部可直接溯至 UF7/必答④(事实类),推理标注需求面窄,否则失分更重。 |
| 4c 无未分类幻觉声明(0-40) | 39/40 | 主动幻觉猎杀:逐条比对后未发现无源杜撰(≤2s/同名同序/侦测四项/三档/黏性/词汇统一/场景演示 chips 不上 UI 均为源文原文);最接近者为「健康时同名同序恒成立」——「恒成立」为对必答④的强读(健康前提下),可接受。−1:Step 2c「快车道 toast 打开既有项目」的 toast 动作词在 UF7 流程原文为「toast『已注册 · 打开』」,「打开」目标(既有项目工作台)为隐含补全。 |

### 5. Surface Fitness(Surface 适配)— 114/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 5a 强制派生 Outcomes 齐备(0-60) | 34/60 | **validation-error**:实质覆盖 ✅——Step 2b「missing 态『路径不存在』+ 添加禁用;即时提示、留在卡内修正」+ Step 2c 禁用态,完全符合 surface-web 定义("error message displayed near the relevant field, form is not submitted, user can correct and retry"),但无映射注释;**session-expired**:完全缺席 ❌——无任何等价映射或处置声明(对照 task-session-roundtrip 已做「session-expired → 宿主/会话通道不可用 → open-failed」);network-error(非强制)已映射 ✅。强制对一半缺席 + 引用纪律缺失 → 34。未至 0(validation-error 非完全缺席)。 |
| 5b 测试策略比例 50/50(0-50) | 44/50 | Contract 级素材密度高(5 个侦测态 + custom-outside 授权态 + 降级态 = 单交互契约面),Journey 级主线完整(5 步注册→归组 + 降级→恢复链)≈ 均衡 ✅。−6:未显式声明两级的取用边界,contract 面(态矩阵)与 journey 面(跨实体链)的测试配比需读者自行切分。 |
| 5c 环境与执行假设现实性(0-40) | 36/40 | 浏览器交互假设现实(弹卡/toast/chips/灰字/角标均为 DOM 可断言)✅;异步处理经 ≤2s 预算 + 降级态呈现 ✅;fixture 集现实(含 .git 与 forge 树特征仓/无 .git 目录/不存在路径/已注册代码根/多子仓父目录)✅;「派发归组经 dsh 原生 UI 断言」与 SC3 断言口径一致 ✅。−4:侦测为异步却无 loading/wait 策略线索;≤2s 硬断言进 e2e 有抖动风险(既有纪律:CI 计时用宽松阈值防抖动,BIZ-workbench-005 语境)。 |

### 6. Internal Consistency(一致性)— 143/150

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 6a Invariants 全程成立(0-60) | 58/60 | 逐条核:①单向投影——全程无 dsh→forge 反向写,4b 降级亦不回流 ✅;②硬校验仅 2 条——无任何步骤引入第三硬校验,2e 显式 reaffirm「任何流程不以『先 git init』为前置」✅(且正确未复活已废止的 ERR_FORGE_NOT_DETECTED);③零 git 强制 ✅;④黏性禁令——Step 3 默认纯证据门控 + 3b 重估 ✅;⑤降级不阻断 + ≤2s——4b/4c 与 Step 4 一致 ✅;⑥词汇统一——全文无「注册向导/档案区」字样,统一「添加项目/文档位置/确认卡」✅。−2:不变量②「+ 可读」的不可读路径行为全文无对应 outcome 覆盖(成立但未被行使,弱验证)。 |
| 6b 跨步骤引用一致(0-50) | 47/50 | edge 编号 2b-2e/3b-3c/4b-4c 全部指向真实父步骤 ✅;Setup 基线 ↔ Step 4 顺序断言 ↔ Step 5 未分组不破坏三角自洽 ✅;Step 4「权威条目」↔ 4b「本地权威条目已写」措辞一致 ✅。−3:Step 2c 内部张力——「registered 态『已注册项目 — 同一代码根仅一个项目』+ 禁用;快车道 toast 打开既有项目,不出卡流程」:卡已在 Step 1 打开的前情下,「不出卡流程」与「卡内 registered 态呈现」同步骤并存,未声明何者适用于卡内提交场景(源文档 UF7 同样两处并述,旅程未消歧)。 |
| 6c 风险级别与内容一致(0-40) | 38/40 | High = 状态突变(权威注册表 + 投影双写 + docs 落点写入用户仓)✅。−2:旅程内操作均可逆(移除注册仅级联自有数据),不可逆性/数据丢失面弱于典型 High,靠「写入权威 + 写入用户仓」撑住。 |

### 7. Workflow Coverage(工作流覆盖度)— 135/150(veto 未触发)

| 子项 | 得分 | 证据与扣分 |
|---|---|---|
| 7a Golden Path 存在(0-60,veto) | 55/60 | 连续 5 步 Happy Path 语义验证通过:对应 Story 4「注册即归组(投影)」核心序列(打开确认卡 → 给路径侦测 → 核查文档位置 → 确认添加注册+投影 → 验证归组),AC 映射:AC1→2b-2e、AC2→Step 4、AC3→Step 5、AC4→4b;域级术语(确认卡/侦测/文档位置预览行/投影/归组/workspace)零 API 级描述 ✅。−5:Step 3(「察看」)与 Step 5(「验证」)动作观察化,贴近 golden-path 反模式「verification-only step」边缘(由 Story 4 断言式 AC 正当化,但动作性可加强:Step 3 可承载 ✎ 编辑决策分支)。 |
| 7b 多步覆盖深度(0-50) | 45/50 | 深覆盖:状态机(5 侦测态)、错误恢复链(4b 降级→重试→恢复两侧一致)、运行时健康复检(4c)、授权边界(3c)、默认值治理规则(3b);跨实体三系统(forge 注册表 × dsh workspaceRegistry × 会话归组)✅。−5:同实体第二操作(注册后立即改名/重命名冲突)未触及——由 project-lifecycle-projection 承接,可接受,但 display_name 可重复(裁决 §5.1「自由改、可重复」)这一近邻事实在注册旅程内无澄清。 |
| 7c 对照 PRD/Design 工作流完备(0-40) | 35/40 | Story 4 全 4 AC 覆盖 ✅;必答③(2026-09-26 修订口径:唯一必答/三档/零 git/黏性/仓外授权收窄)全覆盖 ✅;必答④注册+降级+不破坏全覆盖 ✅。缺口:裁决 §5.4「纳管 = 空态主角…未分组组头导入入口」(§8 列入 M4 回写清单)未覆盖——非 Story 4 AC,记 minor gap;`.git` 后至一次性迁入建议(UF7 Validation Rules)未覆盖——属生命周期/设置面,minor。 |

---

## Deduction Log(汇总)

| # | 维度 | 扣分 | 引文 | 理由 |
|---|---|---|---|---|
| 1 | Surface Fitness/5a | −20(session-expired) | 「surface-web required_outcomes 映射:network-error → …」(唯一映射) | 强制对 validation-error+session-expired 中后者零考虑;前者实质覆盖未引用 |
| 2 | Surface Fitness/5a | −6(引用纪律) | 同上 | validation-error 覆盖无映射注释 |
| 3 | Fact Alignment/4b | −25 | 同上 | 唯一推理映射缺 `source: inferred`;强制项零引用 |
| 4 | Fact Alignment/4a | −7 | 「察看项目行/设置页投影状态」「不产生半注册状态」「快车道 toast 打开既有项目,不出卡流程」 | UF1/UF8 口径并置混淆;半注册为未标注推理;快车道与卡内态未消歧 |
| 5 | Completeness/1c | −22 | 「侦测陈述与文档位置预览行呈现(valid 态可添加)」 | session-expired 缺席、loading-state 缺席、validation-error 未标注 |
| 6 | Precondition Exclusivity | −11 | 「给定目录下含 ≥2 个 .git 子仓」 | parent 与自身 .git 优先级未定;happy 隐含「未注册」 |
| 7 | Internal Consistency/6b | −3 | 「registered 态…+ 禁用;快车道 toast…不出卡流程」 | 卡内提交 vs 拖入快车道两 UX 并存未消歧 |
| 8 | Workflow Coverage/7a | −5 | 「**User Action**: 察看文档位置预览行」 | 观察性步骤动作性弱 |
| 9 | Semantic Purity | −14 | 「realpath 归一命中」「懒物化」「host 半身通道」 | 实现邻近词汇密度(PRD 域词,轻) |

---

## Phase 3 — Blindspot Hunt(rubric 外)

1. **[blindspot] 纳管流程缺席与 Step 5 断言的潜在冲突**——旅程断言「未注册目录的既有会话仍显示为未分组(不破坏)」,而裁决 §5.4「纳管 = 空态主角…非空态靠左树『未分组』组头导入入口」+ §8 M4 回写清单「纳管空态重排 + 未分组组头入口」表明 M4 交付纳管入口;若交付,未分组组头将出现导入入口,「仍显示为未分组」的断言口径需与其共存说明。建议旅程补一句纳管入口的存在性不破坏或显式声明纳管不在本旅程 scope。
2. **[blindspot] display_name 可重复未澄清**——「项目名自动取文件夹名(✎ 可改)」;裁决 §5.1「display_name 自由改、可重复(D8『有意义』的主承担者)」。同名 workspace 投影依赖什么区分?后续 contract 生成若误断言项目名唯一会与裁决冲突。建议不变量或 Step 补注「项目名可重复,唯一性仅在代码根(realpath 归一)」。
3. **[blindspot] 取消/放弃路径无 outcome**——裁决 §5.4 确认卡线框含「[取消] [添加项目]」两钮;旅程无中途关卡的取消边界(应断言零残留:无半注册、无投影)。半注册语义仅在 2b 顺带出现。
4. **[blindspot] ≤2s 硬断言进 e2e 的抖动风险**——「投影操作同步完成 ≤2s」三处出现(Setup/Step 4/Invariants);项目既有纪律为「CI 计时用宽松阈值防抖动」(BIZ-workbench-005 语境)。旅程级建议给 e2e 留松弛口径,否则下游 gen-test-scripts 会产出 flaky 计时断言。
5. **[blindspot] 侦测异步中间态缺失**(同 Completeness 扣分,但其影响主要在下游测试代码的 wait 策略——web 规则明确要求 "use appropriate wait strategies")。
6. **[blindspot] `.git` 后至桥接未提及**——UF7 Validation Rules「`.git` 后至 → 一次性非模态『迁入仓内』建议(非强制)」;属设置/生命周期面,但注册旅程声明了零 git 强制不变量,补一句指向桥接机制可防测试作者误把「建议弹窗」当违规。

---

## Attack List(修订优先级)

1. **[Surface Fitness]** session-expired 强制 outcome 完全未考虑——「<!-- surface-web required_outcomes 映射:network-error → 投影通道(host 半身)写入失败,呈现为降级态 + 手动重试入口,注册数据无丢失 -->」为全文唯一映射——必须为 validation-error 与 session-expired 补显式映射/处置注释(参照 task-session-roundtrip 的双映射写法,如 session-expired → 宿主通道半身失联时确认卡侦测/添加动作的失败呈现与恢复)。
2. **[Fact Alignment]** 派生边界 outcome 缺 `source: inferred` 标注与规则引用——现唯一映射既无规则 id 也无来源标记——补齐「source: inferred + 触发规则名」的标注纪律。
3. **[Fact Alignment]** Step 4c 归属面混淆——「察看项目行/设置页投影状态」把代码区/文档位置可写性降级(UF1 路径健康角标)与设置页投影状态(UF8,degraded 触发 = 投影写失败)并置——按 UF1/UF8 拆分呈现位置或修正归属性。
4. **[Internal Consistency]** Step 2c 双 UX 并存未消歧——「registered 态『已注册项目 — 同一代码根仅一个项目』+ 禁用;快车道 toast 打开既有项目,不出卡流程」——声明触发差异(拖入/粘贴/浏览快车道 = 不出卡;卡内提交 = registered 态)。
5. **[Completeness]** 侦测异步无 loading 中间态、确认卡无取消路径——「侦测陈述与文档位置预览行呈现(valid 态可添加)」只断言终态——补 loading-state 派生 outcome 与取消零残留 outcome。
6. **[Workflow Coverage]** 观察性步骤动作化——「**User Action**: 察看文档位置预览行」「验证派发会话归组」——为 Step 3 增加 ✎ 编辑决策分支(展开改选/保持预选)、Step 5 保留断言但标注为验收观察,避免 verification-only 反模式边缘判定。
7. **[Precondition Exclusivity]** parent 态优先级未定——「给定目录下含 ≥2 个 .git 子仓」——补「目录自身含 .git 时不入 parent 态(或声明优先序)」。

---

*Iteration 1 verdict: **PASS(1007/1150 ≥ 975,全维度过阈)**。主要修复面 = surface-web 强制 outcomes 对的显式处置与推理标注纪律(Surface Fitness 114、Fact Alignment 117 为两低分维度,均过阈但低于其余维度均值)。*
