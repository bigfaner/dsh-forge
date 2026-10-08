# Eval Report: preset-physical-isolation — Iteration 1

- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度；及格 = 总分 ≥975 且每维度 ≥ 最低线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **Scorer persona**: Senior QA Engineer（对抗式；只对纸面内容计分）
- **日期**: 2026-10-08 · ITERATION = 1（无前轮报告）

## 事实核查记录（本次评审逐条对源验证）

以下声明全部在本轮与三份 sources 逐条核对为真：`spike S6-3 已实证同构物理边界`（s6-skill-provisioning.md L26/L38：「突击目录不含 m3-spec-probe」）；`tool-fs-search 的 sampleOverCapResults` + `缺 config → schema 拒绝 → 整预设 broken 不上菜单`（proposal NFR L190、prd-spec SC2）；`!!js 全形态死刑` + `3.9 补验实证`（proposal L228「§5.6 的 !!js 行已判全形态死刑」；3.9 记录「N（packaged-js 负对照——!!js 全形态死刑确认）」）；`宿主物化绝对路径 / boot overlay 注行物化或首启模板预置`（prd-spec In Scope ① + DF001）；`远征全量可见且 brainstorm 可用`（SC2）。Overview 锚点「PRD Story 6 / 关键场景 8 降级支 / SC2 预设层·契约面」全部实存（proposal Key Scenarios 第 8 条后半「blitz 会话请求规格技能 → 物理不可见（技能枚举断言即证——S6 已实证）」即本 journey 不变量二的出处）。**实质溯源质量为同批上游水平——失分在结构机制，不在内容真实性。**

## Phase 1 — Reasoning Audit（评分前独立判断）

1. **问题→方案契合：良好。** 三条 happy step 与 PRD Story 6 三条 AC 近逐字一一对应（AC1→Step 1、AC2→Step 2、AC3→Step 3）；三条边况（远征对照 / 镜像缺 config / `!!js` 形态）分别锚在 SC2 对照面、proposal NFR 教训、spike+3.9 裁决。忠实度无瑕疵。
2. **Surface 错配是最大结构性问题，且为同批最重。** `surface_types: ["web"]`，但 6 个步骤（3 主 + 3 边）**无一**是浏览器可观察的用户工作流：Step 1 的「枚举其技能目录」观察通道未声明（spike 实证走的是模型转录系统提示，非 web 面）；Step 2「机械 diff 双预设 standard 基础行与上游 standard.patch.yml」是对用户 profile 目录与上游仓的文件 diff；Step 3「检查预设行装配的 customSkillDirs 装配形态」是 YAML 内省。worker-provisioning 尚有 3/12 步浏览器面，本 journey 为 0/6。
3. **Web 强制派生 Outcome 双双缺席且无不适性记账。** `validation-error` 与 `session-expired` 全文零在场；最近似物 Step 2b「schema 拒绝 → broken 不上菜单」是配置文件级 schema 校验而非用户表单提交拒绝，且未被识别/标注为该类派生。
4. **推理标注机制整体缺位。** 全文零 `source: inferred`、零 `required_outcomes` 规则引用；「不静默降级」（Step 3b）等轻度推理声明未分类。
5. **测试可控性缺口（QA 视角）。** (a) Step 1 只断言缺席（「不含 write-prd 等」）无阳性对照——枚举面若空返回则断言空洞通过；(b) Step 2b/3b 的故障注入态（镜像行缺 config / 误用 `!!js`）与「预设声明行 = 产品工件，持续经 boot 物化」（prd-spec Data Notes）的再物化机制如何共存未说明；(c) 上游 diff 基线的获取与版本钉扎（dsh 0.x-rc next 线）Setup 未携带。

## Phase 2 — 维度评分

### 1. Completeness（完整性）— 146/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 元数据完整 | 46/50 | `journey: "preset-physical-isolation"` kebab-case ✓；`risk_level: "Low"` 合法且由内容支撑（观测型核查 + 可逆故障注入，无产品数据变异/不可逆操作）✓；`sources` 三份在列且覆盖绝大部分内容 ✓。扣分：证据指针（「spike S6-3 已实证」「3.9 补验实证」）指向的 spike/任务记录文档不在 `sources:`——作为 inline 证据引用可接受但溯源链在文件层面断开。 |
| Step 必备字段完整 | 62/80 | 每步均有 User Action + Expected Result ✓，三步序列（边界→镜像→装配形态）连贯 ✓。扣分：(a) Step 1/1b「枚举其技能目录」未声明观察通道（谁枚举、在哪看——web 面？会话转录？下游 agent 无从执行）；(b) Step 1「不含 write-prd **等**规格技能全集」——「等」未展开，spec 技能全集的精确清单（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks，SC2 有列）未落纸面；(c) Setup 无 2b/3b 故障态的建立手段（如何令「镜像行缺失某必填 config」「误用 `!!js`」发生并保持）；(d) happy 步全部无 Precondition 字段（仅边况有），依赖隐式 Setup 承接。 |
| 覆盖 happy + 强制派生场景 | 38/70 | 三条边况质量高（对照面 1b + 两类故障注入 2b/3b，互为正负控制）✓。但 Web surface 强制派生：`validation-error` / `session-expired` **双双零在场、零不适性说明**——rubric 明文「Score 0 if mandatory Outcomes are completely absent」，因 2b 提供一个未标注的 schema 拒绝近似物给残分。 |

