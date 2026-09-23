# Contract Eval Report — multi-project-management / iteration 1

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-{1..5}-*.md`(5 份,共 14 个 Outcome)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / .forge/fact-table.json / gen-journeys rules/surface-web.md / docs/business-rules/{task-operations,coexistence,privacy,resilience}.md;家族口径参照已修订的 sibling 契约(task-board-browsing / dual-form-consistency / task-session-execution-loop)
- **Iteration**: 1(无上一轮报告)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 180/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 145/150 | 90 | ✓ |
| 4. Fact Alignment | 117/150 | 90 | ✓ |
| 5. Surface Fitness | 100/100 | 60 | ✓ |
| 6. Internal Consistency | 150/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | **0/100(veto)** | 60 | ✗ |
| **Total** | **942/1100** | 935 | ✓(总分) |

**Overall: FAIL** — 总分 942 ≥ 935,但 Fixture Specification 触发 entity-completeness veto 得 0 分,低于 60 阈值。失败面单一且高杠杆可修(见 Attack #1):Step 4/5 对任务/feature/挂接数据下判断,fixture 却只声明 Project。

---

## Phase 1 — Reasoning Audit(评分前独立判断)

Journey 结构:5 个 happy-path step + 7 个 edge case(2b 未检出、2c 重复注册、3b 同径冲突、3c 仓外授权、4b 路径失效、5b 移除激活项、5c 移除最后一项)。逐条对照:

- Step 1 → 2 Outcomes(success / wizard-abandon-guard)= 覆盖 Step 1,另补 navigation-guard 类边路 ✓
- Step 2 → 4 Outcomes(success / no-forge-data / duplicate-registration / code-root-unreadable)= 覆盖 2、2b、2c,另补校验链序 2 边路 ✓
- Step 3 → 3 Outcomes(success / same-path-conflict / external-auth-required)= 覆盖 3、3b、3c ✓
- Step 4 → 2 Outcomes(success / project-path-invalid)= 覆盖 4、4b ✓
- Step 5 → 3 Outcomes(success / remove-active-with-remaining / remove-last-project)= 覆盖 5、5b、5c ✓

步骤/结果映射完整,无遗漏、无虚构步骤;inferred 注释与 journey 注释逐字一致。独立复核事实主张(ERR_FORGE_NOT_DETECTED / ERR_PROJECT_EXISTS+UNIQUE(code_root) / ERR_CODE_ROOT_UNREADABLE 消息含路径与原因 / ERR_DOC_PATH_CONFLICT 纯库比对 / authorizeExternalDocPath 唯一授权落库通道且先于 fs 探测 / removeProject 清激活指针+CASCADE / activate 切换全量重建 watch / 空态自动进向导)与 FT-036/FT-037/FT-038/FT-047/FT-051/FT-053 内容**全部吻合,未发现幻觉**。

预判锚点(评分前记录):(a) 5 份文件零 FT-xxx 引用;(b) Step 4/5 断言面覆盖任务/feature/挂接数据,fixture_spec 仅声明 Project —— 对照家族口径(sibling 全部声明 Task/SessionLink)疑似 veto;(c) Output/State 值内嵌对拍口径文本;(d) 浮层步骤锚到父页是否符合家族先例(已核:plugin-management step-2/3 同款,成立)。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:14 个 Outcome 的 Preconditions/Input/Output/State 全部非空,且全部显式给出 Side-effect(如 step-1 `"none(打开向导零落库)"`、step-2 success `"none(全程只读探测)"`)。无任何缺失维度。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 3 条,与 journey.md 的 3 条不变量逐字一致。
- **派生场景覆盖(50/50)**:Web 强制派生双项均以显式映射注释处理:step-2 `<!-- surface-web required_outcomes 映射:validation-error → 向导输入校验失败 = 本边与 Step 3b(仓外路径冲突)两处实例;错误文案 + 修正引导、停留当前步骤 -->`;step-4 `<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口模型),无字面会话过期面;通道失效类比 = 已注册项目数据通道(路径)失效 = 本边 -->`。另覆盖 navigation-guard(向导放弃守卫)、already-exists 类比(duplicate-registration)、remove 边界两腿,超出最低要求。

### 2. Semantic Purity — 180/200

- **c1 自然语言、无 code/regex(72/80,−8)**:全文无 regex/CSS 选择器/XPath/框架断言。但**Output/State 维度值内嵌「如何校验」的对拍通道说明**,违背「dimension values describe *what* the system produces, not *how* to verify it」与家族口径(oracle 通道只应存在于 fixture_spec/state_requirements):
  - step-5 success Output:`项目仓内文件与 forge 数据不被改动(前后文件树快照对拍全等)`
  - step-3 success State:`active_project_id 指向新项目——状态读数对拍`
  - step-4 success State:`active_project_id 更新为目标项目(单激活,状态读数对拍)`

  同类缺陷 3 处,按类计 −8(与 sibling 家族先例同口径)。step-1/step-5 把同口径正确放在 state_requirements(`跨面断言口径:...文件树快照对拍`),证明本可以写对。
- **c2 Preconditions 为声明式状态(56/60,−4)**:主体声明式(`向导处于步骤 ①`、`注册表中已有至少 2 个项目`),但 Preconditions 值串内混入测试生命周期/操作指令:step-1 success `(一次性 fixture:临时目录 + 隔离 userData、测试后清理)`;step-4 project-path-invalid `(被移动/删除;fixture 临时目录内操作)`。−4。
- **c3 无实现耦合(52/60,−8)**:State 值出现内部机制词表:
  - step-3 external-auth-required State:`经 authorizeExternalDocPath 动词落授权记录`(IPC 动词名 = 内部函数调用类)
  - step-2 code-root-unreadable State:`校验链序 2 拒绝`、no-forge-data State:`校验链在 forge 检出关卡拒绝`(内部校验链排序)
  - step-2 duplicate-registration State:`UNIQUE(code_root) 拒绝`(DB 约束实现)
  - step-1 success State:`向导浮层打开(z1200 层)`(叠层实现记号);step-3 success Side-effect:`只写工作台自有库(SQLite)`(存储技术名)

  错误码语义(ERR_*)在 State 中可保留(FT-031 使 code 成为面向渲染层的一等契约),但动词名/链序号/约束名/叠层记号应转行为语言。−8。

### 3. Precondition Exclusivity — 145/150

- **c1 各 Outcome 前置互斥(60/60)**:step-2 四腿严格分区且显式互斥声明(`所选代码根目录下未检出 forge 数据` / `已被注册为项目(与现有项目 code_root 相同)` / `不可读——...（与未检出 forge 数据、已注册两情形互斥）` / success `含 forge 数据的可读目录...且未被注册`),与 FT-037 拒绝优先序(可读性→检出→UNIQUE)一致;step-3 按文档位置三分(默认仓内 / 仓外=代码根目录 / 仓外≠代码根目录,`与代码根目录相同的情形归 same-path-conflict`);step-5 按激活态+余量三分。无共享或语义等价前置。
- **c2 前置足以唯一定位 Outcome(45/50,−5)**:step-3 external-auth-required 的 Input 捆绑两条不同输入路径于一个 Outcome:`用户在步骤 ② 查看授权提示并勾选确认授权(或在不勾选时尝试完成)` ——「勾选确认」与「不勾选尝试完成」是两条触发路径(前者落授权+external 落库,后者完成操作不可用),执行者无法从 Preconditions+Input 唯一确定单一输入;未勾选腿实为独立的 gate 校验子场景,应拆分或以前置区分。−5。
- **c3 边界 Outcome 显式给出触发条件(40/40)**:全部边界腿显式:no-forge-data(`未检出 forge 数据(无 .forge 与 docs/features)`)、duplicate-registration(`已被注册为项目`)、code-root-unreadable(`不存在、权限被拒或非目录`)、same-path-conflict(`仓外文档位置与代码根目录为同一目录`)、project-path-invalid(`已不可访问(被移动/删除)`)、remove 两腿(激活态+剩余量)。✓

### 4. Fact Alignment — 117/150

- **c1 事实主张可溯源或标 UNKNOWN(42/60,−18)**:独立核验后**实质内容零错位**(全部错误码/状态主张对照 FT-036/037/038/047/051/053 吻合,含消息细节:`消息含路径与原因(不存在/权限/非目录)` = FT-037(2) 逐字)。但 5 份文件**没有任何一处 FT-xxx fact_id 引用**,而主张高度具体:
  - `错误码语义 ERR_FORGE_NOT_DETECTED,消息指明缺失探测项`(= FT-037(6)+FT-038,未引)
  - `注册表不变(UNIQUE(code_root) 拒绝,错误码语义 ERR_PROJECT_EXISTS)`(= FT-036,未引)
  - `projects 行:code_root 规范化、doc_location_type = in_repo、doc_location_path 为空、display_name = 目录名`(= FT-036 部分,未引)
  - `移除事务内显式清理`、`随外键级联删除`(= FT-036,未引)

  按「must be traceable to a specific fact_id」字面要求属可溯源但未溯源;按验证立场,审计者须自行重建溯源链。家族口径明示「FT-xxx traceability anchors on factual claims」,已修订 sibling 示范了内联写法(task-board step-4:`(FT-032:worktree 布尔、branch 可空执行分支)`)。−15(形式缺口,同 sibling 先例口径);另有两条主张**不在事实表中也未标 UNKNOWN**(`code_root 规范化`、`零 forge CLI 调用`,见 c3)再 −3。
- **c2 inferred 主张带规则依据 + source: inferred(40/50,−10)**:映射最佳实践与误分类并存:
  - ✓ 典范:step-2 no-forge-data(validation-error 映射注释)、step-4 project-path-invalid(`session-expired → ...通道失效类比 = 本边` + UF4 规则依据 + `source: inferred`)
  - ✗ **事实误标为 inferred**:step-2 duplicate-registration(`推自 tech-design 错误码表 ERR_PROJECT_EXISTS(code_root UNIQUE 冲突)` —— 该内容是 FT-036 事实,应标 FT 而非 inferred);step-2 code-root-unreadable(`推自注册校验链序 2(...validate.ts:144-152)` —— = FT-037(2) 事实);step-5 remove-active-with-remaining(`按 tasks 裁决与已落地 e2e...激活指针清空` —— 指针清空 = FT-036 `removeProject ... clears the active_project_id pointer` 事实;仅「项目域页呈现引导卡」属真推断)
  - ✗ step-3 same-path-conflict **完全无注释**,却断言 `校验链序 3 纯库比对拒绝,错误码语义 ERR_DOC_PATH_CONFLICT`(= FT-037(3) 事实):既无 FT 引用也无 inferred 标注;step-3 external-auth-required 同样无注释地断言 FT-051 内容(`向导步骤②确认的唯一落库通道`、`授权关卡先于任何对未授权路径的文件系统探测`)
  - −10(3 处误分类 + 2 处关键 Outcome 零注释,按类计)
- **c3 无未分类幻觉(35/40,−5)**:两条主张既非事实表可溯源、也无 inferred 标注/UNKNOWN 标记:
  - step-3 success State:`code_root 规范化` —— FT-036 未提及路径规范化,事实表中无此主张
  - step-2 success State:`零 forge CLI 调用` —— 与 FT-038 的文件存在性探测口径相容但事实表从未陈述,属未验证主张

  −5(非幻觉,属未分类;修复 = 补 FT 或标 UNKNOWN)。

### 5. Surface Fitness — 100/100

- **强制派生 Outcome(40/40)**:validation-error(两处实例,no-forge-data + same-path-conflict)与 session-expired(remapped 为路径通道失效,附离线桌面应用理由)均以显式映射注释到场;映射理由(`继承 M1 无端口模型`)与 FT-011/FT-053 无端口事实吻合。
- **Surface 语言适配(35/35)**:通篇用户交互(`点「添加项目」`、`勾选确认授权`、`执行移除并确认二次确认弹层`)、页面元素(`浮层`、`项目卡片`、`切换器`、`引导卡`)、异步操作(`显示扫描中 loading 指示`)。无 DOM 选择器/框架断言。
- **TUI 超时(25/25)**:Web 面,不适用,满分。

### 6. Internal Consistency — 150/150

- **不变量逐份成立(60/60)**:三分模型 —— 所有写路径均为 `只写工作台自有库...零项目目录写入`(step-3/step-5 Side-effect);移除只删注册 —— step-5 以文件树快照对拍为 oracle(`文件面对拍为据,不以「没报错」为据`),step-4b `注册表行保留(不自动删除)`;单激活 —— step-3 `激活新项目即原项目去激活`、step-4 指针切换、step-5b/5c 指针清空(0 ≤ 1 成立)。无任何违规。
- **跨 Contract 状态引用一致(50/50)**:step-2 `向导处于步骤 ①` ← step-1 Output `停在步骤 ①`;step-3 `向导处于步骤 ②` ← step-2 success State `向导前进至步骤 ②`;step-4 `已有至少 2 个项目,当前激活第二个` ← step-3 success `该项目被激活并进入工作台`;step-5 `第二个项目已注册且当前未激活(第一个项目激活中)` ← step-4 success 切回第一个。链条闭合,边路 Outcome 的分叉态均由自身 fixture 声明。挂起引用无:step-2 引 `Step 3b` 系 journey 边路编号(注释显式说明),无歧义。
- **前置与上游 State 变化相容(40/40)**:逐腿核对(step-2 各拒绝腿停留步骤 ① 与 step-1 停靠一致;step-5b 前置「待移除=激活且剩余≥1」可由 step-3 后态 + fixture 变体达成)。无不可达前置。

### 7. Anchor Integrity — 100/100

Handbook(`design/page-map.md`)存在,按 Web 面 `page` 字段评分。

- **锚点字段完整(40/40)**:5 份文件均有 page/route/requires_auth/layout;`route: ""` 系 FT-053/page-map 明言的视图键寻址设计(无 URL 路由),非缺陷(评估口径明示);浮层步骤(Step 1 向导、Step 5 确认弹层)锚到父页 `workbench/overview` 并在 layout 内标 `workbench/dialog 注册向导浮层(RegisterWizard 3 步)` —— 与家族先例一致(plugin-management step-2/3 确认弹层同款),浮层归 `workbench/dialog/*` 键族信息已在 layout 保留。
- **锚点值与 handbook 一致(30/30)**:`workbench/overview` 精确匹配 page-map View Key;layout 串逐项对上(`WorkbenchShell → OverviewPage`、RegisterWizard `步骤①检出校验、②仓外授权、③确认`、`TopBar 项目切换器(Menu 卡)`);`requires_auth: false` 对应 `Auth: none(单用户桌面)`。
- **Handbook 内部一致(30/30)**:视图键无重复/冲突(overview/tasks/features+:slug/dialog/*/session);features 的 `:slug` 为视图键段子视图,与「无 URL 路由」自洽;无同键异径冲突。

