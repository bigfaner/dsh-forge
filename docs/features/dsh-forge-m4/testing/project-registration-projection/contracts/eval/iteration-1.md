# Contract Eval Report — project-registration-projection / iteration 1

- **Rubric**: `C:/Users/panda/.claude/plugins/cache/forge/forge/3.0.0/skills/eval/rubrics/contract.md`(1100 分 / 8 维;pass = 总分 ≥935 且每维过线)
- **Target**: `docs/features/dsh-forge-m4/testing/project-registration-projection/contracts/`(step-1..step-5 共 **5 个 Contract 文件 / 13 个 Outcome**;任务描述"13 Contract files"实为 13 Outcomes——与 gen-contracts 提交"registration 13"密度一致,按 DOC_DIR 实存 5 文件评分)
- **Surface**: web(单面);surface rule = gen-journeys `rules/surface-web.md`(强制 outcome:validation-error + session-expired)
- **Scorer**: adversarial QA,verification stance(每笔扣分附文件+引文;关键事实主张逐条对拍 fact-table / design / 真实代码)
- **Verdict**: **1000/1100 — PASS**(总分 ≥935,8 维全部过线)

## Phase 1 — Reasoning Audit(跨 Contract 状态链)

状态链逐步对拍,链条闭合无断点、无矛盾:

| 链节 | 上游产出(引用) | 下游前置(引用) | 判定 |
|---|---|---|---|
| Step1→Step2 | step-1 State "卡打开;注册表零变更" | step-2 success Preconditions "确认卡已打开" | ✓ |
| Step2→Step3 | step-2 success State "卡处于 valid 态" | step-3 success Preconditions "确认卡内给定存在 git 仓的路径,且命中仓内 forge 树特征" | ✓ |
| Step2→Step4 | step-2 valid / nogit-info State "卡处于 valid(nogit)态" | step-4 success Preconditions "卡处于 valid/nogit 态" | ✓(两态都被承接,nogit 一等公民) |
| Step4→Step5 | step-4 success State "投影状态 healthy;dsh workspaceRegistry 新增同名条目、顺序一致" | step-5 Preconditions "项目已注册且投影 healthy(workspace 同名条目在位)" | ✓ |
| 基线传递 | step-1 fixture Project "同名同序断言基线" → step-2/4 "另一已注册项目(同名同序基线/断言基线)" | 一致的同名同序断言基线纪律 | ✓ |
| 降级支线 | step-4 projection-write-failure State "degraded…重试成功后转 healthy" | 与 FT-123(push_succeeded→healthy)/FT-126(plan 保留、幂等全量重推)吻合 | ✓ |

五份文件 Journey Invariants 六条逐字一致;逐 Contract 核验不变量无一违反(单向投影禁反向 = step-4 Side-effect "单向投影写(ensure/reorder,禁反向)";硬校验仅 2 条 = step-4 Preconditions;零 git = step-2 nogit-info;黏性禁令 = step-3;降级承诺 = step-4 failure;词汇「添加项目/文档位置」全程统一)。

**事实对拍重点(零幻觉)**:`authorizeExternalDocPath 落 app_state`(step-3 Side-effect)经真实代码验证为**真**——`apps/desktop/src/main/workbench/registry/authorize.ts` 写 app_state kv(`EXTERNAL_DOC_AUTHORIZATIONS_KEY = 'external_doc_authorizations'`,与 active_project_id 同域 kv),且 FT-051 "sole persistence channel" 佐证"唯一仓外授权写入面";relay 执行序 `ensure→rename→reorder→delete`(step-4 anchors.layout)与 tech-design Interface 2 执行序逐字一致;CardPhase 五态、三档门控、docsPlacement 映射、≤2s、同名同序全部与 FT-130/131/132、Interface 1、journey Setup 吻合。

## Phase 2 — 逐维评分

