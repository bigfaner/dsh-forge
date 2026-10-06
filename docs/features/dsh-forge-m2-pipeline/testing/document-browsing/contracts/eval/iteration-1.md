# Contract Eval Report — document-browsing / iteration 1

- **Eval type**: contract | **Surface**: web | **Iteration**: 1
- **Target**: `docs/features/dsh-forge-m2-pipeline/testing/document-browsing/contracts/`（step-1 ~ step-5，共 5 份）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Result**: **856 / 1100 — FAIL**（目标 ≥935；且 Fixture Specification 0 < 60 触发维度最低线失守 + 实体完备性 veto）

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 135/150 | 90 | PASS |
| 2. Semantic Purity | 162/200 | 120 | PASS |
| 3. Precondition Exclusivity | 130/150 | 90 | PASS |
| 4. Fact Alignment | 107/150 | 90 | PASS |
| 5. Surface Fitness | 87/100 | 60 | PASS |
| 6. Internal Consistency | 145/150 | 90 | PASS |
| 7. Anchor Integrity | 90/100 | 60 | PASS |
| 8. Fixture Specification | **0/100** | 60 | **FAIL — 实体完备性 veto** |
| **Total** | **856/1100** | 935 | **FAIL → 需修订** |

---

## Phase 1 — Reasoning Audit（评分前独立判断）

忠实性核对：Journey 5 个 happy step + 4 个 edge case（2b 悬空 / 2c 去重 / 3b 渲染失败 / 5b 零命中）在 5 份 Contract 中全数落位，无遗漏步骤；每份 Contract 的 `## Journey Invariants` 四条与 journey.md 逐字一致。无步骤级漏分解。

但独立审计发现三处结构性隐患（后续在对应维度计分）：

1. **Step 5 fixture 漏 Proposal 实体**：Preconditions「features + proposals 在场」与 Input「浏览其概览提案 / feature 子 tab」均触碰 Proposal 域实体（proposals 表、五态、发现链建行），但 `fixture_spec.entities` 只有 Project/Feature/FeatureDocument。
2. **Step 4 自我矛盾**：把 validation-error 裁决为 N/A（「单一按钮动作（无输入面）」），同一文件的 Side-effect 却描述了一条拒绝面「越界即拒 ERR_DOC_PATH_INVALID 面」——被文字承认的错误路径没有落成可测 Outcome。
3. **多处 fixture 块引用未声明的父实体**：`parent_entity: "Feature"` 出现于 step-2（dangling/dedup）、step-3（两个 Outcome）及 step-2/3 文件级 Fixture Specification yaml，但这些块的 entities 列表里没有 Feature。

---

## Phase 2 — 逐维度计分

### 1. Completeness — 135/150

| Criterion | Score | 说明 |
|---|---|---|
| 四维非空（P/I/O/State） | 50/50 | 全部 12 个 Outcome 均含非空 Preconditions/Input/Output/State，Side-effect 显式 `none`，无缺维。 |
| Journey Invariants 段 | 50/50 | 5 份文件各有 `## Journey Invariants` 且 4 条全量在場。 |
| happy + 必派生场景 | 35/50 | 见下方扣分。 |

**扣分：Step 4 错误路径未分解为 Outcome（-15）**
> step-4 Side-effect：「系统编辑器进程启动（经 forge:docs/openExternal 主侧执行——先经桥校验路径在册，**越界即拒 ERR_DOC_PATH_INVALID 面**）」

契约自己在正文里命名了一条拒绝面（路径越界 → 拒绝），却没有对应的 `Outcome "path-out-of-registry-rejected"`。同文件又裁决「validation-error N/A — 单一按钮动作（无输入面）」，与该拒绝面直接抵触——越界拒绝正是该步的输入面校验错误。下游测试生成器拿到的是一条只测 happy path 的契约，被文字承认的错误行为零覆盖。Senior QA 视角：这是典型的「error path acknowledged but untested」。

