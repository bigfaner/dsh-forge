# Journey Evaluation Report — iteration 1

- **Journey**: `proposal-review-mode-transition`（feature `dsh-forge-m3-bootstrap-presets`，surface `web`）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度 / 门槛 975 且每维度过线）
- **Surface rule**: `skills/gen-journeys/rules/surface-web.md`（Web 强制派生 Outcome = `validation-error` + `session-expired`；测试策略 50/50）
- **日期**: 2026-10-08
- **核验基**：journey 声明 sources 三件（prd-user-stories / prd-spec / proposal）逐条核对；另按事实核查需要延伸核对 prd-ui-functions.md / ui-design.md / page-map.md / ui/prototype/* / tasks/records/*（用于判定「渠道外事实」是否为幻觉）。

## 结论

**总分 856 / 1150 —— 未过门**（需 975 且每维度 ≥ 最低线）。**Surface Fitness 74/150 低于最低线 90**，为唯一破线维度；总分亦不达 975。核心失分根因一个：Web 强制派生 Outcome 无合规处置（`session-expired` 完全缺席且无不适性记账；`validation-error` 仅有一个未标注、缺错误提示断言面的 Web 层近似物），且全文推理标注机制（`source: inferred` / `required_outcomes` 规则引用）整体缺位——该根因在 Completeness / Fact Alignment / Surface Fitness 三个维度分面计罚。独立问题：大量 UI 微观断言只锚在**未列入 sources** 的文档上；Step 3 对比断言基线未定义；声明锚点（关键场景 3）中的打回/superseded 转移未被任何步骤行使。

| 维度 | 得分 | 最低线 | 结果 |
|---|---|---|---|
| 1. Completeness | 142/200 | 120 | 过 |
| 2. Semantic Purity | 165/200 | 120 | 过 |
| 3. Precondition Exclusivity | 125/150 | 90 | 过 |
| 4. Fact Alignment | 92/150 | 90 | 过（贴线） |
| 5. Surface Fitness | 74/150 | 90 | **破线** |
| 6. Internal Consistency | 131/150 | 90 | 过 |
| 7. Workflow Coverage | 126/150 | 90 | 过 |
| **合计** | **856/1150** | **975** | **未过** |

---

## Phase 1 — 推理审计（评分前锚点）

1. **问题→方案契合：良好。** Journey 忠实抽取 PRD Story 4「提案评审流转与 mode 人工升降级」：AC1 → Step 1（近逐字）、AC2 → Steps 3/4c（近逐字）、AC3 → Steps 4/5（近逐字）；Overview 四锚「（PRD Story 4；关键场景 3/7；业务流程五；SC3/SC6）」全部实存且内容吻合（本次评审已逐条核对三份声明源）。
2. **证据→方案支撑：强，但溯源渠道外溢。** 骨干断言可逐句对回声明源；然而相当比例的 UI 微观断言（「远征蓝 / 突击琥珀」「0 计数 disabled；多选并集显示；子 tab 切换清空选择」「⋯ 菜单点「评审流转…」」「远征⇄突击二选 + 说明必填 + 快照不回溯一行明示」「文档区标题「文档（N 篇）」」）只锚在 prd-ui-functions.md / ui-design.md / page-map.md——均**不在 frontmatter sources 内**。经延伸核对这些断言全部真实存在（非幻觉），但文档自带的声明源不足以自证。
3. **成功判据有效性：中。** Step 3 的「对比断言」比较基线未定义（对不同提案、未指定转移、未定义比较字段）；Step 4c「枚举 agent tool 面动词」、Step 4b「检查 feature 子 tab 与谱系」、Step 5「整数 ID / eval 豁免不变」的断言通道非浏览器可观察面。
4. **自相矛盾：未发现硬矛盾，且有亮点。** Step 4 主动消解了 Story 4 AC3 陈旧表述（「proposal ↔ feature 一致」）与 prd-spec SC3 新裁决（2026-10-08 tech-design 裁决⑥回写：「features 恒远征无列无需同步」）的漂移——采用新权威口径并显式注记，这是本批文档中处理事实漂移最好的一处。冗余双写两处（Step 1 vs Step 1c 的占位断言、Step 3 vs Step 4c 的契约断言），非矛盾但属重复。

---

## Phase 2 — 维度评分（对抗核验立场）

### 1. Completeness（完整性）— 142/200

**元数据完整（50/50）**
- name `proposal-review-mode-transition` 合 kebab-case；`risk_level: High` 合法且由内容正当化（提案状态流转含 superseded 不可逆演进、mode 变更、审计写入——状态变更类）；`golden_path: false` 与特性级指定（`expedition-full-sdd-chain` 为唯一 true）一致；sources 三件实存；模板字段全数在场。无扣分点（sources 覆盖面问题计入 Fact Alignment）。

**Step 必备字段齐全（62/80）**
- 5 happy + 8 edge 共 13 步，每步均有 User Action + Expected Result，edge 编号（1b/1c/2b/2c/3b/4b/4c/5b）全部锚回 happy step；edge 密度 8 ≥ happy 5 满足 High 档。
- 扣 6：**Step 2/Step 3 的对比方法论悬空**——Step 2「在某提案行 ⋯ 菜单点「评审流转…」，选目标态并填 reason 提交」未指明起始态与目标态（允许集随当前态变化），Step 3「agent 会话经 transitionProposal tool 对**另一提案**流转一次」后断言「写库结果与人工面**一致**（同门动词，对比断言）」——两次流转对象不同、转移未指定，「一致」比较什么（动词？审计形态？结果态？）未定义，对比既非同对象也非同转移，下游无法构造可判定的对比断言。
- 扣 4：Step 4c 动作不可由 web 用户执行——「**User Action**: 枚举 agent tool 面动词」是契约面枚举而非浏览器操作。
- 扣 3：Step 4b「检查 feature 子 tab 与谱系」为 UI 面 + 数据域混装（「谱系」在 M3 的用户面载体是 feature 子 tab 展开元数据列，追溯矩阵视图 = Out of Scope #13 / M3.75——文档未澄清所指，读者可能理解为不存在的视图）。
- 扣 4：Step 5「经「打开新会话」入口创建会话并查看既有任务与会话」——「查看既有任务与会话」在何处查看未指明；「整数 ID / eval 豁免不变」中 eval 豁免非 UI 可观察语义，断言通道未给。
- 扣 3：Step 1 单一 Expected Result 捆绑三个独立断言（过滤结果 + 逐行 mode chip 一致性 + 无溯源占位）——三者需要不同夹具视角（过滤态断言 / 逐行断言 / 特定旧提案行），下游无法拆分为可独立判定 Outcome。

**Outcome 覆盖 happy + 必备派生场景（30/70）**
- Happy path 完备；边界场景 8 个（chips 边界 / 占位 / 空因拒绝 / 允许集守卫 / 文档跳转 / 成链对照 / 契约面核查 / 视图一致性），密度与多样性为同批上层。
- 但 Web surface 强制派生 Outcome（surface-web.md「must be considered for every Web Journey」）无合规处置：`session-expired` **完全缺席**（无任何会话中断/连续性场景，也无「本地单用户应用无会话过期概念」类不适性记账——本文档恰有两个对话框表单，中途重启丢输入是天然本地化适配位）；`validation-error` 存在一个 Web 层功能近似物——Step 2b「拒绝且留场（空因拒绝）——不落部分写库；补因后可提交」语义覆盖「表单不提交、可更正重试」，但**缺规则要求的「error message displayed near the relevant field」断言面**（未言明用户看到何种近场错误提示），且未被识别/标注为该类派生；第二个派生位（模式更改对话框自身「说明必填」的空输入路径）零覆盖。既无派生也无不适记账，只能给低分（Web 层近似物 + 密集边界值得略高于同批无近似物者）。

### 2. Semantic Purity（语义纯度）— 165/200

**Outcome 自然语言、无 regex/选择器/断言调用（62/80）**
- 全文无 regex、无 CSS/XPath、无 `expect()` 调用。
- 扣分点一：验证策略括注遍布——「（断言）」「（对比断言）」「（契约断言——模式不可变边界）」「（两分支分化断言）」「（断言——状态机守卫）」，属「如何验证」而非「观察到什么」，非孤例。
- 扣分点二：Expected Result 内嵌库级/机制语言——「流转写库（同门动词）」「不落部分写库」「proposals.mode 更新」「registerFeature 单步成链（feature 行 + proposal_id 谱系 + 审计行）」。多为 PRD/UI 设计原词（不算硬违规），但对下游合同生成者是机制语言而非观察语言；「同门动词」尤其无法转译为用户可观察现象。

**前置条件为声明式（54/60）**
- Setup 三条与多数 edge 前置为状态声明（「扫描吸收的旧提案（创建时无 mode 字段）」「裁决对话框已选目标态但 reason 留空」「模式变更已提交（写库返回）」）✓。
- 扣 6：Step 1b 前置「某状态在库中计数为 0；**或多态并选**」——「多态并选」是用户动作选项而非系统状态，且一个前置以「或」捆绑三种触发（0 计数点击 / 多选 / 子 tab 切换），前置与输入未分离。

**Step 无实现耦合（49/60）**
- happy step 动作主体为用户级（打开子 tab / 点 chip / 菜单提交 / 创建会话）✓。
- 扣分点：Step 3 主语为 agent 工具调用（PRD 角色注记允许系统侧断言，但字段名与内容错位——同批 blitz 同型扣 2）；Step 4c「枚举 agent tool 面动词」= 契约面动作；Step 4b「检查 feature 子 tab 与谱系」= UI + 数据域混装；Step 3「对另一提案流转一次」以工具名为动作主体。合计扣 11。

### 3. Precondition Exclusivity（前置条件互斥性）— 125/150

**同 Step 内 Outcome 前置互异（50/60）**
- 本格式每 step 单一 Expected Result，字面无同 step 双 Outcome 碰撞；8 个 edge 前置彼此互异（0 计数 / 无溯源 / reason 空 / 中间态 / 挂文档 / accepted 远征 / 变更后 / 写库返回）。
- 扣 10：多场景捆绑进单一 Expected Result 而无各自前置——Step 1b 一个「或」前置下混装三种触发三种结果（0 计数 disabled / 多选并集 / 切换清空）；Step 5 一个结果里混装三个联动断言（新会话对齐 / 既有任务快照 / 既有会话 blank 锁）。互斥性靠步骤拆分勉强维持，下游 gen-contracts 无法从文档恢复各 Outcome 的独立前置。

**前置足以唯一定位 Outcome（40/50）**
- 各 edge 之间无歧义对。
- 扣 10：**Happy path 全部 step 无 step 级前置**（仅全局 Setup + 动作内隐含）——Step 2 依赖「某提案处于何态」（允许集随态变化，目标态列表因此不定）、Step 4b 依赖「一个 mode=expedition 且 accepted 的提案」（Setup 只说「各有代表」，未说 accepted 代表是远征模式）、Step 5 依赖「存在既有会话」（Setup 未声明任何已确立预设的既有会话）。合同生成者需自行补全三处关键前置。

**错误/边界 Outcome 前置无缺失（35/40）**
- 8 个 edge 均有显式 Precondition 且指明触发态，好于同批平均。
- 扣 5：Step 1b 的「或多态并选」使三种触发的边界共享一个前置，无法逐一判定；Step 4c 前置「模式经人工正门变更后」与 Step 5b「模式变更已提交（写库返回）」语义相近（变更后 vs 变更已落库），分界依赖读者推断「提交前/后」时序。

### 4. Fact Alignment（事实依据）— 92/150

**事实声明可溯源（46/60）**
- 声明源内溯源强：Step 1 ↔ Story 4 AC1 近逐字；Step 3 双断言 ↔ AC2 近逐字（「同门动词，对比断言」「agent tool 面无模式改写动词（契约断言）」）；Step 4 后半与 Step 5 ↔ AC3 近逐字；Step 4「features 恒远征无列无需同步」↔ prd-spec SC3（2026-10-08 裁决⑥回写后的最新口径，且主动消解了 AC3 陈旧表述的漂移——亮点）；Step 4b ↔ SC6 单步成链 + 突击无 feature 行；Step 3b 前半 ↔ SC6「文档跳转可用」+ 提案⑥「proposal.md 之外可挂任意文档」；Step 4c ↔ SC6 契约断言原词；Step 5b ↔ SC3「即时更新」+ 宪法 BIZ-product-001 直读口径；Overview 四锚全部实存。
- 扣 14：**渠道外事实占比过高**——「（远征蓝 / 突击琥珀）」↔ prd-ui-functions.md §41 / ui-design.md §21-22；「⋯ 菜单点「评审流转…」」「对话框目标态仅列五态机允许集 + reason 必填」↔ ui-design.md §57/§79；「远征⇄突击二选 + 说明必填 + 快照不回溯一行明示」↔ ui-design.md §80；「0 计数 disabled；多选并集显示；子 tab 切换清空选择」↔ page-map.md §29；「缺省占位（中性、不可点）」↔ prd-ui-functions.md §41；「文档区标题「文档（N 篇）」」↔ page-map.md §29；「五态机允许集（非法转移不可选——状态机守卫）」↔ ui-design.md §92 + 实现记录 4.2（allowedTransitions 窄矩阵）。这些断言经延伸核对全部为真（非幻觉），但**均不在 frontmatter sources 三件内**——下游仅凭声明源无法验证，构成溯源纪律缺口（应扩 sources 或逐条标注出处）。

**推理声明有规则支撑 + 标注（12/50）**
- 全文无任何一处 `source: inferred` 标注或对 surface `required_outcomes` 规则的引用；Web 强制派生（validation-error / session-expired）既未生成也未说明不适。推理标注机制整体缺位。Step 2b「不落部分写库」（拒绝时无部分写入的系统内部语义）、Step 1c「不伪装成任一模式」、Step 5b「无陈旧投影」均属合理生成推理，无一标注。

**无未分类幻觉（34/40）**
- 未发现与项目文档矛盾或无中生有的实体/数值/行为（渠道外断言经延伸核对全部真实；五态机矩阵、颜色令牌、对话框字段、chips 行为俱有出处）。
- 扣 6：「不落部分写库」与「无陈旧投影」为系统内部否定式断言（断言不存在某类写入/投影），无源可溯亦无标注，介于事实与推理之间未分类；「文档区标题「文档（N 篇）」计数真实」中「计数真实」不是可观察谓词（何谓不真实未定义），表述不可判定。

### 5. Surface Fitness（Surface 适配）— 74/150 【破线】

**强制派生 Outcome 在场（20/60）**
- surface-web.md：「Mandatory derived Outcomes (must be considered for every Web Journey): validation-error / session-expired」。
- `session-expired`：**完全缺席**——无任何会话中断/过期/连续性 Outcome，也无不适性记账。本文档有两个模态表单（评审流转对话框 / 模式更改对话框）+ 一次跨入口会话创建（Step 5），「对话框填写中途应用重启/关闭」「模式变更提交与「打开新会话」之间中断」均为天然本地化适配位，全部未触及。
- `validation-error`：Step 2b 为**Web 层功能近似物**（表单必填项留空 → 拒绝、留场、可更正重试）——比同批 blitz 的 worker 层近似物更贴规则语义，值得部分分；但缺规则明文的「error message displayed near the relevant field」断言面（用户看到什么反馈未言明）、未被识别/标注为该类派生、且第二个派生位（模式更改对话框「说明必填」的空输入路径）零覆盖。
- 无一处显式不适性说明。修订路径二选一：补派生 Outcome（对 2b 补近场错误提示断言 + 补模式对话框空说明 edge + 补会话中断续行 edge），或补显式不适记账（本地单用户、无登录会话）+ 近似物映射声明。

**测试策略比例（30/50）**
- Web 应 50/50（Contract/Journey）。Journey-smoke 素材扎实（13 步、多实体联动链）；Contract 侧素材尚可（8 个 edge 各带独立前置/动作/结果，可抽取为分支 Outcome），但每 step 单一 Outcome、同 step 无分叉、Step 1b/Step 5 多场景捆绑，Contract 层可测密度低于 50/50 预期。

**环境与执行假设现实（24/40）**
- UI 面步骤（1/1b/1c/2/2b/2c/3b/5b）浏览器可执行、断言面用户可观察 ✓，是同批中 web 面占比最高者；但相当分量断言落在库级/契约级（「写库（同门动词）」「不落部分写库」「proposals.mode 更新」「审计行」「谱系」「枚举动词」「eval 豁免」），与 surface 声明错位；「即时更新/即时同步」全程无 loading/异步稳定性考虑——surface-web.md async handling 原则未反映（对话框提交后的行状态刷新无等待策略提示位）。

### 6. Internal Consistency（一致性）— 131/150

**不变量在每步成立（56/60）**
- 核验通过：不变量 1（三律）在 Step 4（律三正门）/ Step 5（律一对齐 + 快照不回溯）成立；不变量 2（双面同门）在 Steps 2/3 成立；不变量 3（chip 恒一致）在 Step 1/5b 成立；不变量 4（快照语义）在 Step 5 成立。无违反。
- 扣 4：不变量 2「无第二写者」的成立依赖 UI 写入与 tool 写入同走 core 动词（tech-design：`forge:proposals/transition` RPC 与 transitionProposal tool 同门）——本文档未交代 UI 侧写入门类，「同门」为断言而非可从文档复原的机制事实（mode 更改的 `setProposalMode` UI 专属 RPC 与裁决动词不同名，文档亦未区分）。

**跨步引用一致（37/50）**
- Step 5「模式更改后」→ Step 4 ✓；Step 5b → Step 4 ✓；Step 2b/2c 锚 Step 2 对话框 ✓；Step 4「某在途 blitz 提案」→ Setup 第 2 条 ✓。
- 扣 6：Step 4b 前置「某远征提案被接受（accepted）」的夹具悬空——Setup 只保证「draft / under-review / accepted / rejected / superseded 各有代表；含带与不带 mode 溯源」，未说 accepted 代表的 mode；本 journey 也没有任何步骤把一个远征提案流转到 accepted（Step 2 的流转对象/目标未指定）。下游需自行构造。
- 扣 4：Step 3「对另一提案流转一次」的「另一」相对 Step 2 的「某」——两者均未指代具体提案，两次流转的可比性（见 Completeness 详述）悬空。
- 扣 3：Step 4c 与 Step 3 重复断言同一契约（「agent tool 面无模式改写动词」在两步各写一次）——非矛盾但同场景双写，与同批 mode-selection 的 Step 3/3b 双写同型。

**风险级别与内容一致（38/40）**
- High 成立：提案状态流转（含 superseded 不可逆演进语义）、mode 变更、审计写入俱在；edge 密度 8 ≥ 5。小额保留：核心变更链为 Steps 2–4，核查类步骤（4b/4c/5b）占三分之一强，判定无误但非零歧义。

### 7. Workflow Coverage（工作流覆盖度）— 126/150

**Golden Path 存在（veto 项，55/60）**
- veto 未触发：Steps 1→2→4→5 构成 4 步连续域级操作序列（打开提案子 tab 按态过滤 → 人工裁决流转 → 在途 blitz 提案升级远征 → 经「打开新会话」核查联动），逐条对应 PRD Story 4 核心工作流（AC1→AC3），语义核验通过；步骤均为域级用户操作，无 API 级描述。`golden_path: false` 元数据与特性级指定一致，非缺陷。
- 扣 5：严格连续的用户序列被 Step 3（agent 工具面）与 Step 5（核查步）隔断——Step 5 为 verification-only 步不推进用户目标；连续核心序列实为 1→2→4（已足够 3+，不触 veto）。

**多步覆盖深度（40/50）**
- 覆盖状态转移（五态机裁决对话框 + 允许集守卫）、实体联动（提案↔feature 成链对照 / 提案↔会话对齐 / 提案↔任务快照 / 溯源↔视图一致）、错误恢复（空因拒绝 → 补因重提）。深度良好。
- 扣 10：五态机的具体转移路径无一步实际行使——打回（under-review → draft）、否决（rejected）、superseded 演进链均只在 Overview 文字里出现（「做人工裁决（接受/打回/否决）」），步骤层面 Step 2 只做了一次未指明目标的泛化流转；同批 expedition-full-sdd-chain 已覆盖打回与 superseded，但本文档未做分工声明。

**对 PRD/Design 范围的完整度（31/40）**
- Story 4 三条 AC 全覆盖；业务流程五三步全落位；SC3/SC6 的本旅程辖域要素（mode chip 一致 / 双面同门 / 唯一正门 / 快照不回溯 / 成链对照）均有对应步骤。
- 扣 9：(a) Overview 自我声明的锚点「关键场景 3」含「打回修订（under-review → draft）；accepted → superseded 演进链可用」——两者在本 journey 零行使且无分工声明（已由姊妹旅程覆盖，可接受但须声明）；(b) 「接受/打回/否决」三裁决中否决（rejected）全批无旅程行使（rejected→draft 回环亦无）；(c) 裁决对话框 accepted 分叉文案（远征成链/突击直挂/未标记 NULL 边界——UI 设计与实现记录俱有的行为面）零覆盖。

---

## 跨维度一致性核验

- 最大失分根因（Web 强制派生 Outcome 无合规处置 + 推理标注机制缺位）在三个维度分面计罚：Completeness（30/70）、Fact Alignment（12/50）、Surface Fitness（20/60）。这是 rubric 的分面设计（存在性 / 标注纪律 / surface 合规），非重复计罚；修订该根因可同时回收约 90–130 分并解除破线。
- 「渠道外事实」只在 Fact Alignment 计罚一次（46/60）；这些断言经延伸核对为真，未按幻觉计罚（-30/实例规则未触发），Internal Consistency 与 Semantic Purity 未对其重复计分。
- Step 3 对比基线问题分置两维度：Completeness 扣（动作可执行性/判定条件）与 Internal Consistency 扣（跨步引用可比性），合计已控制在该两维度内。
- 各维度判分互不矛盾：`golden_path: false`（元数据）与 Workflow Coverage 给分（veto 未触发）一致；High 风险保留意见反映在 Internal Consistency 小额扣分；edge 密度优势同时反映在 Completeness 与 Precondition Exclusivity 的高位给分。

---

## Phase 3 — Blindspot 猭查（rubric 之外）

1. **[blindspot] 升级后接受路径的语义纠缠零覆盖。** Step 4 把「某 blitz 提案已建任务且在途」（Setup 第 2 条）升级为远征——「**User Action**: 单人开发者在提案子 tab 经 ⋯ 菜单（或 mode chip 快捷入口）将某在途 blitz 提案改为远征」。此后若该提案被评审 accepted，按成链门（SC3：「accepted ∧ mode=expedition 才成链」）将触发 registerFeature 建 feature 行，而其既有任务是 blitz 快照下**直挂提案**的（无 feature 挂接）——feature 行与直挂任务共存时任务容器归属（feature 容器 vs 突击提案容器）、谱系呈现、「既有任务照旧执行」与「新任务挂 feature」的分界全部未定义、未测试。journey 停在「快照不回溯」，没有走完升级提案的生命周期。
2. **[blindspot] 双面对比不是同构对比。** 「**Expected Result**: 写库结果与人工面**一致**（同门动词，对比断言）」建立在 Step 2 与 Step 3 对**不同提案**、做**未指定转移**的两次写库上——若 Step 2 做 under-review→accepted（远征提案还触发成链副作用）而 Step 3 做 draft→under-review，两次「写库结果」结构不同，「一致」不可判定。对比应同转移同形态（或显式定义比较字段 = 动词名 + 审计行形态），文档两者皆无。
3. **[blindspot] 模式更改对话框自身的校验路径缺席。** Step 4 断言「远征⇄突击二选 + 说明必填 + 快照不回溯一行明示」——「说明必填」意味着该对话框存在自己的空输入拒绝路径（实现与原型均在：`变更说明必填` 错误提示），但全文唯一的空输入 edge（Step 2b）只覆盖裁决对话框。这是 validation-error 在本工作流的第二个派生位，被漏掉。
4. **[blindspot] Setup 夹具不完整（三处步骤依赖未声明实体）。** Setup 只声明多态提案池、一个在途 blitz 提案、子 tab 可达与 agent 会话——Step 4b 需要「mode=expedition 且 accepted 的提案」（Setup 未指定 accepted 代表的模式）、Step 5 需要「已确立预设的既有会话」（验证「既有会话按 blank 锁保持原预设」，Setup 零会话夹具）、Step 3b 需要「挂多文档的提案」（仅 edge 前置自持）。下游 gen-test-scripts 的 fixture 规格无法从 Setup 推导。

---

## 修订指引（按回收分值排序）

1. **补 Web 强制派生 Outcome 或显式不适性记账**（预计 +90~130，解 Surface Fitness 破线）：validation-error 两处本地化——Step 2b 补「近场错误提示可见」断言面并显式识别为该类派生；补模式更改对话框空说明 edge（blindspot 3）。session-expired 本地化 = 对话框填写中途重启/中断续行（或显式记「本地单用户无会话过期」不适理由）。全部补 `source: inferred` + 规则引用。
2. **修对比断言方法论**（+10~20）：Step 2/3 指定同构转移（或定义比较字段集），Step 2 补起始态/目标态前置。
3. **扩 sources 或补渠道外断言出处**（+8~15）：将 prd-ui-functions.md / ui-design.md（或 page-map.md）纳入 sources，或在断言处标注出处文档；顺带为「不落部分写库」「无陈旧投影」等系统内部否定式断言补标注或改写为用户可观察表述。
4. **补关键场景 3 的转移行使或分工声明**（+5~10）：打回/superseded/否决要么落步（Step 2 泛化流转改为具体转移），要么声明由 expedition-full-sdd-chain 分担；Overview 锚点与实际覆盖面对齐。
5. **补齐 Setup 夹具与既有会话声明**（+5~10）：accepted 远征提案、既有确立会话、挂多文档提案入 Setup；Step 4b 澄清「谱系」= feature 子 tab 展开元数据（M3 载体），消解与 M3.75 追溯矩阵的歧义。
6. **拆分捆绑场景**（+5~8）：Step 1b 三触发各自成 edge；Step 5 三联动断言拆分或补各自前置；消除 Step 1/1c、Step 3/4c 的重复断言（保留一处并互相引用）。
