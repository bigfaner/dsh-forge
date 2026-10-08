# Eval Report: worker-provisioning — Iteration 2

- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度；及格 = 总分 ≥975 且每维度 ≥ 最低线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **Scorer persona**: Senior QA Engineer（对抗式；只对纸面内容计分——修订意向不加分，残余缺陷照扣）
- **日期**: 2026-10-08 · ITERATION = 2 · **fix-2 修订后复评（supersedes 修订前报告，前轮 844/1150 · Surface Fitness 59 破线）**

## 事实核查记录（fix-2 修订稿逐条对源验证）

- Step 1/1b/1c ↔ prd-ui-functions UF-2 第 1/2/3 条逐字（三项 Provider/Model 联动/Reasoning 三段；未配置态 ⚠ 占位「worker 派发将回退父会话继承（显式不静默）」+ 保存禁用 + 填齐激活（脏态实时）；成功 → 持久化 `forge-settings.json` + core forgeSettings 单门读写 + 下次派发生效；失败 → 错误行留场可重试）✓——`prd-ui-functions.md` 已入 `sources:`（前轮溯源缺口修复）✓；tech-design L26/L124/L455-460（Forge设置 单门/实时生效无重启）✓。
- Step 2 ↔ prd-spec 流程四第 3 条逐字（agentOptions = Forge设置 默认档——配置面三项[用户裁决去 Output 上限]；机制通道能力不变，含 output-token——优先于父会话继承）——**前轮盲区 3「三配四断张力」已按源消解** ✓；入口两途（工具栏「派发」按钮 / 会话内发起 run-tasks）↔ 流程四第 1 条 ✓——**前轮「Step 2 入口未指明」缺陷消除** ✓。
- Step 3 ↔ Story 5 AC2 + proposal 方案⑥（收窄矩阵底稿 + 全局拒绝集 ask-user/delegation/todo/present + submitTask/addTask、claimTask/queryTask 不入）✓；「G0–G2 门『契约面 pin 扩池：两包 tool 面』」↔ tech-design §契约 pin（G1 扩池）「两包 tool 面分置」✓（tech-design 在 `sources:`）。
- Step 4/4b ↔ Story 5 AC3 + SC2 worker 层 + s6 S6-5（子代理目录含 m3-spec-probe——继承达 worker）+ 3.9 记录 W 用例（deny 零泄漏、run-tests 按需加载正反例「test worker 调用 / doc worker 零调用、目录行常驻」）✓——内容全真，但 **3.9 记录文档未入 `sources:`**（Step 4 观察通道引用「3.9 W 用例」为源外指针，残留缺口）。
- Step 5 ↔ Story 5 AC4（disc-N/fix-N 二分、block_source 单事务、链深 ≤6、恢复钩子、blocked 收尾引用新任务）✓；web 面观察通道（任务子 tab 详情时间线 + M2 写入返回后单次重取即见口径）↔ prd-user-stories Story 2 AC3 口径 ✓。
- Step 1d（新增：在途 worker 保持旧档 / 新 worker 用新档）——`source: inferred`（「下次派发生效」的语义边界：生效时点 = 派发，spawn 后不回溯）✓——**前轮盲区 2（配置时效边界静默）已补步并充当 session-expired 承载步** ✓。
- Step 2b ↔ Story 5 AC1「优先于父会话继承」+ Setup 冲突夹具 ✓；Step 3b/5b——5b「超限不放行」已标注 `source: inferred`（源只证「链深 ≤6」不变量）✓（前轮未分类推理已收敛）。
- Setup 可控触发夹具 (a)(b)（注定受阻任务 = AC 缺测试证据 → submit 被拒——Story 7 AC1 通道 ✓ 已对源核实；越权诱导任务 = 规格含「询问用户确认后继续」指令）——`source: inferred`（夹具构造语义，非产品行为声明）✓——**前轮盲区 1（自主行为不可诱导）已消解** ✓。
- 不变量二已加限定「**已配置时**……未配置回退父会话继承，见 Step 1b」——**前轮不变量与 1b 的措辞级矛盾消除** ✓。

## Phase 1 — Reasoning Audit（评分前独立判断）