其余评估：web 必派生（validation-error / session-expired）每份均有显式 N/A 裁决注释，只读浏览/本地单人工作台的豁免理由成立（除 step-4 如上）；且额外落地了 dangling/dedup/render-failure/zero-hit 四个边界 Outcome，超出下限。

### 2. Semantic Purity — 162/200

| Criterion | Score | 说明 |
|---|---|---|
| 自然语言、无 regex/选择器 | 80/80 | 全文无正则、CSS/XPath、断言调用。 |
| Preconditions 为声明式状态 | 52/60 | 见扣分 1。 |
| 无实现耦合 | 30/60 | 见扣分 2（6 处，各 -5）。 |

**扣分 1：Step 5 前置条件夹具搭建语气（-8）**
> step-5 Preconditions：「仓外项目**夹具**：按目录约定**预置**目录结构（features + proposals 在场）」

「夹具/预置」是给测试执行者的布置指令，不是系统应然状态的陈述。应改写为「仓外项目已注册且其目录内约定结构在场（features 与 proposals 均有约定文件）」。

**扣分 2：维度值内实现耦合（6 处，各 -5，共 -30）**
1. step-1 State：「只读列表 = **feature_documents 索引行**直读」——DB 表名。
2. step-2 Output：「正文只读渲染（**MarkdownDoc**）」——组件名。
3. step-2 State：「（**readDoc** 纯读）」——内部函数名。
4. step-2 dangling State：「**dangling=true** 只读返回：内容为空、**canonicalPath** 保留库内 **rel_path** 原值」——RPC 响应形状整体搬进 State 描述。
5. step-3 Output：「mermaid 库懒加载（含块才加载，**securityLevel=strict** 安全级）」——第三方库配置参数。
6. step-4 Output/Side-effect：「（shell 层 **openPath** 动作）」「经 **forge:docs/openExternal** 主侧执行」——内部动作名 + RPC 通道路径。

主断言语义均为行为级（「渲染为图」「开出独立文档 tab」「跳转系统关联编辑器」），实现细节以括号注记形式存在——但 rubric 对维度值中的 API 通道路径/表名/函数名是零容忍口径，按处计扣。建议将事实锚（通道名/错误码/配置）迁入 frontmatter 或专门的 facts 引用区，维度值保留行为语义。

### 3. Precondition Exclusivity — 130/150

| Criterion | Score | 说明 |
|---|---|---|
| 同 Step 内 Preconditions 互异 | 60/60 | 各 Outcome 前置条件字面与语义均不同。 |
| 前置条件足以唯一选中 Outcome | 30/50 | 见扣分。 |
| 错误/边界 Outcome 显式触发条件 | 40/40 | dangling（索引行在场+盘上缺席）、render-failure（源非法/引擎异常）、zero-hit（零命中）触发条件全部显式。 |

**扣分：step-2 success × same-doc-reopen-dedup 前置重叠（-20）**
> success Preconditions：「目标 design 文档行在场且文件在盘上（非悬空）；文档 tab 注册面可达」
> dedup Preconditions：「该文档的 tab 已打开（dswf-doc 按 address 已在场）」

给定系统态 {文件在盘、tab 已打开}，两个 Outcome 的前置条件同时为真——success 未声明「tab 尚未打开」。目前仅靠 dedup 的 Input 措辞「**再次**点击同一文档行」做过程性区分，前置维度本身不正交。修复：success Preconditions 补「该文档无已打开 tab」或等价排他子句。

（step-3 以内容合法性、step-5 以发现命中数互斥，均干净。）

### 4. Fact Alignment — 107/150

| Criterion | Score | 说明 |
|---|---|---|
| 事实声明可溯源 fact_id 或标 UNKNOWN | 42/60 | 见扣分 1。 |
| 推断声明有 required_outcomes 依据 + source: inferred | 35/50 | 见扣分 2。 |
| 无未分类幻觉声明 | 30/40 | 见扣分 3。 |