### 1. Completeness(完整性)— 140/150(阈值 90 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 四维非空(50) | 50 | 13/13 Outcome 的 Preconditions/Input/Output/State 全非空;Side-effect 全显式(含 "none") |
| Journey Invariants(50) | 50 | 5/5 文件均有 `## Journey Invariants`,各 6 条 |
| happy + surface 派生场景(50) | 40 | happy 5 步全覆盖;validation-error 已映射并落地(step-2 四个态);network-error 已映射(step-4b);**session-expired 全缺**(见扣分 D1) |

扣分 D1(−10):web 强制 outcome session-expired 在本 Contract 集无任何承载(无 Outcome、无映射注释、无 N/A 声明)。

### 2. Semantic Purity(语义纯度)— 180/200(阈值 120 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 自然语言非代码/regex(80) | 80 | 零 regex(与 gen-contracts schema 校验"零 regex"一致);无 CSS/XPath/断言调用 |
| Preconditions 声明式(60) | 60 | 全部为状态描述("卡处于 valid 态""已有 ≥1 个注册项目"),无过程式 setup |
| 无实现耦合(60) | 40 | 5 处实现词表入维值(见扣分 D2;M2 契约 eval 已有同款先例判例) |

扣分 D2(−20,5 处 × −5~−4):
1. step-3 Side-effect: `"授权确认经 authorizeExternalDocPath 落 app_state(唯一仓外授权写入面)"` — IPC 动词名 + 存储表名入维值(事实为真,但属内部函数/存储耦合;M2 iteration-1 对同短语已扣)。
2. step-4 projection-write-failure state_requirements: `"投影通道注错(DSH_FORGE_PROJECTION_FAULTS 控制文件生效,channel unavailable)"` — 环境变量/控制文件 = 测试实现缝,宜降为注释。
3. step-4 success Side-effect: `"project_list_changed + projection_push_required 事件推送"` — 内部事件通道标识符。
4. step-4 failure State: `"投影状态 degraded(last_error 落表)"` — DB 列名细节。
5. step-2 registered-duplicate fixture constraint: `"canonical/pathKey/(dev,ino) 三层比对"` — 归一算法内部三件套入 fixture 值。

### 3. Precondition Exclusivity(前置条件互斥性)— 130/150(阈值 90 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 同 Step 内 Preconditions 可区分(60) | 40 | step-2 五态总体可区分;success 写明排除项("未被注册,无 ≥2 子仓")但 nogit-info 未写,构成 1 组真实歧义对 |
| 唯一可选定(50) | 50 | anchors.layout 内含 CardPhase 优先序(FT-132 口径),配合可唯一定态;step-4 三 Outcome 按阶段(注册前/注册中/注册后)互斥清晰 |
| 错误/边界 Outcome 显式触发条件(40) | 40 | 全部错误/边界 Outcome 均显式陈述触发条件 |

扣分 D3(−20,1 组歧义对):step-2 `nogit-info` Preconditions `"给定存在且可读的目录,但无 .git(零 git 形态)"` 未排除已注册/父目录形态——一个**已注册的无 .git 目录**(普通合法 fixture:零 git 注册后再次侦测)同时满足 nogit-info 与 registered-duplicate(`"给定路径已注册为某项目代码区(realpath 归一命中)"`)的前置;按 FT-132 优先级 registered 胜出,但前置文本自身不可判定。对照 success 的写法("未被注册,无 ≥2 子仓")可知排除式写法是有的,nogit-info 漏写。(parent-multi-repo 同样未写"未注册",因父目录已注册属病态边缘,计入攻击清单不再重复扣分。)