1. **前轮 5 条修复建议逐条核销**：

| 前轮修复建议 | 修订稿落点 | 核销 |
|---|---|---|
| 1 派生裁决/记账 | Derived Outcomes 裁决节：validation-error = Step 1b 显式识别（web 表单原生形态）+ 规则引用 + 标注；session-expired = Step 1d（配置时效）+ Step 1 持久化续行 | ✓ |
| 2 观察通道声明 | 每步「观察通道」行；非浏览器断言显式记为契约面（Contract 半承载）；Step 2 补工具栏「派发」按钮 web 入口 | ✓ |
| 3 不变量二限定 | 「已配置时……未配置回退父会话继承（Step 1b）」 | ✓ |
| 4 sources 增补 UF-2 | `prd-ui-functions.md` 入列 | ✓ |
| 5 可控触发夹具 | Setup (a) 注定受阻任务（Story 7 AC1 通道）+ (b) 越权诱导任务，均标注夹具语义 | ✓ |

2. **问题→方案契合：优良。** 13 步（5 happy + 8 edge）对应 Story 5 四 AC + UF-2 配置流全分支；新增 1d/5c 与夹具族使边况矩阵闭环。步骤序列（配置 → 派发 → 收窄 → 继承 → 逃生）连贯。
3. **Surface 错配处置 = 「双半承载」声明**：Journey 半（设置对话框 + 派发入口 + 时间线 ≈ 6-7 步）真浏览器面；Contract 半（worker 内部状态 ≈ 6-7 步）显式让渡契约测试。按前轮自设修复判据有效；本维度仍扣分于「多数断言浏览器不可观察」的题材事实与「3b/4b/5 依赖 agent 依从夹具」的随机性残余。
4. **独立新查**：(a) 裁决节称「Step 1 持久化断言（**应用重启后**配置经下次派发续行）」——Step 1 Expected 只写「持久化 + 下次派发生效」，重启续行是裁决节的延伸读法，承载步纸面未载（小越界）；(b) Step 3 断言「仅含**矩阵 ✓ 列**工具」但矩阵行内容不在纸面（外部引 proposal 方案⑥底稿/db-schema §7-6 终稿）——断言对象外置。
5. **Delta 复核（fix-2.1，涉本篇 2 处修订——逐条对纸面验证）**：(a) `sources:` 增补 3.9 记录（frontmatter 第 7 项）——Step 4 观察通道「3.9 W 用例」引用的文件级闭环完成 ✓；(b) session-expired 裁决删去「应用重启后配置经下次派发续行」延伸读法，改为「配置持久化落盘 forge-settings.json 由 Step 1 承载」——与 Step 1 Expected 纸面（「保存成功 → 持久化（用户数据域 forge-settings.json…）」）严格对齐，越界消除且无新矛盾引入 ✓。两处均落纸；相应子项分数上调（见 Phase 2）。

## Phase 2 — 维度评分

### 1. Completeness（完整性）— 178/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 元数据完整 | 50/50 | kebab-case ✓；`risk_level: "High"` 由内容支撑（设置持久化 + 任务态迁移 + worker 仓库写操作）✓；sources 七份——3.9 记录已入列（fix-2.1），引用闭环 ✓。 |
| Step 必备字段完整 | 72/80 | 每步四字段全 + Setup 夹具族齐（冲突父会话/可控触发/两途入口）✓；前轮「Step 2 通道/Step 4 观察面/Step 5 触发前提」三缺口全消 ✓。扣：收窄矩阵 ✓ 列行内容外置（断言对象不在纸面，下游须跨文档拼装）；Step 1d 的「在途 worker」需先行派发（与 Step 2 的时序承接隐式）；夹具 (a) 的诱导确定性依赖 worker 依从任务规格（测试设计已尽力，随机性残留）。 |
| 覆盖 happy + 强制派生场景 | 56/70 | 8 边况含链深边界/优先级冲突/物理不可见/配置时效 ✓；Web 强制派生双双在场：validation-error = **同批唯一规则形态本体**（必填缺失 → 保存禁用 + 近场 ⚠ 占位 + 填齐可保存——与规则「required field empty → form not submitted + can correct and retry」对位最贴）；session-expired 本地化在场（1d 档位时效 + 1d/1 持久化续行，登录 N/A 论证成立）。不给更高：session-expired 映射为「配置时效连续性」，与「会话过期」语义距离稍远（见 SF）。 |