**扣分 1：全量事实声明零 fact_id 引用（-18）**
5 份契约 12 个 Outcome 断言了大量具体系统行为——经本评审核对均与事实表吻合（悬空返回形状 ↔ M2_DOCS_PATH_GUARD；mermaid 懒加载/strict/回退卡 ↔ M2_MERMAID_RENDERING；openExternal 主侧+在册校验+跳转不写 ↔ M2_OPEN_EXTERNAL_GUARD；address/docRel 去重 revealIfOpened ↔ M2_OVERVIEW_TAB_REGISTRATION）——但**没有任何一处引用 fact_id**，sources 仅指向 journey.md。评测者替文档完成了溯源，rubric 要求「must be traceable to a specific fact_id」，按系统性缺注计扣（因内容核实为真，从轻）。

**扣分 2：N/A 裁决缺 `source: inferred` 注记（-15）**
> 每份文件注释：「web-surface-required adjudication: validation-error N/A — 只读浏览面，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。」

裁决给出了推理依据（对应 surface 规则条款），这是好的；但按 rubric 推断类声明须带 `source: inferred` 标注，全部缺失。

**扣分 3：一处未经证实的具体断言（-10）**
> step-4 Side-effect：「越界即拒 **ERR_DOC_PATH_INVALID** 面」

事实表中 ERR_DOC_PATH_INVALID 仅被 M2_DOCS_PATH_GUARD 归属于 **readDoc** 路径守卫；M2_OPEN_EXTERNAL_GUARD 对 openExternal 越界只说「out-of-set paths rejected」，未命名错误码。将 readDoc 的错误码安到 openExternal 拒绝面上是无 fact 支撑的外推，且未标 UNKNOWN。要么补代码侦察证据，要么降格为「越界即拒（错误面在场）」并标 UNKNOWN。

### 5. Surface Fitness — 87/100

| Criterion | Score | 说明 |
|---|---|---|
| 必派生 Outcome | 30/40 | 见扣分。 |
| Surface 恰当语言 | 32/35 | web 语汇（tab/dock/点击/徽标/路径栏/渲染）使用到位；-3：step-4 Side-effect 以 RPC 通道语法（forge:docs/openExternal）充当用户面描述，属 API 语汇渗入 web 契约（轻微，主要已计于 Semantic Purity，此处按 surface 语言适配轻扣）。 |
| TUI 超时 Outcome | 25/25 | 非 TUI surface，满分。 |

**扣分：step-4 的 validation-error N/A 裁决被自身正文证伪（-10）**
> 「validation-error N/A — 单一按钮动作（无输入面）」vs 同文件「越界即拒 ERR_DOC_PATH_INVALID 面」

既然存在可触发的拒绝面，该步的 validation-error 派生并非 N/A，而是应落成一个越界拒绝 Outcome。其余四份的 N/A 裁决成立。

### 6. Internal Consistency — 145/150

| Criterion | Score | 说明 |
|---|---|---|
| 不变量在每份契约成立 | 60/60 | 只读纪律的四条不变量无违例；step-4 对豁免面的处理显式且自洽：「跳转不写文件（只读纪律豁免面 = 跳转本身，非写入）」。 |
| 跨契约状态引用一致 | 45/50 | 见扣分。 |
| 前置与前置步 State 变化可达 | 40/40 | step-3「已打开的文档」/ step-4「文档 tab 已打开」均由 step-2 Output「dock 开出独立文档 tab」铺就；step-2「目标 design 文档行在场」由 step-1 文档行（含 design）铺就；step-5 自含项目切换。链路无断头。 |

**扣分：step-2 文件内去重键口径漂移（-5）**
> 同一文件 Output：「dock 开出独立文档 tab（按 **docRel** 去重）」
> 同一文件 anchors.layout：「按 **address/docRel** 去重，revealIfOpened」