### 2. Semantic Purity（语义纯度）— 153/200

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Outcome 自然语言 | 56/80 | 无 regex/CSS 选择器/XPath/`expect()` 类断言调用 ✓。扣分：测试编著元语言密集——「（技能枚举断言——spike S6-3 已实证同构物理边界）」「（契约面断言）」「断言通道 = 技能枚举，无需运行期探测」描述「怎么验」而非「观察到什么」；结论内嵌证据引用（「3.9 补验实证」「spike 裁决全形态死刑」）属评审注记非用户可观察现象。 |
| Preconditions 声明式 | 55/60 | 三条边况前置均为状态陈述 ✓（「远征会话已创建」「双预设镜像的 standard 基础行缺失某必填 config」「预设行 customSkillDirs 误用 `!!js` 表达式」）。小扣：2b 前置括注「（上游演进新增）」是成因叙述非状态条件。 |
| Step 无实现耦合 | 42/60 | 扣分：实现工件名饱和——`customSkillDirs`、`!!js` 表达式、`standard.patch.yml`、`tool-fs-search 的 sampleOverCapResults`、`boot overlay 注行物化`、config 全集（YAML 方言形态与具体工具配置键）。部分耦合为题材固有（本 journey 对象即物理装配边界），但 Expected Result 与 Step 动作两层均被内部机制名词占据，无一处以用户/系统可观察现象的语言重述。 |

### 3. Precondition Exclusivity（前置条件互斥性）— 134/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 同 Step 内前置互异 | 52/60 | 每步单 Outcome，结构上无同 Step 歧义 ✓；2b（缺 config）与 3b（`!!js` 形态）为两类可判别故障模态 ✓。扣分：happy 步零 Precondition（结构缺失使「步内互斥」退化为平凡满足而非设计达成）。 |
| 前置足以唯一选定 Outcome | 44/50 | 单 Outcome 结构平凡满足 ✓；happy 序列依赖隐式顺序承接（Step 2 隐含双预设已物化——Setup 有载 ✓，但步级未声明）。1b「（默认或显式）」双路径不影响结局选定 ✓。 |
| 错误/边界 Outcome 不缺前置 | 38/40 | 三条边界 Outcome 均带触发前置 ✓——本维度是全文最强项。小扣：2b/3b 前置只述状态不述可达性（如何造成该状态，见 Phase 1.5c）。 |

### 4. Fact Alignment（事实依据）— 91/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 事实声明可溯源 | 46/60 | 本次评审逐条对源验证：全部行为声明（S6-3 物理边界、sampleOverCapResults、broken 不上菜单、`!!js` 死刑 + 3.9 负对照、物化绝对路径、brainstorm 可用）在三份 sources 内逐字可溯——实质溯源同批最强档。扣分：全文无 fact_id/UNKNOWN 标记机制；「spike S6-3」「3.9 补验」指向 sources 之外的证据文档。 |
| 推理声明带规则支持 + `source: inferred` | 12/50 | 全文零 `source: inferred`、零 surface `required_outcomes` 规则引用。未标注推理：Step 3b「**不静默降级**」（源文档只证「broken 不上菜单」，「无静默降级」的否定式扩展未分类）；Web 强制派生理应触发的推理（validation-error / session-expired 的本地化形态或不适用记账）一处未生成。 |
| 无未分类幻觉 | 33/40 | 未发现与源文档相抵触的捏造声明 ✓（「不静默降级」「（默认或显式）」为合理灰区推理而非幻觉，不在本子项重罚）；因存在既非带溯源事实亦非带支持推理的灰区声明，不给满分。 |