### 8. Fixture Specification — 0/100(entity-completeness veto)

- **实体完整性(0/40,veto 触发)**:本旅程 Step 4/5 的断言面对任务/feature/挂接数据下判断,fixture_spec 却只声明 Project:
  - step-4 success Output:`看板/feature/挂接数据完整切换到目标项目(任务/feature 列表、详情、挂接历史均按目标项目呈现)`;State:`感知链按激活切换全量重建(旧 watch 全释放,新项目根建立);派生快照按目标项目读出` —— Task/Feature(快照投影源)与 SessionLink 实体全部缺席。两项目均无任务/feature/挂接数据时,「完整切换」断言**空洞为真**:切换坏了也测不出。判「挂接历史按目标项目呈现」使 link state 成为判断输入,而 session_links 是工作台自有 SoT、不可由 forge 文件推导(家族口径明示必须声明)。
  - step-5 success State:`该项目的派生快照与挂接行随外键级联删除` —— 直接断言 SessionLink 行的级联删除,却无任何 link 行声明;零行时级联断言**空洞为真**:CASCADE 坏了也测不出。
  - 家族合规对照:其余全部家族凡判断 task/link 态均声明对应实体(dual-form-consistency ×5、task-session-execution-loop ×7、task-board-browsing step-5 声明 Task+SessionLink;feature-board 声明 Feature;连 plugin-management step-5 都声明 Task)。本家族是唯一判断挂接态而零 SessionLink 声明的家族。
  - 依规则「Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — this triggers the veto」→ 实体完整性 0 分 → **整维 0 分**。