page-map 原文为「按 address 去重」，事实表 M2_OVERVIEW_TAB_REGISTRATION 为「dedup by address/docRel」。三种口径在一份文件内并存，下游选择器/断言作者无法确定去重键的规范形态。应统一为单一权威表述（建议 address=通道+docRel 复合键的完整定义）并全文一致。

### 7. Anchor Integrity — 90/100

手册在場（`design/page-map.md`），按 web 表（必填 `page`）执行检查。

| Criterion | Score | 说明 |
|---|---|---|
| 锚点字段完备 | 40/40 | 5 份契约均有 `anchors.web.page`（另附 route/requires_auth/layout，超配）。 |
| 锚点值与手册一致 | 20/30 | 见扣分。 |
| 手册内部无冲突 | 30/30 | dswf-overview（singleton, replaceTab）与 dswf-doc（multiple, address 去重）定义无重复/冲突；本 journey 涉及的两页均被锚定（其余手册条目属别的 journey 范围，不要求本组覆盖）。 |

**扣分：step-5 复合 page 值与单一 route 不匹配（-10）**
> step-5 anchors：「page: "右栏「项目概览」tab（dswf-overview）提案 / feature 子 tab **+ 右栏「文档」tab（dswf-doc）**"、route: "dswf-overview"」

page 声明横跨两本手册页，route 只锚定 dswf-overview；而该步 Input「…并点开文档」实际会开出 dswf-doc tab。按 route 驱动导航的下游生成器会漏掉文档 tab 腿。应拆双锚（两条 anchor 记录）或补 route 列表。

#### Missing Anchor Fields

| Contract | 缺失字段 | 说明 |
|---|---|---|
| （无） | — | 5 份契约 `page` 字段全数在場 |

#### Handbook Conflicts

| 冲突类型 | 位置 | 说明 |
|---|---|---|
| （无） | — | page-map.md 内无同页异径/同逻辑异页冲突 |

### 8. Fixture Specification — 0/100（实体完备性 veto 触发）

> **Veto 依据（rubric 原文）**：「Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from `fixture_spec.entities` — this triggers the veto.」

**触发事实：step-5 引用 Proposal 实体但 fixture 未声明**
> Preconditions：「按目录约定预置目录结构（features + **proposals 在场**）且已注册」
> Input：「切换到仓外项目，浏览其概览**提案** / feature 子 tab 并点开文档」
> zero-hit Preconditions：「features 与 **proposals** 均无约定文件」

Proposal 是设计文档明载的域实体（tech-design Data Models：`proposals | id(uuid PK), slug(UK), proposal_status(五态), rel_path`；概览「提案」子 tab 的数据源 forge:proposals/list）。步骤的前置与输入都读它，`fixture_spec.entities`（Outcome 级与文件级 yaml 双双）只有 Project/Feature/FeatureDocument。后果具体可感：按此 fixture 播种的测试打开提案子 tab 将拿到空列表，「浏览提案子 tab」这一半的输入动作无数据支撑，与 zero-hit 态失去区分度。**veto 生效，整维 0 分。**

（若未触发 veto，本维其余子分亦仅中等，供修订参考：）
- 关系/约束覆盖 15/35：step-2 dangling、step-2 dedup、step-3 两个 Outcome 及 step-2/step-3 文件级 yaml 中 `parent_entity: "Feature"` 引用了**未声明**的 Feature 实体（-10 量级）；step-2 dedup 把 UI 态伪装成数据约束——`field_constraints: [{field: "openState", value: "文档 A 的 tab 已打开…"}]`，openState 不是 feature_documents 的任何域字段（PK=(feature_id, doc_kind)，rel_path），fixture 播种不了 tab 态（-5 量级）。
- min_count 15/25：step-1（FeatureDocument×2 多类）、step-2 dedup（×2 A/B 对照）、step-5（Project×2 仓内/仓外）设定合理；但 step-5 提案子 tab 浏览所需的 proposal 行无 min_count（因实体缺席）。

