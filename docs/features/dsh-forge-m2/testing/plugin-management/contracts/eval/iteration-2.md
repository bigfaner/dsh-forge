# Contract Eval Report — plugin-management / iteration 2

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-{1..5}-*.md`(5 份,共 14 个 Outcome——iteration-1 后新增 step-1 `load-error-retry`)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / .forge/fact-table.json / gen-journeys rules/surface-web.md;代码现实核对:apps/desktop/resources/plugin-bundles.json、apps/desktop/src/main/workbench/ipc/plugins.ts、apps/desktop/src/main/plugin-runtime/overlay.ts、packages/plugins/forge-workbench/src/client/views/overview/{OverviewPage,PluginSection}.tsx、views/overview/plugin/PluginRowView.tsx;PRD prd-ui-functions.md(UF6 Data Requirements / States)
- **Iteration**: 2(上一轮:contracts/eval/iteration-1.md,889/1100 FAIL)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分,事实主张逐条对照代码/事实表核验;不为「进步」给分,只为页面上现存的内容给分

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 192/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 145/150 | 90 | ✓ |
| 4. Fact Alignment | 143/150 | 90 | ✓ |
| 5. Surface Fitness | 100/100 | 60 | ✓ |
| 6. Internal Consistency | 140/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | 97/100 | 60 | ✓ |
| **Total** | **1067/1100** | 935 | ✓ |

**Overall: PASS** — 1067 ≥ 935 且全维过阈。iteration-1 的致命双点(entity-completeness veto、基数模型失实)均已实质修复并经代码核验;残留扣分为局部文本/断言层问题(见 Attacks),不构成达标阻碍。

### Iteration-1 attack 修复核验

| # | iteration-1 attack | 状态 | 核验 |
|---|---|---|---|
| 1 | Fixture veto:step-2 会话链实体缺席 | **fixed** | in-session-disable 现声明 Plugin(5)/Project(1,active)/Task(1,belongs_to Project)/SessionLink(1,active,belongs_to Task)+ 三条 state_requirements(在线使用/会话本体存活/清单变体);success 腿 SessionLink min_count 0 + 缺席 state_requirement——家族口径(min_count 0 or sized + SoT 钉缺席)双腿齐备,FT-035 锚在场 |
| 2 | 基数「恰一个」与现行清单矛盾 | **fixed** | 三处改为「产品清单条目全部 mandatory = true(当前 3 条:@deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、@dsh-forge/plugin-forge-workbench;hello-world 已移出产品清单)」,min_count 5(3+2)全家族一致;与 apps/desktop/resources/plugin-bundles.json 逐条吻合(核验属实);且规避了陈旧的 FT-016(仍列 hello-world) |
| 3 | 全家族零 FT-xxx 锚 | **fixed** | FT-048 ×6、FT-049、FT-050、FT-006、FT-035 ×2、FT-040、FT-043、FT-053 逐条对照事实表存在且支撑主张;残留两处无分类(见 Fact Alignment) |
| 4 | Output/State 内嵌对拍通道(8 处) | **fixed** | 全部移入 state_requirements;Output/State 现只留行为性表述(「forge 数据零损坏」「产品清单字节不变」),同文件 state_requirements 持有对拍口径 |
| 5 | step-5 前置不可由 step-4 终态达成 + step-3 常规装置欠钉 | **fixed** | core-capability 改「fixture 直供」并显式说明序列派生歧义之排除;step-3 success 增设「常规装置:plugin-runtime.json 预置存在,disabled 集不含目标与对照第三方名」state_requirement |
| 6 | step-5 缺 tasks 视图锚 | **fixed** | outcome 级 `<!-- anchors:... -->` 注释声明双视图(workbench/overview 主锚 + workbench/tasks 断言面,FT-053);frontmatter 主锚为真实视图键,符合项目口径 |
| 7 | step-5 两腿前置可共真 | **fixed** | success 前置补「回看时目标第三方插件处于启用态(与 core-capability-unaffected 的目标禁用态互斥)」 |
| 8 | step-4 前置/Input 混执行假设与驱动机制 | **fixed** | 驱动细节全部并入 state_requirements(含 FT-006 锚);Preconditions/Input 现为纯用户面表述 |
| 9.1 | 清单变体机制未声明 | **fixed** | 「测试 profile 清单变体」state_requirement 到场于 step-1/2/3/5,并澄清「宿主槽位『动态注册』不入插件行集」——与代码 `listRows() = manifest.map`(plugins.ts:100-103,核验属实)一致,纠正了 journey/6.5 注记的含混机制 |
| 9.2 | cancel-no-op 覆盖文件存在性欠钉 | **fixed** | 前置钉死「启停覆盖文件已存在且 disabled 集不含目标与对照第三方名」+ state_requirement 给出对拍基线与缺席型归属(first-write 腿) |
| 9.3 | 加载失败/重试路径零覆盖 | **fixed** | 新增 load-error-retry Outcome(带 code 锚 inferred 注释;PluginSection.tsx 实装行为核验属实:首载失败 retry 卡 + `hasLoaded` 保底);但该腿 State 引入新的不可达断言(见 Attack #1) |

---

## Phase 1 — Reasoning Audit(评分前独立判断)

步骤/结果映射:journey 12 腿全覆盖,契约另增 2 条带 inferred 注释的腿(first-write-creates-overlay、load-error-retry),14 Outcome 无虚构步骤。两条 Web 强制派生(validation-error / session-expired)以显式映射注释到场。

代码现实独立核验(本轮新增侦察):

- **清单基数**:shipped `plugin-bundles.json` = 3 条全 mandatory(dsh-base / dsh-web-app / plugin-forge-workbench),契约「当前 3 条」表述逐名吻合 ✓;FT-016(仍列 hello-world)已陈旧,契约未引用 ✓
- **PluginSection 与项目无关**:OverviewPage.tsx:465-475 注释与渲染分支明证「Rendered in EVERY ready branch (populated grid AND empty 空态卡 alike): plugin management is unrelated to project registration」——step-1/3/4 仅声明 Plugin 实体是**正确**的装置设计(曾疑为实体缺失,代码证伪该疑)✓
- **listRows = manifest.map**(plugins.ts:100-103):「插件行集唯一来源是清单文件」与「宿主槽位动态注册不入插件行集」属实 ✓
- **overlay.ts 头注**:「文件缺失 = 空覆盖」「单写路径 setPluginEnabled 唯一写入者」与 first-write inferred 注释逐点吻合 ✓
- **PluginSection 重试/保底**:首载失败 → retry 卡(`data-dsh-forge-plugins-retry`);`hasLoaded` 保底——失败重列保持末次良好行;toggle 期间 `pendingName` 守卫忽略重复点击(double-click-guard 断言属实)✓
- **PluginRowView**:必备行零动作控件(「不渲染,而非渲染后禁用」逐字成立);第三方行 hint 常显 ✓
- **third-party-disabled 态**:PRD ui-functions UF States 表与 ui-design.md:409 均有定义(journey/契约引用为真实设计态;但契约内无锚,见 Fact Alignment)

评分前锚点(后流入对应维度):

- **(a) load-error-retry 的 State 半壁不可达**:State 断言「已就绪后的重列失败保持末次良好行」,但该腿装置为「listPlugins 首载拒绝注入(装置态;重试后恢复为正常清单装置)」——重试成功后装置内无第二次失败源,「已就绪后的重列失败」在本腿前置/输入/装置下无法铺出。断言写了,证据链没铺(流入 Internal Consistency / Fixture)。
- **(b) step-5 的「第三方扩展内容退出说明显示」观察面无会话装置**:step-2 对同一可观测(挂接区 third-party-disabled 说明)配了 SessionLink(1,active)+ 会话本体存活装置;step-5 core-capability 无任何会话/挂接实体却断言同一显示,观察点未钉(其代码侧唯一物化是插件行常显 hint)。流入 Internal Consistency。
- **(c) mandatory-no-disable 前置被 success 世界态真包含**:「插件管理区已展示必备(核心)插件」在 success 腿就绪态下恒真,Outcome 选择依赖 Input 而非前置(流入 Precondition Exclusivity)。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:14 个 Outcome 的 Preconditions/Input/Output/State 全部非空,Side-effect 全显式(step-1 `"none(打开只读)"`、step-2 `"none(发起阶段零写入)"`、step-3 cancel `"none(取消路径零写入)"` 等)。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants` 各 4 条,与 journey.md 逐字一致。
- **派生场景覆盖(50/50)**:validation-error(→ mandatory-no-disable 越权启停类比)与 session-expired(→ overlay-invalid 通道失效类比)均以 `<!-- surface-web required_outcomes 映射 -->` 注释到场;另覆盖取消、重复点击、首写创建覆盖文件、重启持久、核心能力波及、首载失败重试(新增)——12 journey 腿 + 2 条 inferred 增腿,超出最低要求。