### 4. Fact Alignment(事实依据)— 135/150(阈值 90 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 事实主张可溯源或 UNKNOWN(60) | 55 | 代码级主张全部带 FT 锚(step-2:FT-131/132;step-3:FT-130/132;step-4:FT-123/126/127/128/129/131;DF001→prd-spec;BIZ-001/003→er-diagram/tech-design/prd-spec L162;authorizeExternalDocPath→app_state 经代码实证);step-5 上游归组语义(`"按 canonical path 幂等 create、cwd 自动归组(上游权威语义)"`)文件内无 FT/设计节锚,靠 anchors.layout 一句带过(−5) |
| inferred 主张带规则依据(50) | 40 | step-4 两 Outcome 双标注规范(source: journey Step 4b/4c + required_outcomes network-error 映射注释);step-2 文件级 validation-error 映射注释覆盖四个派生态;但 step-3 `reprobe-reevaluate` 标注 `source: inferred` 却引 journey Step 3b(旅程已有该边角,应标 source: journey Step 3b;inferred 分类缺 required_outcomes 规则依据)——分类错置(−10) |
| 零幻觉(40) | 40 | 全部承载性主张逐条对拍 FT/design/代码,未发现幻觉(authorizeExternalDocPath 真实存在且确为 app_state 单写通道;错误码/状态机/三档映射/relay 执行序全吻合) |

### 5. Surface Fitness(Surface 适配)— 85/100(阈值 60 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 强制派生 Outcome(40) | 25 | validation-error:已映射 + 落地(−0);network-error:已映射(−0);**session-expired:完全缺席**(−15)。非"完全缺席强制 Outcome"故不归零 |
| Surface 语言适配(35) | 35 | 全程 web 语言:用户交互(点击/拖拽/粘贴/察看)、页面元素(卡/态/预览行/按钮/chips)、异步(≤2s 同步完成、即时侦测);无跨面词汇 |
| TUI 超时语义(25) | 25 | 非 TUI 面,满分(规则规定) |

扣分 D4(−15):surface-web 规则要求每个 Web Journey "must be considered" 的两个强制 outcome 之一 session-expired 无承载。**同类证据**:其余 5 个旅程的 Contract 文件(multi-window step-3、lifecycle step-2、home step-4、split-pane step-5、task-session step-5)均携带 `<!-- surface-web required_outcomes 映射:session-expired → 桌面壳无独立登录会话… -->` 映射注释,唯独 registration 5 份全缺——模式性遗漏而非裁决性豁免;step-4 projection-write-failure(宿主/投影通道失联 mid-workflow)是与 lifecycle step-2 完全同型的天然挂载点。

### 6. Internal Consistency(一致性)— 150/150(阈值 90 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 不变量在每份 Contract 成立(60) | 60 | 六条不变量逐文件核验,零违反 |
| 跨 Contract 状态引用一致(50) | 50 | 见 Phase 1 链表;无悬挂引用、无矛盾 |
| 前置与上游 State 变化一致(40) | 40 | step-5 "投影 healthy" 前置恰为 step-4 success 终态;step-4 "注册完成后" 前置自洽 |

### 7. Anchor Integrity(锚点完整性)— 90/100(阈值 60 ✓)

handbook = `design/page-map.md`(存在,激活本维;web 锚字段 = `page`,5/5 文件均含 `page` + `route` + ISO-8601 `last_anchor_sync`)。

| 子项 | 得分 | 说明 |
|---|---|---|
| 锚字段完整(40) | 40 | 5/5 文件含 `anchors.web.page`;另附 route/requires_auth/layout 增强 |
| 锚值匹配 handbook(30) | 20 | step-2/3/4 的 page 值含 page-map 条目 `"添加项目确认卡(C7)"` 逐字前缀 + `·facet` 限定(合法子寻址);step-1 "(C7 浮层)" 合并了 Page Overview 的浮层归类(可溯源);**step-5 page 值无 handbook 对应条目**(−10) |
| handbook 内部一致性(30) | 30 | page-map 无同名异径/异义冲突;C7 卡在 Page Overview(浮层)与 Page Sections(条目)两处同名同义("唯一入口"两处一致);Route Guard 节与之一致 |

扣分 D5(−10):step-5 `page: "dsh 原生会话列表(workspace 分组;经项目工作台·左栏项目树会话行核验)"` —— page-map 未定义名为"dsh 原生会话列表"的页面;其实际核验面 = 项目工作台 Page Section `左栏项目树(C3)`(Data Source 含 ctx.sessions、行语言含会话行),但锚主值未采用 handbook 条目名,需读括注才能对上(route 字段 "project(左栏 C3 会话行归组呈现)" 倒是逐字吻合视图键 `project` 与 C3 座位)。