- **关系与约束覆盖(名义 0/35,维内归零)**:修复时应一并:Task/Feature/SessionLink 补 `belongs_to Project` 关系;step-3 same-path-conflict / external-auth-required 的 fixture 与同文件其余 Outcome 相比丢了 `active: true` 约束(前置却默认存在激活项目,不对称);step-5 remove-last-project 把注册表计数建模为 Project 字段 `registeredCount`(注册表级计数非 Project 实体字段,应转 state_requirement)。
- **最小数据量(名义 0/25,维内归零)**:Project 维度 min_count 本身正确(step-1..3 = 1:第二个项目注册前非实体,路径经 state_requirements 供给;step-4 = 2;step-5 并集 2、remove-last 自身 1)——veto 修复后此项按上述核验计满分;但补声明 Task/SessionLink 时须按家族口径定量(判「切换/级联」至少每项目 1 Task;判挂接至少被移除项目 1 link,或明示 min_count 0 + 缺席 state_requirement)。

---

## Cross-Dimension Coherence Check

- Fixture veto(0)与 Semantic Purity c1 的对拍通道缺陷同源但对象不同(实体声明缺失 vs 通道文本位置),分别计分无双重扣分。
- Fact Alignment 的 FT 缺引与 Semantic Purity c3 的实现词表互为表里:补 FT-xxx 内联锚(如 `(FT-037(2))`)可同时收窄 c3 的链序/约束裸引用。
- Internal Consistency 150 与 Fixture 0 不矛盾:叙事/状态链自洽,但保证断言可执行的数据声明不足 —— 一致性维不检查数据充分性,该责任归 Fixture 维。
- Completeness 150 与 Fixture 0 并存合理:结构完备(字段/章节/强制 Outcome)与数据声明完备是两个对象。
- 总分 942 ≥ 935 而 FAIL:唯一失败维 = Fixture Specification(0 < 60)。与 sibling 家族 iteration-1 先例(task-board-browsing:总分 963、veto FAIL → 修订后过)同构,失败面单一、修复路径明确。