### 2. Semantic Purity — 192/200

- **c1 自然语言(80/80)**:无 regex/选择器/XPath/框架断言;iteration-1 的 8 处对拍通道泄漏全部清除,oracle 语言只存在于 state_requirements(Output 现为「forge 数据零损坏」「产品清单字节不变」等行为表述)。
- **c2 声明式前置(56/60,−4)**:主体声明式。残留:step-4 restart-persistence 前置 `"第三方插件已被禁用且不执行启用操作,直接重启应用(与 success 的启用腿互斥)"` ——「直接重启应用」是用户动作嵌入前置(场景定界语,非纯状态);step-3 success 前置 `"禁用二次确认对话框已确认"` 与 Input `"确认禁用"` 对同一事件双重描述(iteration-1 已注记,仍在;前置宜写「对话框打开待确认」)。
- **c3 无实现耦合(56/60,−4)**:错误码(FT-031 一等契约)与产品文件名可留。扣分:step-1 load-error-retry 前置 `"插件区首载失败(listPlugins 首载拒绝;发生于首载成功前,与 success 的就绪态及 overlay-invalid 的清单态回退均互斥——后两者 listPlugins 调用成功)"` —— 维值两处内嵌 IPC 动词名(listPlugins),家族口径动词面留 state_requirements/锚注,维值保持行为语(「插件清单数据首载失败」即可)。