### 8. Fixture Specification(前置数据声明)— 90/100(阈值 60 ✓)

| 子项 | 得分 | 说明 |
|---|---|---|
| 实体完整性(veto,40) | 40 | 语义核验通过:**Project**→er-diagram `projects`(v3 增列);**Workspace**→er-diagram Relationships "forge projects \| dsh workspaces 逻辑 1:1(经 canonical path)"+ Interface 2 WorkspaceChannel;**Session**→Interface 3 ctx.sessions 快照/派发会话;**CodeRoot**→代码根目录/anchor(BIZ-workbench-001 ①、Interface 1 registerProject.anchor);**DocLocation**→过程文档位置/docs_placement(BIZ-workbench-001 ③、er-diagram docs_placement 列)。均为设计域实体,veto 不触发 |
| 关系与约束(35) | 25 | step-3 custom:DocLocation belongs_to CodeRoot ✓;step-5:Workspace belongs_to Project ✓;step-2/4 success 的双实体为**独立基线**(Project="另一既有项目",非关联实体,不声明关系为正确);**step-5 漏 Session→Workspace 归组关系**(−10) |
| min_count(25) | 25 | 全部充分:reprobe P1/P2=2;step-5 双 cwd 会话=2(已注册+未注册对照);基线=1;parent/missing/nogit 各 1 |

扣分 D6(−10):step-5 fixture 只声明 `Workspace belongs_to Project`,而被测断言核心是会话归组——`"该会话归组到对应同名 workspace(断言)"`(Output)所依赖的 Session↔Workspace 关联(cwd canonical 匹配)未以 relationship_type/parent_entity 或 field_constraints 声明。

## 阈值表

| 维度 | 得分 | 满分 | 阈值 | 判定 |
|---|---|---|---|---|
| Completeness | 140 | 150 | 90 | ✓ |
| Semantic Purity | 180 | 200 | 120 | ✓ |
| Precondition Exclusivity | 130 | 150 | 90 | ✓ |
| Fact Alignment | 135 | 150 | 90 | ✓ |
| Surface Fitness | 85 | 100 | 60 | ✓ |
| Internal Consistency | 150 | 150 | 90 | ✓ |
| Anchor Integrity | 90 | 100 | 60 | ✓ |
| Fixture Specification | 90 | 100 | 60 | ✓ |
| **Total** | **1000** | **1100** | **935** | **PASS** |

## 扣分日志

| ID | 维度 | 分值 | 文件 | 引文 |
|---|---|---|---|---|
| D1 | Completeness | −10 | 全集 5 文件 | session-expired 无 Outcome/无映射注释/无 N/A 声明(对照组:lifecycle step-2 有 `映射:session-expired → 桌面壳无独立登录会话…`) |
| D2 | Semantic Purity | −20 | step-3/step-4/step-2 | `authorizeExternalDocPath 落 app_state`;`DSH_FORGE_PROJECTION_FAULTS 控制文件生效`;`project_list_changed + projection_push_required 事件推送`;`last_error 落表`;`canonical/pathKey/(dev,ino) 三层比对` |
| D3 | Precondition Exclusivity | −20 | step-2 nogit-info | `"给定存在且可读的目录,但无 .git(零 git 形态)"` 未排除已注册(与 registered-duplicate 构成歧义对) |
| D4 | Surface Fitness | −15 | 全集 5 文件 | 同 D1(session-expired 强制派生缺席) |
| D5 | Anchor Integrity | −10 | step-5 | `page: "dsh 原生会话列表(…)"` 无 page-map 对应条目(实际 = 左栏项目树(C3) section) |
| D6 | Fixture Specification | −10 | step-5 | Session→Workspace 归组关系(被测断言核心)未声明 |
| D7 | Fact Alignment | −5 | step-5 | 上游归组语义无文件内 FT/设计节锚 |
| D8 | Fact Alignment | −10 | step-3 reprobe-reevaluate | 标 `source: inferred` 但依据为 journey Step 3b(应为 source: journey);inferred 分类缺 required_outcomes 规则依据 |

