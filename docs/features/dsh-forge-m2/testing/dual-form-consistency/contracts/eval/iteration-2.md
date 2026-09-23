# Contract Eval Report — dual-form-consistency / iteration 2

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-{1..5}-*.md`(5 份,共 14 个 Outcome;step-1 修订后新增 perception-chain-error 腿,2 Outcomes → 3)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / .forge/fact-table.json / gen-journeys rules/surface-web.md / docs/business-rules/{task-operations,coexistence,privacy,resilience}.md / 代码与 fixture 实证(stubs/cli.ts、indexer/diff.ts、repos/session-links.ts、design/spike-1-findings.md、e2e/tests/m2/sc7-dual-form.spec.ts、tasks/records/6.5)
- **Iteration**: 2(上一轮:`contracts/eval/iteration-1.md`,886/1100 FAIL)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分,事实主张实证核验

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 200/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 150/150 | 90 | ✓ |
| 4. Fact Alignment | 142/150 | 90 | ✓ |
| 5. Surface Fitness | 100/100 | 60 | ✓ |
| 6. Internal Consistency | 145/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | 87/100 | 60 | ✓ |
| **Total** | **1074/1100** | 935 | ✓ |

**Overall: PASS** — 全部 8 维过阈,总分 1074 ≥ 935。iteration-1 的三个失败面(Fixture veto / Surface Fitness 0 分项 / 事实溯源)全部实质修复;本轮新发现 4 处小幅残留(互不构成失败面):对拍维度「依赖」与 SC7 oracle 实际输出不符、board-open 腿 min_count 低配使新断言空转、offline 腿「不误标」判定输入未钉、感知链错误腿 Side-effect 措辞与 Input 冲突。

---

## 上一轮攻击点处置核验(iteration-1 → 2)

14 条攻击逐条核验,**全部实质解决**,无「声称修复但未解决」项(故 Internal Consistency 不因未兑现修复计扣):

| # | iteration-1 攻击 | 处置证据(修订版原文) | 判定 |
|---|---|---|---|
| 1 | step-1 SessionLink 缺席(veto) | 两腿 fixture 增 `SessionLink min_count: 0` + state_requirement `"被变更任务零 active 挂接:挂接索引为工作台自有 SoT、不可从 forge 文件推导,fixture 须显式钉零(隔离 userData、零挂接写入足迹)"`;底部并集同步 | 已解决 |
| 2 | Web 强制派生零考虑 | step-1 `session-expired → …映射为 FT-056 sync-error 工具栏指示 + 静默重试 + last-good 看板保留 = 本边` + 新增 perception-chain-error 实腿;step-3 `validation-error → …由 forge CLI 拒绝并反馈发起侧 = 本边` | 已解决 |
| 3 | 事件粒度与 FT-047 冲突 | state_requirement `"高频节奏约束:相邻两笔变更间隔大于感知链合流窗(FT-047:变更批 400ms trailing 防抖 + 事件 500ms 合批)"`,断言限定在钉距节奏下 | 已解决 |
| 4 | 「来源口径」列入对拍维度 | 来源已移出对拍并标 `"终端输出是否携带来源维度 UNKNOWN(FT-032 来源为工作台侧字段),不列入双侧对拍维度"`——但收敛项「依赖」本身仍不实(见本轮攻击 1) | 部分残留(新扣) |
| 5 | 零 FT 引用 | FT-045/046/047/035/056/032 全数引用且逐条与 fact-table 核对无误 | 已解决 |
| 6 | accepted 腿不可构造 | `"操作对配方:任务起始 status = pending——先到操作 = claim(pending 可认领),后到操作 = transition…"` + fixture `pending(确定性起始态…)` | 已解决 |
| 7 | frozen × ended 前置重叠 | 双向互斥声明:`"ended-link-history-retained 的交替以常规 CLI 形态完成——两腿以终端形态互斥"` / `"(冻结插件形态腿见 frozen-plugin-compat——两腿以终端形态互斥)"` | 已解决 |
| 8 | Output 内嵌 oracle | step-3/step-5 Output 已净,口径移入 state_requirements(`"跨面断言口径:…测试进程直读 fixture forge 文件对拍"`) | 已解决 |
| 9 | State 存储层词表 | `task_snapshot 行更新`→`看板快照逐笔更新`;`session_links…分属两库`→`挂接记录完整保留…独立存放`;通道名 `dsh-forge:workbench-events` 移除(grep 证实仅存于 inferred 注释) | 已解决 |
| 10 | 前置混入装配指令 | step-2/step-4 前置已净,移入 state_requirements | 已解决 |
| 11 | 不可种子伪约束 | step-4/step-5 改 `"pending(交替起始态,seed 可构造;…不由 fixture 字段值承载)"` | 已解决 |
| 12 | 3.x 驱动配方缺失 | `"优先以真实冻结插件(3.x) CLI…;不可得时以经 3.x 插件产物校准的方言任务文件副本代写,驱动方式记录于本腿"`(经核 spike-1-findings.md:168 真实:`index.json…双形态共写的往返文件,旧写者重写时会静默丢弃未知字段`) | 已解决 |
| 13 | 「孤儿」未定义 | `"删除不留孤儿——孤儿 = 看板侧已消失任务的残留呈现(挂接记录不做级联清除,其处置按 Step 5 挂接保留语义)"` | 已解决 |
| 14 | board-open 缺保留断言 | Output 增 `"变更前看板既有内容完整保留(其余任务不丢失、无整板重载/闪烁)"`——但引出 min_count 低配(见本轮攻击 2) | 部分残留(新扣) |

---

## Phase 1 — Reasoning Audit(评分前独立判断)

Journey:5 happy step + 5 edge(1b 看板已打开、2b 高频、3b 同时操作、4b 离线、5b 冻结插件)+ 3 invariants。逐条对照:

- Step 1 → 3 Outcomes(success / board-open-change / **perception-chain-error 新增**)— 覆盖 1、1b + session-expired 类比腿 ✓
- Step 2 → 2(success / high-frequency)= 2、2b ✓
- Step 3 → 4(success / simultaneous-late-op-rejected〔validation-error 类比〕/ simultaneous-late-op-accepted〔inferred〕/ structural-change-flowback〔inferred〕)= 3、3b 双分支 + 结构腿 ✓
- Step 4 → 2(success / offline)= 4、4b ✓
- Step 5 → 3(success / frozen / ended〔inferred〕)= 5、5b + ended 保留 ✓

14 Outcome 覆盖全部 5 步 + 5 边 + 4 条派生/推断腿,无遗漏、无虚构。实证核验(独立于上轮报告重做):

- **代码引用全部真实**:step-3 structural 注引 `diff.ts:82-98` 正是 `diffTasks`(新增→structural、内容变更→attribute、消失→deletedKeys,行 82-98 属实);step-5 ended 注引 `session-links.ts:48-95` 正是 `endSessionLink`(UPDATE 置 ended 不删行、幂等 no-op)+ `listSessionLinks(ByTask)`(含 ended、started_at 倒序)。
- **FT 引用逐条对表零错位**:FT-045 判定序(actor → active 挂接 → 否则 terminal;仅变更行判定)、FT-046(task_updated/changeKind attribute|structural/批推送)、FT-047(400ms trailing 防抖 + 500ms 事件合批)、FT-035(ended 保留、新→旧含 ended)、FT-056(sync-error 工具栏 + 静默重试 + last-good + 快照可重建)、FT-032(source 为 TaskSummary 字段)。
- **spike-1-findings 引用真实**:`design/spike-1-findings.md:168`「index.json 是新旧 CLI + 冻结 3.x 插件双形态共写的往返文件,旧写者重写时会静默丢弃未知字段」。
- **新发现的不实主张**:step-2 对拍维度「依赖」——项目自有 SC7 oracle(`apps/desktop/e2e/fixtures/stubs/cli.ts:217-236`:`one TSV row per task, <featureSlug>/<localId><TAB><status>`;tasks/records/6.5 SC7-1「输出与看板**状态集合**一致…词表直通」)的 `forge task status` 实际输出 = 任务键 + 状态,**无依赖维度**,fact-table 亦无支持条目。

预评分锚点:(a) 14 条旧攻击全数处置;(b) 「依赖」对拍维度不实;(c) board-open 新断言与 min_count 1 的空转风险;(d) offline 腿「不误标」判定输入;(e) 感知链错误腿 Side-effect 措辞。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:14 个 Outcome 的 Preconditions/Input/Output/State 全部非空;Side-effect 全部显式(如 `"none(工作台只读感知终端变更)"`、`"none(校验只读)"`);Preconditions 均带结构化 fixture_spec + state_requirements。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 3 条,与 journey.md 逐字一致。
- **派生场景覆盖(50/50)**:Web 强制派生双双落地——session-expired 映射为 perception-chain-error 实腿(注释含规则引用 + N/A 理由),validation-error 映射为 simultaneous-late-op-rejected;另含全部 journey 边与 3 条推断腿。

### 2. Semantic Purity — 200/200

- **c1 自然语言(80/80)**:grep 证实 `task_snapshot|session_links|workbench-events|upsert|schema-v1|\.sql|data-testid|querySelector` 在维度值中零命中(仅存于 `<!-- source: inferred -->` 溯源注释,属许可位置);无 regex/选择器/框架断言。`工具栏 sync-error` 为 FT-056 自身词汇表的用户可见态命名,非选择器。
- **c2 声明式前置(60/60)**:前置全部为状态描述;装配口径已迁 state_requirements(`"会话侧操作模拟口径:fixture 任务文件变更 + FORGE_ACTOR 标记透传…"`);accepted 腿配方以起始态约束形式声明(`"任务起始 status = pending——先到操作 = claim…"`),既是构造配方又不失声明性。
- **c3 无实现耦合(60/60)**:State 值全部行为化(`"看板快照逐笔更新(状态/时间)"`、`"挂接记录完整保留(交替操作不触碰挂接数据)"`、`"task_updated 事件(属性级 changeKind)批推送至看板订阅方"`——通道名已清,事件类型名按家族先例保留);跨面断言口径全部位于 state_requirements。

### 3. Precondition Exclusivity — 150/150

- **c1 互斥(60/60)**:step-1 三腿两轴(看板开闭 × 感知链健康)显式互斥(`"变更发生时任务看板未处于已打开状态…已打开看板的到达变更腿见 board-open-change"` ↔ `"任务看板处于打开状态(非首次加载;与 success 的进入时序互斥…)"` ↔ `"(与 success/board-open-change 以感知链健康状态互斥)"`);step-3 success 以 `"无同时同任务操作、无任务集结构性增删、挂接会话不结束"` 一句排除三腿;rejected/accepted 以后到操作合法性互补;step-5 frozen×ended 双向终端形态互斥(旧缺陷已修)。
- **c2 唯一定位(50/50)**:accepted 腿配方落地(`"pending(确定性起始态:先到 claim → 后到 transition,按到达序均合法)"`),与 rejected 腿 `"处于仅一笔操作可满足前置的状态"` + 示例 `"对已完成转移的任务再次 claim"` 各自可确定性构造。
- **c3 触发条件显式(40/40)**:感知链故障(`"变更扫描持续失败"`)、看板已打开、高频(`"短时间内连续执行多笔"`)、同时操作合法性两分支、结构性变化、离线(`"应用未启动时,终端侧已执行任务状态变更"`)、冻结插件形态、`"status = ended"`——全部显式。

### 4. Fact Alignment — 142/150

- **c1 事实主张可溯源或标 UNKNOWN(52/60,−8)**:FT-045/046/047/035/056/032 引用逐条对表属实;唯一不实主张:
  - **step-2 success Output**:`"终端输出与看板展示一致(对拍维度收敛为 forge task status 实际输出项:任务状态/依赖)"` ——「依赖」**不是** `forge task status` 的实际输出项:本项目 SC7 oracle(`apps/desktop/e2e/fixtures/stubs/cli.ts` task-status 腿,注释 `"SC7 dual-form oracle: one TSV row per task, <featureSlug>/<localId><TAB><status>"`)只输出任务键 + 状态;tasks/records/6.5 SC7-1 亦记「输出与看板**状态集合**一致(同 fixture 对拍,词表直通)」;fact-table 无任何条目支持 CLI 输出依赖维度。iteration-1 攻击 4 的修复指令是「收敛到终端实际可输出项或标 UNKNOWN」,修订者移除了来源(处理正确)却把「依赖」当作实际输出项写入,属未溯源且被仓库自有证据反驳的主张(同源缺陷 iteration-1 计 −5,此例因有明确反证且为指令误执行,计 −8)。应收敛为「任务键/任务状态」或对「依赖」标 UNKNOWN。
- **c2 inferred 主张带依据 + source: inferred(50/50)**:三条推断腿全部成对给出注解且依据实证核验属实——perception-chain-error(`source: inferred:…推自 FT-056…journey Step 1 未列此边——回流主角通道的失败腿补全`,兼有 required_outcomes 映射注释)、simultaneous-late-op-rejected(journey Step 3b 明列拒绝分支,属 journey 继承而非规则派生,无需 inferred 注,映射注释合规)、simultaneous-late-op-accepted、structural-change-flowback(diff.ts:82-98 核验属实)、ended-link-history-retained(session-links.ts:48-95 核验属实)。
- **c3 无未分类幻觉(40/40)**:全部行为主张对照 FT-045/046/047/035/056/032、journey、page-map(回流呈现/属性级高亮/结构性增量)、spike-1-findings、business-rules(人侧只读 BIZ-task-ops-001——全旅程无一处看板写操作;静默降级 BIZ-resilience-001 与 FT-056 sync-error 呈现不冲突,后者为 M2 设计事实)核验,除 c1 已计项外无凭空主张。

### 5. Surface Fitness — 100/100

- **强制派生 Outcome(40/40)**:validation-error + session-expired 双双以映射注释 + 实腿落地(家族先例写法):step-1 `"surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用…通道失效类比 = 看板感知链(watcher→indexer→事件推送)失败,映射为 FT-056 sync-error 工具栏指示 + 静默重试 + last-good 看板保留 = 本边"`;step-3 `"validation-error → 本旅程看板人侧只读、无表单输入面;非法输入类比 = 双形态并发下不满足 forge 状态机前置的操作输入,由 forge CLI 拒绝并反馈发起侧 = 本边"`。
- **Web 语言(35/35)**:用户交互(`"人在终端执行一次任务状态变更,随后回到应用看板查看"`)、页面元素(看板/工具栏同步指示/任务详情挂接区/来源[终端]标记)、异步语义(`"5 秒内免手动刷新可见"`/`"增量推送更新"`/`"不重建整板"`)。终端/CLI 动作语汇为旅程双形态故事的固有用户动作(journey 原文如此),非 DOM 选择器/框架断言。
- **TUI 超时项(25/25)**:非 TUI surface,满分。

### 6. Internal Consistency — 145/150

- **不变量在每份 Contract 成立(60/60)**:唯一事实源——全部工作台侧 Side-effect 只读(`"forge 文件被终端侧变更(工作台只读感知,零写回)"`、`"none(校验只读)"`);新增错误腿自带不变量且与 FT-056 一致(`"感知链故障不产生第二事实源;last-good 保留不虚构数据"`);≤5 秒——step-1/1b/structural 断言 5 秒;自有状态独立——step-4(`"校验含混写检测"`)、step-5(`"自有状态不写入 forge 文件"`)。
- **跨 Contract 状态引用一致(50/50)**:step-4 `"Step 3 交替操作已完成"` 吻合 step-3;step-5 交替完成引用与 step-3 终端口径及 frozen 互斥声明闭环;step-3 structural 的 `"其处置按 Step 5 挂接保留语义"` 在 step-5(ended 保留 + `"挂接记录完整保留"`)有着落;step-1 fixture `"未完成(可 claim/transition)"` 与 journey Setup 同源。无悬空引用。
- **前置与前步 State 一致 + Outcome 内部自洽(35/40,−5)**:**perception-chain-error 腿 Input 与 Side-effect 措辞冲突**:Input 为 `"终端执行一次任务状态变更,观察已打开看板(不重启应用),随后感知链恢复"`——终端变更必然写 forge 文件(对照同文件 success 腿 Side-effect `"forge 文件被终端侧变更"`),而本腿 Side-effect 写 `"none(失败面收敛于感知链;不写 forge 数据)"`,未限定主语;姊妹腿均以 `"none(工作台只读感知终端变更)"` 限定动作方。下游按字面把「不写 forge 数据」当断言(变更期间 forge 数据零写入)会与本腿自身 Input 直接冲突。−5(措辞歧义级,非不变量违反)。

### 7. Anchor Integrity — 100/100

- **锚点字段完整(40/40)**:5 份 frontmatter 均含 `anchors.web.page` + route/requires_auth/layout;本旅程触达 workbench/tasks 单页 + 详情侧板,handbook 其余页面归属其他旅程。
- **锚点值与 handbook 一致(30/30)**:`page: "workbench/tasks"` ×5 与 page-map View Key 逐字一致;`route: ""` 为 FT-053 视图键寻址既定设计(非缺陷);`requires_auth: false` = handbook `Auth: none`;step-5 layout `WorkbenchShell → TaskBoardPage → TaskDetailPanel(挂接历史)` 对应 handbook 任务看板 Page Sections「任务详情侧板(UF3)| TaskDetailPanel」。layout 括注携带旅程语境注释(回流呈现/对拍等)与上轮同判:冗余但非错配。
- **handbook 内部一致(30/30)**:page-map 视图键无重复、无路由冲突(全视图键寻址),dialog 浮层与 feature 子视图声明无歧义,与 FT-053 一致。

### 8. Fixture Specification — 87/100

- **实体完整性(40/40,veto 未触发)**:上一轮 veto 根因已修——step-1 两腿 fixture 显式声明 `entity_type: "SessionLink", min_count: 0` + 零挂接钉死 state_requirement(`"被变更任务零 active 挂接:…fixture 须显式钉零(隔离 userData、零挂接写入足迹)"`),底部并集同步;其余各 Outcome 引用的实体(含 active/ended SessionLink、pending/未完成 Task)均在各自 fixture_spec 内声明;entity_type 与域模型(tech-design Project/Task/SessionLink)语义吻合。
- **关系与约束覆盖(30/35,−5)**:**step-4 offline-terminal-changes 的「不误标」判定输入未钉**:该腿 Invariants 断言 `"离线变更不丢失、不误标"`——「不误标」即来源标记正确(应标 [终端]),其判定输入是 FT-045 路径 2 的 active 挂接兜底(挂接索引为工作台自有 SoT、不可从 forge 文件推导),而该腿 fixture 仅 Project/Task、无 `SessionLink min_count: 0`、无零挂接钉死 state_requirement——与 step-1 已修复的缺席钉属同类,若 fixture userData 残留 active 挂接,误标断言静默失效。−5(较 step-1 旧缺陷轻:实体仅隐含于 Invariants 措辞,未出现在 Preconditions/Input/State,veto 不适用)。
- **min_count 充分性(17/25,−8)**:**step-1 board-open-change 的保留断言在 min_count: 1 下空转**:Output 断言 `"变更前看板既有内容完整保留(其余任务不丢失、无整板重载/闪烁)"`——fixture 仅 1 个 Task 且即被变更任务,「其余任务」为空集,保留断言无从验证(整板重载的典型 bug 场景恰需 ≥1 个未变更任务对拍)。该断言为本轮新增(修复旧盲区 4),但 fixture 未随之升配:Task `min_count` 应 ≥2(1 变更 + ≥1 未变更)。−8(rubric 低配规则)。观察项(不计扣):step-3 structural 腿「或移除」变体在 min_count 1 下「既有任务属性不变」同样趋空,但场景按声明的「新增」变体可执行,未达不可行线。

---

## Phase 3 — Blindspot Hunt(rubric 之外)

1. **[blindspot] 感知链错误腿的「恢复」不可由声明的注入方式驱动**。state_requirement:`"感知链故障注入:fixture 副本上使变更扫描持续失败(如 forge 数据读取异常),错误腿供给随 fixture 清理"` ——注入被钉为**持续**失败且清理挂在 fixture 拆除,而 Input 要求测试中段恢复(`"随后感知链恢复"`)以观察 `"感知链恢复后变更免手动刷新回流可见"`;规格未声明故障须可中途移除,且「forge 数据读取异常」若真使数据不可读,同一 Input 里终端侧变更能否完成亦存疑。需补「故障注入可在测试内撤销」的驱动口径。rubric 的 Fixture 维只覆盖实体/关系/数量,不含故障注入生命周期。
2. **[blindspot] 恢复段回流缺 ≤5 秒时效界,同旅程口径不一**。perception-chain-error Output:`"感知链恢复后变更免手动刷新回流可见"` ——同文件其余回流断言均钉 5 秒(`"该变更 5 秒内免手动刷新可见"`、`"变更 5 秒内可见"`);恢复段无界将使下游用默认超时而非旅程不变量的 5 秒预算,强弱不一。文件级 Invariants 虽有 ≤5 秒条,Outcome 级断言精度应同口径。
3. **[blindspot] stub CLI 对拍的同源弱化未声明真实 CLI 腿**。step-2 state_requirement:`"终端输出 = 测试进程直读 fixture forge 文件/stub CLI stdout"` ——SC7 stub 的 task-status 腿与看板读同一批 index.json(两个投影同源),「终端输出与看板一致」在 stub 路径下近乎重言;双形态主张的强形式(真实 forge CLI 输出对拍)在哪条腿兜底未声明。不构成事实违规(stub 为既有 SC7 装置),但测试强度上「一致」的证明力应显式分层。

---

## Attacks(修订优先级序)

1. **[Fact Alignment]** 对拍维度「依赖」非 `forge task status` 实际输出项 —— `"对拍维度收敛为 forge task status 实际输出项:任务状态/依赖"`(step-2 success Output)—— 按 SC7 oracle 实际输出(cli.ts:217-236:任务键 + 状态;SC7-1「状态集合一致…词表直通」)收敛为「任务键/任务状态」或对「依赖」标 UNKNOWN。
2. **[Fixture Specification]** board-open-change 新增保留断言与 min_count 1 空转 —— `"变更前看板既有内容完整保留(其余任务不丢失、无整板重载/闪烁)"` vs `entity_type: "Task", min_count: 1` —— Task min_count ≥2(1 变更 + ≥1 未变更)。
3. **[Fixture Specification]** step-4 offline「不误标」判定输入未钉 —— `"Invariants: 离线变更不丢失、不误标"` 而该腿 fixture 仅 Project/Task —— 补 `SessionLink min_count: 0` + 零挂接钉死 state_requirement(照搬 step-1 修复写法)。
4. **[Internal Consistency]** perception-chain-error Side-effect 未限定主语、与本腿 Input 冲突 —— `"none(失败面收敛于感知链;不写 forge 数据)"` vs Input `"终端执行一次任务状态变更…随后感知链恢复"` —— 改为「none(工作台侧不写 forge 数据;终端变更照常落盘)」类限定写法。
5. **[blindspot]** 恢复腿 drivability:故障注入须可中途撤销 —— `"感知链故障注入:…使变更扫描持续失败(如 forge 数据读取异常),错误腿供给随 fixture 清理"` —— 声明注入/撤销的测试内生命周期,并确认注入方式不阻断终端变更本身。
6. **[blindspot]** 恢复段回流补 ≤5 秒界 —— `"感知链恢复后变更免手动刷新回流可见"` —— 与同旅程其余回流断言同口径钉 5 秒。
7. **[blindspot]** stub 对拍的同源弱化分层 —— `"终端输出 = 测试进程直读 fixture forge 文件/stub CLI stdout"` —— 声明(或排除)真实 forge CLI 对拍腿,使「双形态一致」的强主张有非同源证据。
8. **(观察,不计扣)** structural 腿「或移除」变体在 min_count 1 下「既有任务属性不变」趋空 —— `"既有任务属性不变"` —— 若要双变体全验,Task min_count ≥2。

---

## 结论

修订版把 iteration-1 的三个失败面全部关掉:step-1 的 SessionLink 缺席以 `min_count: 0` + 零挂接钉死落地(veto 解除);Web 强制派生以两条家族式映射注释 + 一条实打实的感知链失败腿(FT-056)落地;事实溯源全面补齐且经独立对表/对码核验零错位(FT-045/046/047/035/056/032、diff.ts、session-links.ts、spike-1-findings 全部属实)。遗留 4 处小缺陷互不叠加成失败面:最重的是 step-2 对拍维度「依赖」与项目自有 SC7 oracle 的实际输出(任务键 + 状态)不符(−8),其余为 board-open 腿 fixture 低配(−8)、offline 腿判定输入未钉(−5)、错误腿 Side-effect 措辞(−5)。**总分 1074/1100 ≥ 935 且 8 维全部过阈 → PASS。**