### 5. Surface Fitness（Surface 适配）— 40/150（**低于最低线 90——唯一破线维度**）

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 强制派生 Outcome 在场 | 10/60 | surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。**两者完全缺席且无任何不适性记账**（如「本地单用户观测型核查无会话过期概念」的显式声明）。`validation-error` 最近似物 = Step 2b「schema 拒绝 → 整预设 broken 不上菜单」——满足「invalid data → 拒绝且不静默」的语义骨架，但属配置文件 schema 校验而非「error message displayed near the relevant field, form is not submitted」的用户表单形态，且文档未将其识别为该派生——给象征分。 |
| 测试策略比例 50/50 | 18/50 | Web 要求 Contract/Journey 平衡。本 journey 6 步中浏览器可观察步 ≈ 0（Step 1 含「创建突击会话」的 UI 起手，但其断言面「枚举技能目录」不在浏览器）——实质 **100% 契约面内容**（机械 diff / schema 拒绝 / 路径形态检查），Journey 侧（用户经 UI 的工作流）为零，且无「本旅程承担 50/50 的 Contract 半」式分工记账。 |
| Surface 执行假设现实性 | 12/40 | Web 执行模型应为浏览器自动化（DOM 可见性、交互响应、异步等待）——本文执行模型实为文件系统检查（diff profile 目录与上游仓、内省 YAML、注入配置故障），全程无浏览器交互假设；「技能枚举」的观察通道未声明（spike 实证通道 = 模型转录系统提示，非 web）。对声明的 web surface 而言假设不自洽，且未声明替代通道。 |

### 6. Internal Consistency（一致性）— 135/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| 不变量在每步成立 | 52/60 | 四条不变量逐步核验无违反 ✓：不变量四（`!!js` 死刑/恒物化绝对路径）↔ Step 3/3b ✓；不变量三（镜像不漂移）↔ Step 2/2b ✓；不变量一/二 ↔ Step 1 ✓。小扣：不变量二「**无需运行期探测**」为无限定表述，与 Step 1b「尝试 brainstorm」（远征侧运行期探测）存在措辞级张力——不变量实际只约束突击边界证明法，未加范围限定。 |
| 跨步引用一致 | 45/50 | 无悬空跨步引用 ✓；Setup 三条分别建立 Step 1（会话可创建）、Step 2（上游可对照）、Step 3（双预设已物化）的依赖 ✓。扣分：Setup「boot overlay 注行物化**或**首启模板预置」保留设计期二选一悬置（prd-spec 原文如此），两种形态下 diff 基线的文件落位不同——未指明测试以哪种形态为准。 |
| 风险级别与内容一致 | 38/40 | Low 成立：核查/观测型动作 + 可逆的本地 profile 故障注入，无产品数据变异、无不可逆操作 ✓。 |

### 7. Workflow Coverage（工作流覆盖度）— 116/150

| 子项 | 得分 | 判定依据 |
|---|---|---|
| Golden Path 在场（否决项） | 46/60 | **否决不触发**：Step 1→3 为连续三步序列，语义核验通过——PRD Story 6 本身即为真实用户故事（「As a 单人开发者 I want to 突击会话在物理上调不到规格技能…」），三条 AC 与三步一一对应，域级动词（枚举/diff/检查）非裸 API 调用。扣分：三步全为**纯验证步**（无状态推进、无实体操作串联）——golden-path 反模式边缘；Step 2「机械 diff」更近 QA/CI 动作而非产品域用户操作（题材固有，酌减）。`golden_path: false` 元数据与 feature 级约定一致（expedition-full-sdd-chain 承担该职），不计矛盾。 |
| 多步覆盖深度 | 38/50 | 正负控制结构良好（1b 远征对照为阳性对照；2b/3b 两类故障注入为阴性面）+ 错误面覆盖（broken 不上菜单）✓。深度受限：零状态迁移、零实体生命周期（题材固有）；三条边况均为单点检查，无跨步组合场景。 |
| 对 PRD 范围的工作流完备性 | 32/40 | Story 6 三条 AC 全覆盖 ✓。缺口：(a) SC2 预设层同族的「核心包技能目录无 git-commit / git-checkout 条目（移除/未迁断言）」不在本 journey 也不在此声明分工（实由 expedition 链 Story 3 AC2 覆盖，但纸面无分工声明）；(b) 「规格技能全集」精确清单未落纸（见 Completeness）；(c) 概览 SC1 的恢复会话投影重建（预设组合跨重启存续）与 L1 边界的交集面未触碰——非 Story 6 义务，小注。 |

## Phase 2.5 — 跨维度一致性核验