## Phase 3 — Blindspot / 攻击清单

1. **[Surface Fitness] session-expired 强制 outcome 模式性缺席** — step-4 仅有 `<!-- surface-web required_outcomes 映射:network-error → 投影通道(host 半身)写入失败… -->`,而 5 个兄弟旅程 Contract 均另带 session-expired 映射行 — 在 step-4(投影通道失联 mid-workflow,与 lifecycle step-2 同型)补 `映射:session-expired → 桌面壳无独立登录会话,最近似面 = 宿主/投影通道失联…` 注释或显式 N/A 裁决后重生成。
2. **[Precondition Exclusivity] nogit-info 前置漏排他限定** — `"给定存在且可读的目录,但无 .git(零 git 形态)"` vs registered-duplicate `"给定路径已注册为某项目代码区(realpath 归一命中)"`(已注册无 .git 目录两者皆真) — 补"未被注册(快车道不命中)/非父目录"限定,对齐 success 的 `"未被注册,无 ≥2 子仓"` 写法;parent-multi-repo 与 missing-path 对"注册后磁盘变化"边缘态同理(FT-132 优先级虽在 anchors.layout 可查,前置文本应自足)。
3. **[Semantic Purity] 实现词表入维值(5 处)** — `"授权确认经 authorizeExternalDocPath 落 app_state(唯一仓外授权写入面)"`(step-3 Side-effect)、`"投影通道注错(DSH_FORGE_PROJECTION_FAULTS 控制文件生效,channel unavailable)"`(step-4 state_requirements)、`"project_list_changed + projection_push_required 事件推送"`(step-4 Side-effect)等 — 转行为语言("授权登记持久化于应用自有状态/注册与投影事件推送"),缝名/通道名下沉到注释或 anchors。
4. **[Anchor Integrity] step-5 page 锚值无 handbook 条目** — `page: "dsh 原生会话列表(workspace 分组;经项目工作台·左栏项目树会话行核验)"` — 改用 page-map 条目名(如 `项目工作台·左栏项目树(C3)·会话行`)保持逐字可对;step-1 `(C7 浮层)` 括注宜统一为条目原文 `添加项目确认卡(C7)` + facet 后缀式。
5. **[Fixture Specification] step-5 漏被测核心关系** — fixture 仅 `Workspace belongs_to Project`,Output 断言 `"该会话归组到对应同名 workspace(断言)"` — 补 Session→Workspace 关系声明或以 field_constraints 写明归组键(cwd canonical = workspace path)。
6. **[Completeness] CardPhase invalid-entry 态无专属 Outcome** — FT-132 定义 `invalid-entry (empty | relative | bare-drive-or-root)` 且为最高优先态,step-2 映射注释仅以"非法入口"一词带过,无 Outcome 描述其 Output(即时提示+添加禁用) — 补 invalid-entry 边角 Outcome 或并入 missing-path 家族并写明触发输入。
7. **[Fact Alignment] 派生 Outcome 分类卫生** — step-3 `reprobe-reevaluate` 标注 `<!-- source: inferred -->` 但 reasoning 引 journey Step 3b(journey 已有该边角) — 应标 `source: journey Step 3b`(与 step-4 两 Outcome 一致),避免下游对 inferred 集合的 required_outcomes 规则审计误报。
8. **[内部流程] 任务口径与实存文件数不符** — 本次任务描述"13 Contract files",DOC_DIR 实存 5 文件/13 Outcomes — 派发侧应以 gen-contracts 产物清单为准,避免评分范围歧义(本次按实存 5 文件全集评分)。

## 结论

**1000/1100 — PASS**。状态链闭合、事实对拍零幻觉、fixture 语义核验全过(无 veto);主要失血为 web 强制 outcome session-expired 的模式性缺席(−25 跨两维)与实现词表入维值(−20),均为低成本可修项。