### 3. Precondition Exclusivity — 145/150

- **c1 各 Outcome 前置互斥(55/60,−5)**:step-1 三腿以覆盖文件有效性显式分区且 load-error-retry 增补「与 success 的就绪态及 overlay-invalid 的清单态回退均互斥」;step-2 常规/在线显式互斥;step-3 四态分区(已确认/执行中/已打开未确认/文件缺失)互相引名;step-4、step-5 显式互斥。扣分:step-1 mandatory-no-disable 前置 `"插件管理区已展示必备(核心)插件"` 为 success 世界态的真子集——就绪态下两腿前置同时可满足,Outcome 选择退到 Input 层。
- **c2 前置足以唯一定位(50/50)**:iteration-1 的 step-5 终态未钉已修复(success 钉「回看时目标第三方插件处于启用态」);其余各腿在前置层即可唯一定位(mandatory-no-disable 的输入依赖已在 c1 计)。
- **c3 边界 Outcome 显式触发条件(40/40)**:全部边界腿触发条件显式:overlay-invalid 两型、double-click(transitioning 执行窗口)、cancel(对话框已打开)、first-write(文件尚不存在)、load-error(首载拒绝、且与另两腿的调用成功面区分)、restart(禁用态 + 不启用)。

### 4. Fact Alignment — 143/150