- 根因聚敛无双重计分滥用：Surface Fitness 破线的同一根因（Web 强制派生缺席 + 全契约面内容 + 零浏览器观察通道）按 rubric 交叉引用设计在 Completeness c3（-32）、Fact Alignment c2（分面）、Surface Fitness（主罚）三处计罚，各计其度量侧面。
- Fact Alignment 91（实质溯源强）与 Surface Fitness 40（surface 适配弱）的落差自洽：前者量「内容真不真」，后者量「形态对不对」——本 journey 内容真、形态错位，两数恰如实反映。
- 与同批口径一致：worker-provisioning（3/12 浏览器步）Surface Fitness 59，本 journey（0/6 浏览器步）40——梯度合理。
- 总分核算：146+153+134+91+40+135+116 = **815/1150**。

## 结论

**总分 815 / 1150 —— 未过门**（需 ≥975 且每维度 ≥ 最低线）。**Surface Fitness 40/150 低于最低线 90**，为唯一破线维度；总分亦不达 975。核心失分根因与 sibling journeys 同构但程度最重：声明的 web surface 与内容实质（100% 配置/文件级契约面核查）完全错位——Web 强制派生 Outcome（validation-error / session-expired）零在场零不适性记账，`source: inferred` 标注机制整体缺位，且 6 步中 0 步具备浏览器可观察面或声明的替代观察通道。内容层的忠实度与事实根基为同批最强档（全部声明逐字可溯、经本轮对源验证），修复面集中在 surface 适配与执行通道声明，不在内容重写。

## Phase 3 — Blindspot Hunt（rubric 之外）

1. **[blindspot] 空洞通过（vacuous pass）风险：缺席断言无阳性对照。** Step 1 Expected 只断言「**不含 write-prd 等规格技能全集**（技能枚举断言……）」——若枚举通道本身失效（空目录 / 会话未正确装配 / 枚举返回空），「不含 X」平凡通过，L1 边界实际已破却绿灯。spike S6-3 自身的方法学带阳性探针（突击目录 = [git-commit, m3-probe, run-tasks, run-tests, submit-task]——m3-probe 在场证明枚举有效），journey 未将该阳性控制落入任何步骤（1b 是跨会话对照，不救本会话枚举有效性）。Senior QA 教训：缺席断言必须配在场证明。
2. **[blindspot] 故障注入态与 boot 再物化机制的共存未设计。** 2b 前置「双预设镜像的 standard 基础行缺失某必填 config（上游演进新增）」与 3b「预设行 customSkillDirs 误用 `!!js` 表达式」要求测试者制造并**保持**损坏态；但 prd-spec Data Notes 明文「预设声明行（远征/突击镜像行）= 产品工件，**持续经 boot 物化**」——手工损坏的行在下次启动是否被 overlay 修复、注入应发生在 boot 前还是 boot 后、测试窗口多长，文档零交代。下游测试代理按纸面执行将得到不可复现的时序依赖结果。
3. **[blindspot] 上游 diff 基线的获取与版本钉扎未入 Setup。** Setup 仅「上游 standard.patch.yml 可对照（机械 diff 基线）」——对照哪个 checkout、哪个版本（proposal NFR 钉「dsh 0.x-rc `next` 线精确锁定」）未携带。安装的 dsh 版本与基线仓版本错位时机械 diff 产出假阳性漂移，Step 2 的「一致」断言失去判定效力。rubric 的 Completeness 只查字段在场，不查测试基线的确定性来源。

## 修复建议（供 reviser）

1. **解 Surface Fitness 破线（预计 +50~90）**：(a) 为 `validation-error` 落一个 web 面真身或显式识别 2b 为其配置面派生并补 `source: inferred` + 规则引用；(b) 为 `session-expired` 补本地化形态（如「应用重启后预设组合投影重建 + 技能边界保持」——恰是 S5 已验属性与本旅程的天然交集）或写明不适性记账（本地单用户观测型工作流无会话过期概念）；(c) 声明本旅程在 50/50 策略中承担 Contract 半的分工。
2. **为全部断言步声明观察通道**：「枚举技能目录」注明经会话转录/系统提示投影（spike 通道）或契约面直查；diff 与 YAML 内省显式记为契约面步骤。
3. **Step 1 补阳性对照**：突击枚举结果同时断言 core 技能在场（如 run-tests），封堵空洞通过。
4. **2b/3b 补故障注入规程**：注入时机（boot 后）、再物化对抗（如禁用 overlay 的测试形态或注入后不重启）、恢复清理。
5. **Setup 补上游基线钉扎**（dsh 0.x-rc next 线版本与获取途径）；「规格技能全集」落精确清单；不变量二补范围限定（「突击边界证明无需运行期探测」）。
6. **`sources:` 增补** spike 两文档与 3.9 记录（证据指针的文件级闭环）。