### 2. Semantic Purity（语义纯度）— 158/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Outcome 自然语言 | 58/80 | 无 regex/选择器/`expect()` ✓；前轮满屏「（断言）」括注已基本清场，验证方法分流至观察通道行（改善）✓。扣：机制否定式结论残留（「物理不在面——调用不可达」「非运行期劝阻」）；「（观察面有效性对照）」式编著语。 |
| Preconditions 声明式 | 55/60 | 全部状态陈述（「worker 小节三项未填齐」「持久化写入失败」「父会话模型与配置档不同」「fix 链已接近最大深度」）✓；前轮 5c「选择前缀」动作型前置已改为双受阻场景状态前置 ✓。小扣：1d 前置含时序成分（「用户随后改档」）。 |
| Step 无实现耦合 | 45/60 | 动作域级 ✓。扣：Expected Results 机制词密度同前（spawn/agentOptions/toolFilter/block_source/catalog 行级常驻）；不变量四仍为纯实现陈述（toolFilter 携带者 = in-process spawn）——域固有但无观察语言重述。 |

### 3. Precondition Exclusivity（前置条件互斥性）— 136/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 同 Step 内前置互异 | 54/60 | 1b/1c/1d 三配置边况互斥 ✓（未填齐/写入失败/时效边界）；2b 冲突态唯一 ✓。扣：5b（链近上限追加 fix-N）与 5c（阻塞问题型追加 fix-N）在动作空间仍部分重叠——同一下属场景可同时满足两者前置，需按「考察面」（链深纪律 vs 前缀分化）人工区分。 |
| 前置足以唯一选定 Outcome | 44/50 | 单 Outcome + 触发态互斥为主 ✓；happy 步级前置齐备（前轮隐式承接已消）✓。扣：5b/5c 的判别依赖考察意图而非状态差（见上）；Step 3 的矩阵外置使「仅含 ✓ 列」的最终判定依赖外部表。 |
| 错误/边界 Outcome 不缺前置 | 38/40 | 全部错误边况带触发前置 + 夹具可达性（Setup (a)/(b) 确定性诱导）✓。小扣：3b 的「worker 执行含越权指令的任务」——诱导成功率取决于模型依从性，前置可达但非机械确定。 |

### 4. Fact Alignment（事实依据）— 140/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 事实声明可溯源 | 56/60 | Step 1-5 全部行为声明逐字可溯（Story 5/UF-2/流程四/方案⑥/S6-5/tech-design）✓；UF-2 内容的溯源缺口已闭合 ✓；3.9 记录已入 `sources:`（fix-2.1），「3.9 W 用例」引用闭环 ✓。扣：无 fact_id/UNKNOWN 机制。 |
| 推理声明带规则支持 + `source: inferred` | 48/50 | 标注体系建立：Setup 夹具（a)(b)、1c（已填值不丢失）、1d（时效边界）、5b（超限不放行）+ 裁决节双规则引用 ✓；裁决节越界读法已删（fix-2.1），现文「配置持久化落盘由 Step 1 承载」与 Step 1 纸面严格对齐 ✓。小扣：1d 行为预言（spawn 不回改）为标注推断；「显式不静默」（1b）为 UF-2 原词 ✓ 无需标注。 |
| 无未分类幻觉 | 36/40 | 未发现与源相抵声明 ✓。扣：「矩阵 ✓ 列」外置断言的瞬时一致性无保障（若 db-schema §7-6 终稿与方案⑥底稿分化，Step 3 断言对象漂移）；1d 行为预言（spawn 不回改）为标注推断，实现证伪风险同 2c 类。 |