## Phase 3 — Blindspot Hunt(维度外发现)

1. **[blindspot] navigation-guard 只断言了放弃腿,守卫的「留下」腿未测**:step-1 wizard-abandon-guard Output `呈现放弃确认守卫;确认放弃后向导关闭且不落任何注册(无项目行、无激活变更)` —— surface-web navigation-guard 指引要求「user choice respected」(两个选择都被尊重),但用户**取消放弃**(关闭守卫、留在向导、已输入保留)的腿无任何 Outcome 断言;`工作台返回概览页原状态` 只覆盖放弃后。改法:扩展该 Outcome 或补一条「守卫取消 → 向导停留原步骤且已有输入保留」。
2. **[blindspot] 校验链腿 4/5(授权后仓外路径不可读)无用户面 Outcome**:step-3 external-auth-required State 自引链序 `校验链在授权关卡先于任何对未授权路径的文件系统探测`,且 step-2/3 已按 FT-037 链序展开边路(序 2、序 3、序 6、序 7 均有 Outcome),唯独授权后 `ERR_EXTERNAL_PATH_UNREADABLE`(序 5,授权≠可读)与「完成注册打到未授权路径」(序 4)的用户可见面缺席 —— 仓外注册失败面只测了同径冲突一腿。属场景广度缺口(不在 Completeness 的结构/强制项内)。
3. **[blindspot] 缺「移除后重注册同 code_root」回环**:step-5 success State `projects 行删除`、remove-last State `注册表清空`,但无任何 Outcome 验证 UNIQUE(code_root) 槽位真正释放 —— 移除后重注册同一 code_root 应成功;缺此腿则软删除/残留行缺陷可穿过整个旅程。改法:在 step-5 success Output 或补边路断言「移除后可再次注册同一根目录」。