- **c1 事实主张可溯源(53/60,−7)**:FT-048/FT-049/FT-050/FT-006/FT-035/FT-040/FT-043/FT-053 全部核对存在且支撑主张;3 必备清单表述与 shipped manifest 逐名吻合。残留无分类主张:(i) step-2 与 step-5 Output 的 `"挂接区显示第三方扩展内容退出说明(third-party-disabled 态)"` —— 该态在 prd-ui-functions.md States 表与 ui-design.md:409 真实存在(外部核验为真),但契约内无 FT 锚、无 inferred 注释、无 UNKNOWN(事实表无对应条目,按家族口径应给设计引用或 inferred 注);(ii) step-4 restart State `"启动装配按清单 × 覆盖对账"` —— 对账语义近 FT-017/FT-048,未锚。
- **c2 inferred 主张有规则支撑 + 注解(50/50)**:五条 inferred 注释全部规范且依据经核验属实:overlay-invalid(tech-design Interface 4 + sc6 e2e)、double-click(UF6 transitioning)、first-write(plugins.ts:100-116 + overlay.ts 头注——本轮逐行核验吻合)、restart(UF6 Data Requirements 引文)、load-error-retry(PluginSection 实装行为——核验吻合);两条 surface 映射注释到场;mandatory-no-disable 现带 FT-049 锚(iteration-1 缺口已补)。
- **c3 无未分类幻觉(40/40)**:iteration-1 的「恰一个」×3 与「基座 hello-world」两类未分类主张已全部消除;现存主张经外部核验无编造。

### 5. Surface Fitness — 100/100

- **强制派生 Outcome(40/40)**:validation-error / session-expired 双映射到场且映射腿为真实可测行为(与项目离线桌面映射口径一致)。
- **Surface 语言(35/35)**:通篇用户交互语言(`点击「禁用」`、`在确认对话框选择「取消」`、`在错误卡上点击「重试」`)、页面元素(`行`、`徽标`、`确认对话框浮层`、`错误卡`)、状态迁移(`transitioning → 已停用`);step-4 Input 的 e2e 驱动面文本已清除。listPlugins 动词名扣分计入 Semantic Purity c3,此处不重复计。
- **TUI 超时(25/25)**:Web 面,不适用。

### 6. Internal Consistency — 140/150