---

## Phase 3 — Blindspot Hunt（rubric 之外）

1. **[blindspot] 零加载断言不可测** — step-3 success State：「无变更（纯渲染；**无 mermaid 块的文档零加载**）」。「零加载」是对**不含 mermaid 的文档**的断言，却挂在「正文含合法 mermaid erDiagram 代码块」fixture 的 Outcome 里——该断言在本 Outcome 的夹具下永假、无法执行。需要独立 Outcome（无 mermaid 块文档 fixture + 断言懒加载未触发）或删除该子句。
2. **[blindspot] dedup Outcome 双动作合流** — step-2 dedup Output：「激活已有 tab（不新开）；**多文档可并存开多个 tab（文档 B 点击后另开新 tab）**」。一个 Outcome 塞了两个用户动作（重开 A + 首开 B）；「B 未打开」只存在于 fixture 约束散文，Preconditions 未声明，生成器会得到一个前置只覆盖一半行为的复合用例。应拆分或在 Preconditions 显式声明 A/B 开闭态。
3. **[blindspot] 编辑器未配置边界无覆盖** — step-4 Preconditions：「…系统**关联编辑器已配置**」。前置承认了「未配置编辑器」是可达状态，却无对应 Outcome（点击后行为未定义）。本地工作台换机/裸机场景真实存在，属漏测边界。
4. **[blindspot] 发现链扫描失败无 Outcome** — step-1 Output：「文档行经真实发现链建行（注册 / 首次打开只读扫描按目录约定）」。发现链是本 journey 的数据地基，目录不可读/文件权限异常等扫描失败面零覆盖；loading/skeleton 中间态（M2_E2E_ANCHOR_SET 明载 doc-skeleton 锚）也未成 Outcome。风险低（Low journey）可谅解，但修订时可顺手补 loading-state（web surface 的常见附加派生）。
5. **[blindspot] 溯源债** — 全部 5 份零 fact_id 引用（已计入 Fact Alignment）；修订时建议在 Outcome 级增加 `facts: [M2_DOCS_PATH_GUARD, …]` 引用列，一次性偿清。

---

## Attack Points 汇总（修订清单，按优先级）

1. [Fixture Specification] **补 Proposal 实体到 step-5 两级 fixture_spec**（success 与 zero-hit 的对照口径也要随之校准）——当前触发整维 veto。
2. [Fixture Specification] 补齐 `parent_entity: Feature` 引用处的 Feature 实体声明（step-2 dangling/dedup、step-3 两 Outcome、step-2/3 文件级 yaml）；将 dedup 的 `openState` 伪字段约束迁出 entity field_constraints。
3. [Completeness/Surface Fitness] step-4 落成「路径越界拒绝」Outcome（撤销该步 validation-error N/A 裁决），并把 ERR_DOC_PATH_INVALID 归属核实或标 UNKNOWN。
4. [Precondition Exclusivity] step-2 success 补「该文档无已打开 tab」排他子句。
5. [Anchor Integrity] step-5 拆双页锚或补 route。
6. [Internal Consistency] 统一去重键口径（docRel vs address/docRel）。
7. [Semantic Purity] 六处实现耦合注记迁移；step-5 前置条件去「夹具/预置」语气。
8. [Fact Alignment] 补 fact_id 引用与 `source: inferred` 标注。
9. [blindspot] mermaid 零加载断言独立成 Outcome；dedup 双动作拆分；编辑器未配置边界裁决。

## Final Summary

- **Total: 856/1100（FAIL，目标 935）**
- **唯一低于最低线维度**：Fixture Specification 0/100（实体完备性 veto：step-5 缺 Proposal 实体）
- 结构质量整体良好（步骤分解全、不变量全量落位、链路引用无断头、锚点基本齐整）；失分集中于 fixture 实体完备性、fact 溯源注记、step-4 错误路径缺位与散布的实现耦合。