### 5. Surface Fitness（Surface 适配）— 120/150（前轮 59——破线已解）

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 强制派生 Outcome 在场 | 50/60 | validation-error **在场且为规则形态本体**（必填缺失 → 保存禁用 + 近场占位 + 填齐激活——四旅程中唯一原生 web 表单校验面）✓；session-expired 在场（1d 配置时效 + 持久化续行，登录 N/A 论证成立）——但映射语义为「配置/档位连续性」而非会话连续性，是四旅程中最远的本地化（mode/overview 的草稿与投影重建更贴「unsaved data preserved」）。 |
| 测试策略比例 50/50 | 40/50 | 双半承载声明明确且步级指派（Journey 半 = 设置流 + 派发入口 + 时间线；Contract 半 = worker 内部状态七处）✓——前轮「9/12 步非浏览器且无声明」的结构性缺陷以声明方式收敛；派发按钮 web 入口补齐 ✓。扣：Journey 半实量仍 < 半（约 6-7/13）；in-doc 每步单 Outcome。 |
| Surface 执行假设现实性 | 30/40 | 观察通道全声明且各有所本（会话投影面 = S6 转录通道；契约面 = G1 pin/3.9 W 已验证通道；web 面 = 详情时间线 + M2 单次重取口径）✓。扣：多数断言本质浏览器不可观察（声明解除了「无通道」违规，但 surface 归属的天然弱点仍在）；3b/4b/5 依赖 agent 依从夹具（诱导式而非机械触发），自动化稳定性弱于纯 UI 步。 |

### 6. Internal Consistency（一致性）— 141/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 不变量在每步成立 | 57/60 | 不变量二已限定（已配置时/未配置回退——与 1b 一致，前轮矛盾消除）✓；不变量一 ↔ 3b ✓；三 ↔ 4/4b ✓；四 ↔ Setup/Step 2 ✓；裁决节与 Step 1 纸面已对齐（fix-2.1），前述小扣消除。 |
| 跨步引用一致 | 44/50 | Setup 冲突夹具 ↔ 2b ✓；4/4b 会话在场 ↔ Setup ✓；5/5c ↔ 夹具 (a) ✓；裁决节 ↔ 1b/1d/1 ✓。扣：Step 3 断言对象（矩阵）外置导致跨文档引用；1d 在途 worker 的建立时序未与 Step 2 显式衔接。 |
| 风险级别与内容一致 | 40/40 | High 成立（设置持久化写入、blocked/fix 链态迁移、worker 经 shell/git 变异仓库）✓。 |

### 7. Workflow Coverage（工作流覆盖度）— 126/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Golden Path 在场（否决项） | 50/60 | veto 不触发：Step 1→5 连续对应 Story 5 主线（配置 → 派发 → 收窄 → 继承 → 逃生），域级动词 ✓。扣：Step 3/4 偏验证型（转录目录/核对工具面）——golden-path 反模式边缘（题材固有，前轮同判）；Step 2 动作双通道写法（「或」）使主路径不唯一。 |
| 多步覆盖深度 | 44/50 | 状态迁移（blocked 收尾/源即时 blocked）、实体生命周期（addTask 建任务 → 派发）、跨实体（设置↔worker↔任务↔技能目录）、错误恢复（逃生 + 链深上限）、配置时效（1d）——深度保持同批前列 ✓。扣：诱导式步骤（3b/4b/5）的复现确定性弱于机械触发；1d 为单点对照无双向组合。 |
| 对 PRD 范围的工作流完备性 | 32/40 | Story 5 四 AC 全覆盖 ✓；流程四第 1 条两途入口、第 3 条档位语义、第 5 条逃生通道均落步 ✓；派发按钮行为族归 overview（其 5/5b/5c 已覆盖）——分工实存但本篇未声明（前轮「连提及都没有」已改善为「提及 + 单步入口」，完整行为族仍让渡）。扣：流程四第 2 条（dispatchTask DAG 序）与第 6 条（结算定式）归 gate-and-submit-discipline，无显式分工声明（前轮同判）；收窄矩阵终稿归属（db-schema §7-6）未注记版本基准。 |

## Phase 2.5 — 跨维度一致性核验 + 总分核算