---

## Attacks(修订必改项,按优先级)

1. **[Fixture Specification] entity-completeness veto**:Step 4/5 判断任务/feature/挂接数据而 fixture 仅声明 Project —— `该项目的派生快照与挂接行随外键级联删除` / `看板/feature/挂接数据完整切换到目标项目(任务/feature 列表、详情、挂接历史均按目标项目呈现)` —— 须补 Task/Feature(belongs_to Project)与 SessionLink 实体声明并按断言面定量(判挂接态 = 家族口径强制声明 SessionLink;判「其余/既有」保留 = Task 定量使断言非空洞)。
2. **[Fact Alignment] 事实误标 inferred + 关键 Outcome 零注释**:duplicate-registration / code-root-unreadable / remove-active-with-remaining 的核心主张是 FT-036/FT-037 事实却标 `source: inferred`;same-path-conflict / external-auth-required 断言 ERR_DOC_PATH_CONFLICT 与 FT-051 内容却无任何注释 —— 改为 FT-xxx 锚或补注释;全家族补内联 FT 引用(错误码/状态主张逐条对 FT-036/037/038/047/051/053)。
3. **[Fact Alignment] 未分类主张**:`code_root 规范化`、`零 forge CLI 调用` 不在事实表 —— 补事实/标 UNKNOWN 或删除。
4. **[Semantic Purity] Output/State 内嵌对拍通道**:`(前后文件树快照对拍全等)`、`——状态读数对拍` ×2 —— 移入 fixture_spec.state_requirements(Output 保持行为语言)。
5. **[Semantic Purity] 实现词表入维值**:`经 authorizeExternalDocPath 动词落授权记录`、`校验链序 2/序 3`、`UNIQUE(code_root) 拒绝`、`(z1200 层)`、`(SQLite)` —— 转行为语言或挂 FT 锚。
6. **[Precondition Exclusivity] external-auth-required 双输入捆绑**:`查看授权提示并勾选确认授权(或在不勾选时尝试完成)` —— 拆出「未勾选→完成不可用」子场景或以前置区分单一输入。
7. **[Semantic Purity] Preconditions 混入生命周期指令**:`(一次性 fixture:临时目录 + 隔离 userData、测试后清理)`、`(被移动/删除;fixture 临时目录内操作)` —— 移入 state_requirements。
8. **[blindspot ×3]**:守卫「留下」腿、ERR_EXTERNAL_PATH_UNREADABLE 用户面、移除后重注册回环 —— 建议随本轮一并补齐(前两条为纯增腿,不动既有结构)。

## Revision Guidance(给 Reviser)

最高杠杆单点 = Attack #1(解除 veto 即 +100 且唯一失败维消除,总分升至 ~1042)。但本轮应同批处理 #2–#7(均为局部文本/注释级修改,不动 Outcome 骨架);#8 视修订预算取舍,其中守卫「留下」腿建议必补(与 wizard-abandon-guard 同文件一行扩展即可)。修复时保持 14 个 Outcome 的互斥分区与状态链不动 —— 本轮 Internal Consistency/Anchor Integrity/Surface Fitness 三维满分,不要为修 fixture/注释引入回归。