- **不变量逐份成立(60/60)**:两级模型(mandatory-no-disable 不渲染口径与 PluginRowView 实装逐字一致)、只写覆盖文件(全部 Side-effect)、清单只读、「仅该插件」收敛对照装置(step-3/4/5 对照第三方在场)。无违规。
- **跨 Contract 状态引用一致(45/50,−5)**:主链闭合(cancel ← step-2 对话框;step-4 ← step-3 已停用;step-5 fixture 直供并显式排除序列派生歧义;step-1/2/3/5 的「清单变体口径见 step-1 Setup」引用可解析且口径一致 3+2=5)。扣分:step-5 core-capability Output `"第三方扩展内容退出说明显示(核心挂接能力不受影响)"` —— 同一可观测在 step-2 由 SessionLink(1,active)+「挂接会话本体存活装置」铺出观察面,step-5 无任何会话/挂接实体,该显示的观察点未钉(代码侧唯一确定物化是插件行常显 hint,与「挂接区」语义不同),断言悬空于两套装置之间。
- **前置与上游 State 相容(35/40,−5)**:step-2←1、step-3←2、step-4←3、step-5(直供)均相容;first-write 与 step-1「缺失 = 合法」读法自洽。扣分:step-1 load-error-retry State 后半 `"失败重列保底——已就绪后的重列失败保持末次良好行,不乐观清空既有行态"` 在本腿前置(首载失败)与装置(`重试后恢复为正常清单装置`)下不可达——重试成功后无第二次失败注入源,该断言在本腿不可执行(见 Attack #1)。

### 7. Anchor Integrity — 100/100

Handbook(`design/page-map.md`)存在,按 Web 面 `page` 字段评分;`route: ""` 系 FT-053/page-map 明言的视图键寻址设计,非缺陷(评估口径明示)。

- **锚点字段完整(40/40)**:5 份文件均有 page/route/requires_auth/layout;浮层步骤锚到父页 `workbench/overview` 并在 layout 标注浮层。
- **锚点值与 handbook 一致(30/30)**:`workbench/overview` 精确匹配 View Key;layout 串逐项对上 page-map(WorkbenchShell → OverviewPage → PluginSection);step-5 core-capability 的跨视图断言面以 outcome 级注释声明(workbench/overview 主锚 + workbench/tasks 断言面,FT-053)——主锚为真实视图键,符合项目「outcome 级跨视图注记可接受」口径。
- **Handbook 内部一致(30/30)**:page-map 视图键(overview/tasks/features/:slug/dialog/*/session)无重复、无同键异径。

**Missing Anchor Fields**:无(5/5 份契约锚字段齐全)。

| Contract File | Missing Field | Expected Value |
|---|---|---|
| — | — | — |

**Handbook Conflicts**:无。

| Conflict Type | Entry A | Entry B | Description |
|---|---|---|---|
| — | — | — | — |

### 8. Fixture Specification — 97/100

- **实体完整性(40/40,veto 未触发)**:语义核验通过——step-2 会话链(Plugin/Project/Task/SessionLink)双腿齐备,SessionLink 缺席以 min_count 0 + state_requirement 钉死(FT-035 家族口径);step-5 core-capability 补 Feature(belongs_to Project)+ Task(task_key FT-040 方言、prompt 可达 FT-043 约束);step-1/3/4 仅 Plugin 经代码核验为正确(PluginSection 渲染与项目注册无关——OverviewPage 实装明证),非实体缺失。会话本体(UF5 上游概念)以 SessionLink + 「挂接会话本体存活装置」state_requirement 承载,符合家族建模。
- **关系与约束覆盖(32/35,−3)**:relationship_type/parent_entity 全部到位;overlay 预置内容装置(success/cancel/core-capability)、缺席装置(step-2 success)、失效形态(overlay-invalid 两型)、一次性装置 + 单实例探测均落 state_requirements。扣分:load-error-retry 已就绪后重列失败无对应 state_requirement 注入声明(Attack #1 同根)。
- **最小数据量(25/25)**:Plugin min_count 5 = 3 必备 + 2 第三方,与清单变体口径和 shipped manifest 三方一致;SessionLink 1(active)/0(缺席);Project 1(active)、Feature 1、Task 1;「仅该插件」收敛的对照插件在场(3/4/5),断言非空洞。

---

## Cross-Dimension Coherence Check

- Attack #1 的三面归一:load-error-retry State 不可达断言在 IC c3(−5)与 FS c2(−3)各计一面,系同一根因(装置未铺出断言态)的两个维度投影,合计 −8,未重复叠罚其它维度。
- Fact Alignment 的 third-party-disabled 无分类(−7)与 IC 的 step-5 观察面未钉(−5)同源异面:前者是分类缺失,后者是装置/观察面缺失;step-2 侧该断言有完整装置(不扣 FS),故二者不矛盾。
- SP c3 的 listPixels 动词泄漏与 SF 满分并存成立:动词名属 page-map Data Source 词汇(设计层),Surface Fitness 按用户面语言判满分;扣分只落在「维值不含实现面」的 SP 维。
- Cardinality(FT-048/清单变体/min_count 5)在 5 份文件与 state_requirements 间完全一致,无跨文件漂移。

## Phase 3 — Blindspot Hunt(维度外发现)

1. **[blindspot] toggle 拒绝错误路径(回滚 + 可读 toast + 守卫码重列)有实装、无任何可执行 Outcome**:PluginSection 实装了完整的 toggle 失败族(`catch` → 按码映射可读 toast;ERR_PLUGIN_MANDATORY/ERR_PLUGIN_RUNTIME_STATE 额外重列;任何拒绝不乐观翻转行态——代码注释「a rejection never flips a row optimistically (revert = the last good rows stay)」),而 5 份契约 14 个 Outcome 无一腿覆盖「禁用/启用动词被拒绝」的用户可见行为;其唯一痕迹是 step-1 load-error-retry State 中那句不可达的 `"失败重列保底——已就绪后的重列失败保持末次良好行,不乐观清空既有行态"`。改法:增设 toggle-rejection Outcome(触发:启停动词拒绝;断言:行态不变 + 可读错误提示 + 守卫码触发重列),并把 load-error-retry State 的保底半句迁入该腿。
2. **[blindspot] 确认文案双语要求(PRD UF6 Data Requirements)全家族未断言**:PRD 明文 `"影响说明文案 | text | 静态 | 中英双语"`(prd-ui-functions.md UF6),step-2 Output 断言了确认文案的内容(`"出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)"`)但任何 Outcome/Invariants 均未触及其语言面;zh/en 双 locale 实装在场(FT-052 同族)。该缺口承自 journey(journey eval iteration-1 已记为 open/non-blocking),契约层延续未补。改法:为确认对话框(及 third-party-disabled 说明)补 copy-language 断言或 Invariant。
3. **[blindspot] 无第三方行的「空态」(shipped 产品默认形态)零覆盖**:PluginSection 实装了 mandatory-only 空态(代码:`{thirdParty.length === 0 && ...}` quiet hint);真实 shipped 清单零第三方条目,此空态恰是生产默认形态,而全家族前置恒为 `"第三方 fixture 插件至少 2 个且均启用"` ——空态 hint 的呈现(以及「第三方插件 · 禁用仅退出其注入内容」的常显语义)在 14 个 Outcome 中无腿。改法:step-1 增补 mandatory-only 空态 Outcome(或不以清单变体装置的裸产品形态腿)。

---

## Attacks(残留问题,按优先级)

1. **[Internal Consistency] load-error-retry State 半壁不可达**:State 断言 `"失败重列保底——已就绪后的重列失败保持末次良好行,不乐观清空既有行态"`,但装置仅 `"listPlugins 首载拒绝注入(装置态;重试后恢复为正常清单装置)"` —— 重试成功后无失败源,断言在本腿不可执行。改法:拆独立 Outcome(配 post-ready 重列失败注入)或删该半句(并入 blindspot #1 的 toggle-rejection 腿)。
2. **[Internal Consistency] step-5「说明显示」观察面无装置**:Output `"第三方扩展内容退出说明显示(核心挂接能力不受影响)"` 在无 SessionLink/会话实体的 fixture 上断言 step-2 需活跃会话装置才铺出的同一显示。改法:钉观察点(插件行 hint 或挂接区),若为后者补会话链装置或降为 step-2 专属断言。
3. **[Precondition Exclusivity] mandatory-no-disable 前置被 success 真包含**:前置 `"插件管理区已展示必备(核心)插件"` 在 success 就绪态恒真,Outcome 选择依赖 Input。改法:前置补区分项(如「用户以必备行为目标发起启停尝试的会话前置」或引用必备行唯一性装置)。
4. **[Semantic Purity] 维值内嵌 IPC 动词名**:load-error-retry 前置两处 `"listPlugins 首载拒绝"` / `"后两者 listPlugins 调用成功"` —— 维值保持行为语,动词面移 state_requirements。
5. **[Fact Alignment] 两处无分类具体主张**:`"third-party-disabled 态"`(step-2/step-5 Output)与 `"启动装配按清单 × 覆盖对账"`(step-4 State)—— 补设计引用/prd 引用或 inferred 注。
6. **[blindspot ×3]**:toggle 拒绝错误路径无 Outcome、确认文案双语未断言、mandatory-only 空态零覆盖 —— 建议下一轮或验收计划补齐(均非达标阻碍)。

## Revision Guidance(给 Reviser)

本轮 PASS(1067/1100,全维过阈),迭代可止。若继续打磨:Attack #1 与 blindspot #1 同根,合并为一次修改(增设 toggle-rejection Outcome 并迁移保底半句)收益最大;#2/#3/#5 为局部文本级;blindspot #2/#3 可留安装/升级与 i18n 验收面处理。修改时保持 14 Outcome 骨架、互斥分区、映射注释与 Journey Invariants 逐字一致不动——本轮满分的结构(Completeness/Anchor/Surface)不要为局部修补引入回归。

## Eval-Contract Complete

**Final Score**: 1067/1100 (target: 935)
**Iterations Used**: 2/3

### Score Progression

| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 889/1100 | — |
| 2 | 1067/1100 | +178 |

### Outcome

Target reached — PASS(总分 1067 ≥ 935 且全维 ≥ 阈值:150/192/145/143/100/140/100/97 对 90/120/90/90/60/90/60/60)。
