# Contract Eval Report — multi-project-management / iteration 2

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-{1..5}-*.md`(5 份,共 16 个 Outcome —— 本轮新增 step-3 external-auth-declined / external-authorized-unreadable,扩展 step-1 wizard-abandon-guard 双腿、step-5 success 重注册回环)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / design/tech-design.md(实体模型核验)/ .forge/fact-table.json(FT-001..FT-056)/ gen-journeys rules/surface-web.md / 代码侦察(apps/desktop/src/main/workbench/{repos,ipc,store}、packages/plugins/forge-workbench/src/client/WorkbenchShell.tsx)
- **Iteration**: 2(上一轮:iteration-1,942/1100,FAIL —— Fixture Specification veto)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 198/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 150/150 | 90 | ✓ |
| 4. Fact Alignment | 146/150 | 90 | ✓ |
| 5. Surface Fitness | 100/100 | 60 | ✓ |
| 6. Internal Consistency | 140/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | 100/100 | 60 | ✓ |
| **Total** | **1084/1100** | 935 | ✓ |

**Overall: PASS** — 总分 1084 ≥ 935 且全部维度过阈值。iteration-1 的 8 项 Attack 全部得到实质处理(veto 解除、FT 锚补齐、UNKNOWN/inferred 归类、oracle 通道归位、生命周期指令移出 Preconditions、守卫双腿补齐、链序 4/5 两腿补齐、重注册回环补齐)。本轮新发现 2 处维度内缺陷(均为修订引入或暴露)与 1 处 blindspot,均不阻断过关。

---

## Phase 1 — Reasoning Audit(评分前独立判断)

### 上一轮 Attack 处置核验

| iteration-1 Attack | 处置 | 核验 |
|---|---|---|
| #1 Fixture veto(Step 4/5 实体缺席) | 已修 | step-4 success 声明 Project×2+Task×2+Feature×2+SessionLink×2(belongs_to 链齐);step-5 success / remove-active-with-remaining 声明 Project×2+Task×2+Feature×1+SessionLink×1,且分布约束显式落被移除/剩余项目 —— 级联与切换断言非空洞 |
| #2 FT 误标/零注释 | 已修 | duplicate-registration / code-root-unreadable / remove-active 改为「事实锚:FT-xxx」+ 仅呈现层留 inferred;same-path-conflict(FT-037(3))、external-auth-required(FT-051)补锚 |
| #3 未分类主张 | 已修 | `code_root 规范化` → `路径规范化口径未收录于事实表,UNKNOWN`(step-3 success State);`零 forge CLI 调用` → `source: inferred` 注释(FT-038+FT-039 依据)(step-2 success) |
| #4 Output/State 内嵌对拍通道 | 已修 | step-5 Output 去掉快照对拍括注,通道移入 state_requirements;step-3/step-4 State 的「状态读数对拍」移入 state_requirements |
| #5 实现词表 | 已修 | authorizeExternalDocPath 动词名、UNIQUE(code_root)、校验链序号、z1200、SQLite 全部清除,换行为语言 + FT 锚 |
| #6 external-auth-required 双输入捆绑 | 已修 | 拆为 external-auth-required(勾选→完成)与 external-auth-declined(不勾选→完成不可用),前置显式互斥标注 |
| #7 Preconditions 混生命周期指令 | 已修 | step-1 一次性 fixture、step-4 路径失效注入均移入 state_requirements |
| #8 blindspot ×3 | 已修 | 守卫双腿(「两个选择都被尊重…取消放弃则守卫关闭…已有输入完整保留」)、ERR_EXTERNAL_PATH_UNREADABLE 用户面(external-authorized-unreadable)、重注册回环(`同一 code_root 此后可再次注册成功`) |

### 独立判断(预评分锚点)

1. **问题→Solution**:16 个 Outcome 逐一对照 journey 5 happy + 7 edge 步,映射完整;边路 Outcome 按 FT-037 拒绝优先序(2/3/4/5/6/7)成体系展开,step-3 五腿按「仓内默认 / 仓外=代码根 / 仓外≠根×(未勾选/勾选可读/勾选后不可读)」干净三分。无代理测试错位。
2. **Solution→Evidence**:逐 Outcome 核验 fixture_spec 能否支撑断言 —— step-4/5 的切换/级联/保留断言所需 Task/Feature/SessionLink 全部到场且按项目分布定量;授权记录经查 schema-v1.sql(六表:projects/app_state/session_links/task_snapshot/feature_snapshot/sync_state)与 tech-design 实体模型,**无独立授权实体**,state_requirement(`授权记录为空`)建模正确,不触发 veto。
3. **Evidence→Success Criteria**:Output 均为用户可观测面(错误文案含路径与原因、失联卡引导、空态自动进向导、重注册成功);State 内 active_project_id/ERR_*/watch 链均为家族先例接受的 SoT 键名或 FT 锚定事实。
4. **自反矛盾检查**:step-3 新增两腿互斥性经显式交叉引用成立;step-1 守卫双腿为同一交互的两选择腿(navigation-guard 规范原话「user choice respected」即要求双腿同测),单一 Outcome 覆盖合规。**但发现一处修订引入的张力**:step-5 success 的复合 Input(移除+重注册)与其 State「激活指针不变(仍指第一个项目)」、以及 step-3 success「active_project_id 指向新项目」三方未做时间作用域切分(见 Internal Consistency)。另经代码侦察:WorkbenchShell.tsx:378 注释明言「the register verb itself never activates」,而 PRD(prd-ui-functions.md:61)与 journey 断言「注册完成,激活该项目」—— 注册即激活主张无事实表锚且与现行代码相抵,属未归类强主张(见 Fact Alignment)。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:16 个 Outcome 的 Preconditions/Input/Output/State 全部非空,Side-effect 全部显式(step-1 `"none(打开向导零落库)"`、step-3 external-auth-required `"授权记录与项目行均写工作台自有库;零项目目录写入"`)。无缺失。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 3 条,与 journey.md 逐字一致。
- **派生场景覆盖(50/50)**:validation-error 两实例(no-forge-data 映射注释点名 same-path-conflict 为第二实例)、session-expired 通道失效类比映射(step-4)、navigation-guard 双腿(step-1)、already-exists 类比(duplicate-registration)、移除边界两腿 + 授权链三腿。超出 Web 面强制线。

### 2. Semantic Purity — 198/200

- **c1 自然语言、无 code/regex(79/80,−1)**:无 regex/选择器/XPath/框架断言;oracle 通道(状态读数对拍、文件树快照对拍)全部归位 state_requirements。残留一处编辑脚手架语言入维值:step-4 success State `active_project_id 更新为目标项目(单激活;读数口径见 state_requirements)` —— 维值内出现指向本文档其它小节的元引用,非系统行为描述。−1。
- **c2 Preconditions 声明式(60/60)**:全部声明式(`向导处于步骤 ②;所选代码根目录检出通过`、`注册表中已有至少 2 个项目,当前激活第二个项目`);一次性 fixture、路径失效注入、授权后不可读注入均已移入 state_requirements。
- **c3 无实现耦合(59/60,−1)**:active_project_id / doc_location_type 等为工作台自有 SoT 键名(tech-design 数据字典实名,家族先例接受);watch 链/停链为 FT-047 锚定事实语言;ERR_* 为 FT-031 一等契约。残留:step-5 success Input 为复合动作(`执行移除并确认二次确认弹层,随后对同一根目录重新发起注册`),把两个用户流程捆进单一 Input 且 State 仅描述移除腿 —— 归入实现可执行性歧义,−1(其一致性后果在 Internal Consistency 计分)。

### 3. Precondition Exclusivity — 150/150

- **c1 前置互斥(60/60)**:step-2 四腿显式互斥(`不可读——…(与未检出 forge 数据、已注册两情形互斥)`)且与 FT-037 拒绝优先序一致;step-3 五腿交叉标注(`与 external-auth-required 以授权勾选状态互斥;与 same-path-conflict 以路径异于代码根目录互斥`、`与 external-auth-required 以路径可读性互斥`);step-5 按激活态×剩余量三分。无共享或语义等价前置。
- **c2 前置足以唯一定位(50/50)**:各腿前置(路径形态×授权勾选态×可读性×注册态)组合后均唯一命中;上一轮 external-auth-required 双输入捆绑已拆解。
- **c3 边界触发条件显式(40/40)**:全部边界腿显式给出触发态;新增两腿同样显式(`授权确认处于未勾选状态` / `用户已勾选确认授权(授权记录已落库),但该路径已不可读——被移动/删除或无权限`)。

### 4. Fact Alignment — 146/150

- **c1 事实主张可溯源或标 UNKNOWN(56/60,−4)**:逐条独立核验 FT-053/038/037(2)(3)(5)(6)(7)/036/047/051 全部引用与事实表吻合(含消息细节:`错误提示含路径与原因(不存在/权限被拒/非目录)` = FT-037(2) 逐字;`未提供时默认目录名`/`in_repo → 路径为空` = FT-036;`停链仅及被移除项目` = FT-047 removeProject 条款);UNKNOWN 标注规范(`路径规范化口径未收录于事实表,UNKNOWN`)。**残留一条未归类强主张**:step-3 success 断言 `该项目被激活并进入工作台` + State `active_project_id 指向新项目;watch 链按新激活项目重建` —— 事实表无「注册即激活」事实,该主张无 FT 锚、无 `source: inferred`、无 UNKNOWN;且代码侦察(WorkbenchShell.tsx:378「the register verb itself never activates, activateProject is the single-active transaction」)与现行实现相抵(PRD prd-ui-functions.md:61 为意图源)。须补 `source: inferred <PRD UF1/journey>` 或锚定新事实,否则执行者无从判据。−4。
- **c2 inferred 主张带规则依据 + 标注(50/50)**:external-auth-declined(`推自 journey Step 3c 口径(授权确认为仓外注册的前置关卡)`)、project-path-invalid(UF4 校验规则 + e2e sc5 依据)、wizard-abandon-guard(page-map 浮层契约依据)、duplicate-registration 的呈现层(tech-design 错误码表文案)、remove-active 的引导卡(tasks 裁决 + e2e)—— 全部 basis + `source: inferred` 成对;事实/推理拆分干净。
- **c3 无未分类幻觉(40/40)**:上一轮两条未分类主张均已归类;除 c1 所列注册激活主张(已在 c1 计分,不重复扣)外无新幻觉。

### 5. Surface Fitness — 100/100

- **强制派生 Outcome(40/40)**:validation-error(两实例)与 session-expired(离线桌面无会话面 → 数据通道失效类比)均以 `<!-- surface-web required_outcomes 映射 -->` 注释到场,处置符合项目映射约定。
- **Surface 语言适配(35/35)**:通篇用户交互/页面元素/异步(`点「添加项目」`、`勾选确认授权`、`显示扫描中 loading 指示`、`二次确认弹层`、`失联/不可访问提示`);无 DOM 选择器或框架断言。
- **TUI 超时(25/25)**:Web 面,不适用,满分。

### 6. Internal Consistency — 140/150

- **不变量逐份成立(60/60)**:三分模型 —— 所有写路径 `只写工作台自有库…零项目目录写入`;移除只删注册 —— step-4b `注册表行保留(不自动删除)`、step-5 以 state_requirement 文件树快照对拍为 oracle(`不以「没报错」为据`);单激活 —— step-3 `激活新项目即原项目去激活`、step-5b/5c 指针清空(0 ≤ 1)。无违规。
- **跨 Contract 状态引用一致(40/50,−10)**:step-1→5 主链闭合(`停在步骤 ①`→`向导处于步骤 ①`→`向导前进至步骤 ②`→`该项目被激活`→`切换回第一个项目`→`第二个项目已注册且当前未激活`)。**但 step-5 success 修订引入的重注册回环未做作用域切分,形成三方张力**:Input `随后对同一根目录重新发起注册` + Output `同一 code_root 此后可再次注册成功`,而 State 断言 `激活指针不变(仍指第一个项目);感知链不受影响` —— 若注册即激活成立(step-3 success `active_project_id 指向新项目` + FT-047 激活切换全量重建 watch),则复合 Input 完成后激活指针与感知链必然变更为新项目,State 两断言按字面读即与 step-3 语义冲突;若按移除腿局部读,文档又未声明该作用域,且重注册腿的落库后状态(新 projects 行、激活、watch 重建)在 State 中完全缺席。−10。
- **前置与上游 State 相容(40/40)**:逐腿核对无不可达前置;external-authorized-unreadable 的「授权落库后注入不可读」经 state_requirement 显式供给,可达。

### 7. Anchor Integrity — 100/100

Handbook(`design/page-map.md`)存在,按 Web 面 `page` 字段评分。`route: ""` 系 FT-053/page-map 明言的视图键寻址设计,非锚点缺陷(评估口径明示)。

- **锚点字段完整(40/40)**:5 份文件均有 page/route/requires_auth/layout,无缺失(见下表)。

### Missing Anchor Fields

| Contract File | Missing Field | Expected Value |
|---|---|---|
| (none) | — | — |

- **锚点值与 handbook 一致(30/30)**:`workbench/overview` 精确匹配 View Key ×5;layout 串与 page-map 组件逐项对上(RegisterWizard 3 步、TopBar 项目切换器(Menu 卡)、OverviewPage 项目卡 + workbench/dialog 移除确认浮层);`requires_auth: false` ↔ `Auth: none(单用户桌面)`。浮层步骤锚父页 + layout 标 `workbench/dialog` 键族,与家族先例一致。
- **Handbook 内部一致(30/30)**:视图键(overview/tasks/features/:slug/dialog/*/session)无重复、无同键异径冲突。

### Handbook Conflicts

| Conflict Type | Entry A | Entry B | Description |
|---|---|---|---|
| (none) | — | — | — |

### 8. Fixture Specification — 100/100(veto 解除)

- **实体完整性(40/40)**:实体类型逐一对照 tech-design 领域模型与 schema-v1.sql 六表:Project(projects)、Task(task_snapshot)、Feature(feature_snapshot)、SessionLink(session_links)均为设计文档实名实体;授权记录无独立实体(经查 schema 与设计),以 state_requirement(`授权记录为空`)建模与 SessionLink 缺席钉住口径同理,正确。step-1..3 断言面仅及注册表/向导态,Project×1 + 路径经 state_requirements 供给,合规;step-4/5 断言面的 Task/Feature/SessionLink 全部到场 —— 无缺席实体,veto 不触发。
- **关系与约束覆盖(35/35)**:Task/Feature `belongs_to Project`、SessionLink `belongs_to Task` 全部声明;分布约束显式(`两项目各至少 1 个任务(「完整切换」断言非空洞)`、`被移除项目的任务至少 1 条挂接(「不残留挂接数据」断言非空洞)`);duplicate-registration 的 codeRoot 钉住(`与向导将选路径相同(已注册)`)、remove-last 的注册表计数转 state_requirement(`注册表仅剩此一个项目(项目行数 = 1)`)—— 上一轮指出的字段建模问题已改。
- **最小数据量(25/25)**:判「完整切换」= 两项目各 1 Task/Feature/SessionLink ✓;判「级联非空洞」= 被移除项目持有 Feature×1+SessionLink×1 ✓;判「不残留/剩余可浏览」= 剩余项目持有 Task ✓;remove-last 仅断言注册表/空态,Project×1 足额。家族口径(SessionLink 工作台自有 SoT 必须声明)全面达标。

---

## Cross-Dimension Coherence Check

- Fact Alignment 的「注册即激活未归类」与 Internal Consistency 的「重注册回环作用域缺失」同源一体:同一主张缺口在两维分别计分(归类责任 vs 状态链一致性),对象不同,无双重扣分。
- Semantic Purity c3 的复合 Input 扣分与 Internal Consistency c2 的 State 作用域扣分为同一修订动作的两面(可执行性歧义 vs 状态断言矛盾),各计 1 分量。
- Fixture 100 与上一轮 0 的翻转由实体补齐驱动;本轮实体核验额外做了设计文档 + schema 双向对照(语义验证),非仅非空检查。
- Completeness/Surface/Anchor 三维持满与上一轮一致,修订未引入结构性回归。

## Phase 3 — Blindspot Hunt(维度外发现)

1. **[blindspot] FT-037(3) 的三个冲突源只测了一个,且锚注释把事实收窄**:step-3 same-path-conflict 注释引 `事实锚:FT-037(3)(仓外文档路径等于本项目代码根目录 → ERR_DOC_PATH_CONFLICT;纯库比对、零文件系统探测)` —— 事实表 FT-037(3) 原文为「external path equals own code_root, **an existing project code_root, or an existing external doc path** → ERR_DOC_PATH_CONFLICT」,即除本腿外还有两变体(仓外文档位置 = 既有另一项目的 code_root;= 既有另一项目的仓外文档路径),均为纯库比对、可由 fixture(≥2 项目)低成本构造,却无任何 Outcome 或显式范围声明覆盖。上一轮 blindspot #2 补齐了链序 4/5 两腿,本轮同口径下链序 3 的两个子变体仍是盲区;且锚注释的括注把 FT-037(3) 复述成单冲突源事实,审计者依注释会误以为已穷尽。改法:补边路 Outcome,或按 journey 末尾「覆盖说明」先例显式声明两变体不在本旅程断言面(并修正注释为全量复述)。

---

## Attacks(按优先级)

1. **[Internal Consistency] 重注册回环 State 作用域缺失**:step-5 success `Input: …随后对同一根目录重新发起注册` / `Output: 同一 code_root 此后可再次注册成功…` / `State: …激活指针不变(仍指第一个项目);感知链不受影响(FT-047:停链仅及被移除项目)` 与 step-3 success `active_project_id 指向新项目` + FT-047 激活切换全量重建语义按字面互斥 —— 须将 State 断言显式限定于移除腿(`移除后、重注册前`),并补重注册腿落库后状态(新 projects 行、按注册语义的激活与 watch 重建),或将重注册回环拆为独立 Outcome。
2. **[Fact Alignment] 「注册即激活」主张未归类且与现行代码相抵**:step-3 success `Output: 该项目被激活并进入工作台` / `State: active_project_id 指向新项目;watch 链按新激活项目重建` —— 事实表无此事实,无 FT 锚/inferred/UNKNOWN 任一归类;代码侦察(WorkbenchShell.tsx:378)注释明言 register verb 不激活,PRD(prd-ui-functions.md:61)为意图源。须补 `source: inferred <PRD UF1 注册完成即激活>` 或锚定新事实(并同步解决与 step-5 State 的口径),否则该 Outcome 在当前构建上必 FAIL 而执行者无从判据。
3. **[blindspot] FT-037(3) 冲突源覆盖不全 + 锚注释收窄事实**:见 Phase 3 #1,引用同上。
4. **[Semantic Purity] 维值内元引用**(轻):step-4 success State `(单激活;读数口径见 state_requirements)` —— 维值应自持行为描述,通道归属由 state_requirements 自明;建议删去指向性括注。
5. **[Semantic Purity] 复合 Input**(轻):step-5 success Input 捆绑移除+重注册两流程,若按 Attack #1 拆分 Outcome 则自然消解。
6. **(非计分 nit)** step-3 external-auth-declined Preconditions `且用户即此尝试完成` 疑为笔误(应为「径自/就此尝试完成」),可读性微损,不影响可执行性。

## Revision Guidance(给 Reviser)

本轮已过线(1084 ≥ 935,全维达标),剩余缺陷集中在一点两翼:核心 = 注册即激活主张的归类与作用域(Attack #1/#2 同源,建议一并处理 —— 先定口径:PRD 意图(注册即激活)vs 现行代码(注册不激活,toast 提示可切换)。若从 PRD,则 step-3 保持并补 inferred 注释,step-5 State 加「移除腿」作用域限定;若从代码现实,则 step-3 success 的激活/重建断言须改写为「项目进入列表、提示可切换」,journey 层面另行对齐)。Attack #3 为增腿或加范围声明,预算内可选;#4/#5/#6 为文字级微调。修复时勿动 16 个 Outcome 的互斥分区、FT 锚与 fixture 实体声明 —— 本轮满分三维(Completeness/Precondition Exclusivity/Anchor Integrity)与满分 Fixture 维全系于此。

### Score Progression

| Iteration | Score | Delta |
|---|---|---|
| 1 | 942/1100 | — |
| 2 | 1084/1100 | +142 |

### Outcome

**Target reached** — 1084/1100 ≥ 935,全部维度 ≥ 阈值(90/120/90/90/60/90/60/60),PASS。