- 前轮破线根因三面回收：Completeness c3（45→56）、Fact Alignment c2（16→46）、Surface Fitness（59→120）——回收 +96，加独立缺陷修复（不变量限定 +8、观察通道/入口 +12、夹具 +8、UF-2 溯源 +2）合计 +148。逐项有修订动作对应；SF 120 距满分 30 分 = 题材非浏览器域（声明式收敛 ≠ 内容变浏览器）+ 诱导式步骤随机性，扣分有实指、非惯性罚。
- 前轮三个 blindspot 全部消解：可控诱导（Setup 夹具）、配置时效边界（Step 1d 兼 session-expired 承载）、output-token 张力（流程四第 3 条口径）。新增残留：3.9 引用未入 sources（新引入的源外指针）；裁决节重启续行读法越出承载步纸面。
- 与同批口径：SF 120 位于 preset（118）与 mode（126）之间——validation-error 形态最优（唯一表单本体）但 session-expired 语义最远、非浏览器占比最高，两向抵消后居中，无倒挂。
- Delta 后总分核算：178+158+136+140+120+141+126 = **999/1150**（fix-2 基线 992 + fix-2.1 Delta 回收 +7：C1 +2 / FA +4 / IC +1——对应涉本篇的 2 处修订，其余维度不动）。

## 结论

**总分 999 / 1150 —— 过门**（≥975 ✓，裕量 +24；每维度 ≥ 最低线 ✓，最低维 Surface Fitness 120 / 线 90）。同时高于配置目标 850。前轮 5 条修复建议全部落地（核销表见 Phase 1），三个 blindspot 全部消解；fix-2.1 Delta 两处收尾（3.9 记录入 `sources:`、裁决节越界读法删除）经对纸面验证后回收 +7。残余失分集中在题材固有项（worker 内部状态断言的非浏览器本质、自主 agent 行为的诱导随机性）与盲区 1-3（诱导判据分层 / 1d 时序约束 / 矩阵基准钉扎）。

## Phase 3 — Blindspot Hunt（rubric 之外）

1. **[blindspot] 夹具诱导的成功率无判据。** 夹具 (a)「执行路径必缺测试证据」依赖 worker 实际走到 submit 且未投机补测；(b)「规格含询问用户指令」依赖 worker 选择调用 ask-user 而非自行绕过。两夹具把「自主行为不可控」改善为「大概率可控」，但未定义**诱导失败的判定与处置**（如 N 次重试、或以 3.9 W 式 deny 断言直接替代行为观察——3b 的「物理不在面」本可用契约面 deny 断言独立验证，不必等 worker 真的去调）。建议为 3b 增补「deny 断言为 Primary、行为观察为 Secondary」的判据分层。
2. **[blindspot] 1d 的时序窗口与改档实时性张力。** tech-design 明文「派发时实时读（改完即生效无重启）」——即改档保存后**立即**派发即用新档，1d 的「在途 worker 保持旧档」只在 spawn 已完成后成立。1d 未声明「改档保存动作必须晚于在途 worker 的 spawn 完成事件」这一时序前置；自动化若在 spawn 进行中改档，可能命中中间态。补一行时序约束即可封死。
3. **[blindspot] Step 3 断言对象的外置漂移风险。** 「仅含矩阵 ✓ 列工具」的矩阵底稿在 proposal 方案⑥、终稿随 db-schema §7-6——两文档当前一致性无保障（底稿 vs 终稿措辞已分化过一次）。Step 3 断言应钉住单一基准（「以 db-schema §7-6 终稿为准」），否则该步在文档演化中会静默失锚。

## 修复建议（供下轮，如需迭代）

1. **已解（fix-2.1）**：3.9 记录已入 `sources:`（C1 +2 / FA +2）。
2. **已解（fix-2.1）**：裁决节越界读法已删除（改为「落盘由 Step 1 承载」，与纸面严格对齐）（FA +2 / IC +1）。
3. Step 3 钉住矩阵基准（「以 db-schema §7-6 终稿为准」）并声明 gate-and-submit / 派发按钮行为族的分工归属（+4~6，C1/WC）。
4. 3b 增补「deny 契约面断言为 Primary、行为观察为 Secondary」判据分层（+2~3，PE/可执行性）。
5. 1d 补时序约束（改档保存须晚于在途 worker spawn 完成）（+2~3，PE/IC）。
6. Step 2 动作双通道择一为主路径（工具栏「派发」按钮），另一通道注记为等价入口（+2~3，WC）。
