# Eval Report: journey installer-smoke — Iteration 2

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/installer-smoke/journey.md`
- **Feature**: dsh-forge-p1-mvp
- **Surface**: web（Electron 单机桌面应用，安装形态冒烟）
- **Rubric**: `skills/eval/rubrics/journey.md`（1150 分 / 7 维度 / target 975 / 各维度下限）
- **Surface rules**: `skills/gen-journeys/rules/surface-web.md`（Dimension 5 参数化依据）
- **Scorer**: Senior QA Engineer（对抗立场）
- **Iteration**: 2（对 iteration-1 的修复稿独立评分；不因「有改进」给分，只按当页内容判分）
- **Date**: 2026-10-03

---

## 1. Per-Attack-Point Resolution Verification（前次攻击逐条核销）

对 iteration-1 的全部攻击点与修复优先级逐条重验（核验基准 = 当页文本 + 溯源对照 prd-spec / prd-ui-functions / proposal / 兄弟 journey 原文，非表面措辞）：

| # | Iteration-1 攻击点 | 现稿处置 | 核验结论 |
|---|---|---|---|
| 1 | D5 必察派生 Outcome 完全缺席（0/60，致命项） | 新增「Derived Outcomes（Web Surface 必察项）」段：validation-error 实步覆盖（新增 Step 4b）+ session-expired N/A 论证，均带 `source: inferred` 与规则依据（"surface-web required_outcomes 必察项 × UF-4" / "必察项 × PRD 安全边界映射"） | **RESOLVED**——两项齐备且纪律完整；session-expired N/A 论证经核与 PRD 安全边界原文一致（"宿主服务仅本机回环可达"「模型 API 凭证归 dsh profile 域」） |
| 2 | Step 3「中区面板」vs Step 3b「hero 空态」同前置互竞 | Step 3b 已删除；Step 3 直接断言「中区呈现 hero 空态 +『＋添加项目』CTA——全新安装零项目时中区的确定相位（UF-2）」 | **RESOLVED**——与 UF-2 States（hero：项目数 = 0）逐字对应，互竞期望不复存在 |
| 3 | Step 4 动作不可执行（把目标面板当入口写） | User Action 改为「点左栏 rail『新会话』（品牌行为等价入口——UF-1 交互流第 1 条：点击 → 中区切换到会话视图并新建会话）」 | **RESOLVED**——与 UF-1 交互流第 1 条原文一致；并给出可观察判据「对话 tab 输入区可聚焦、键入字符即回显」 |
| 4 | Invariant 2 未分类等价性主张 | 改写为「机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；『安装 ≡ 开发』等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言」 | **RESOLVED**（实质）——已标注 source: inferred + 审计通道；残留「标记形态为 inferred/UNKNOWN 混合体」记 D4 小扣 |
| 5 | Step 2 Expected Result 实现耦合（boot manifest 掌舵写入结果） | 期望改为可观察（主窗口打开 / 无报错弹窗 / 无白屏停留 / 等待窗口内装载完成），机制移入显式「审计注记」并声明由契约面 pin 测试（G1 门）承载 | **RESOLVED（主体）**——G1 门归属经核与提案一致（"逐项 pin 测试（G1 门内容）"）；注记仍留在 Step 块内，记 D2 小扣 |
| 6 | 安装期离线主张无验证通道 | Step 1 声明「验证通道 = 安装产物与构建配置检查（审计通道承载）；运行期网络断言由 Step 2b 行使」 | **RESOLVED** |
| 7 | 启动失败路径零覆盖（blindspot④） | 新增 Step 2c：Precondition（运行时缺失 / 首启崩溃 / 白屏类故障）+ 检出口径（首屏未在等待窗口内呈现）+ 可见失败呈现 + M8 记账 | **RESOLVED**（新增小瑕疵见 D3：三种故障模式的可见呈现并写一档） |
| 8 | 覆盖安装 / 升级边界缺失且未记账（blindspot②） | Setup「范围记账：仅覆盖全新安装单边界——覆盖安装 / 升级 / 残留数据处置归 M8『三平台安装包与更新检测』（提案 Out of Scope），本旅程不设断言」 | **RESOLVED**——M8 名称与提案 Out of Scope 原文（"M8（分发打磨）：三平台安装包与更新检测（单平台冒烟除外）"）逐字一致 |
| 9 | risk_level=Low 与内容不符 | 改为 Medium + 行内论证「安装 = 机器状态变更 + 新建会话 = 实体创建，非纯观察，按注释分类标准归中档」 | **RESOLVED**（主体）——与注释 Medium 定义匹配、与兄弟 journey 分级惯例一致；残留字面张力见 D6 |
| 10 | 「真实 agent 往返属知识飞轮 Journey 范围」归属不准确 | 改为「由兄弟 Journeys session-workbench（Step 2）与 knowledge-recall-flywheel 承载」 | **RESOLVED**——经核 session-workbench Step 2（发起新会话并完成一次真实往返）与 knowledge-recall-flywheel Steps 2–5（真实 dsh 会话往返）均在场，引用成立 |
| 11 | 全文零 source: inferred / 零 UNKNOWN（派生纪律缺位） | 现稿 3 处 source: inferred（validation-error / session-expired / Invariant 2） | **RESOLVED** |
| 12 | 「等待应用首屏呈现」无异步/等待口径 | Step 2「装载在等待窗口内完成（超时未呈现即冒烟失败，口径见 Step 2c）」+ Step 2c 口径 | **RESOLVED**——窗口概念与失败判据闭环（具体秒值归测试配置，非旅程义务） |
| 13 | 浏览器自动化如何附着于已安装应用未交代 | 部分：Step 2b 给出观察通道（启动期网络请求记录，隐含可附着探针）；附着机制本身仍未声明 | **PARTIAL**——记 D5 扣分（-8 于子项 3） |

**新引入问题核查**：修订新增文本中引入两处小瑕疵——① Step 1「开始菜单 / 桌面快捷方式」为无源断言（见 D4）；② Step 2c 三故障模式并写一档致呈现口径不完全覆盖（见 D3）。均为小扣，无致命新伤。golden_path: false 经查为特性级惯例（仅 knowledge-recall-flywheel 为 true），非元数据错误。

## 2. Phase 1 — Reasoning Audit（独立预判锚点）

1. **主工作流覆盖**：成立。Happy Path 4 步与 PRD Goals「安装包冒烟 4 步（安装 → 启动 → 主界面可达 → 会话面板可用）」及 SC-MVP 后半逐字对应，顺序即冒烟顺序。
2. **步骤序列可执行性**：成立。原 Step 4 断点（入口混写）已修复；每步动作在 Setup 声明状态（全新安装、零项目）下可照做。
3. **Outcome 可观察性**：主体成立。Step 1–4 期望均为用户/系统可观察现象；两处机制性内容（打包产物属性、boot manifest 装载机制）显式划归审计通道并给出承载方（产物检查 / G1 pin 测试），分层清晰。
4. **自洽检查**：原 Step 3/3b 矛盾消除；跨步引用（2c、2b、Step 4、兄弟 journey Step 2/2c）全部解析成功。不变量：Invariant 1 运行期与产物侧双通道行使；Invariant 2 审计通道承载——残留一处观察窗口窄于不变量声明范围的问题（见 D6）。
5. **派生处置一致性**：validation-error（实步）与 session-expired（N/A）处置与兄弟 journey 口径一致（"同兄弟 Journey 口径"双向成立）。

预判锚点分别导入 D3 / D4 / D5 / D6 与 blindspot。

## 3. Phase 2 — Rubric Scoring（验证立场，逐条引用原文）

### Dimension 1. Completeness（完整性）— **194 / 200**（下限 120 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| 元数据完整（0-50） | 50 | name=installer-smoke 合 kebab-case；risk_level=Medium 合法且带与注释分类标准挂钩的行内论证；sources 3 个文件均存在且为实际溯源对象（user-stories 无安装冒烟 story，不入 sources 正确）。无可引用缺陷。 |
| Step 字段完整（0-80） | 76 | 4 Happy Step + 3 Edge Step 均有 User Action + Expected Result，顺序连贯，期望可观察。扣 4：① Step 1「应用启动入口就位（开始菜单 / 桌面快捷方式，供 Step 2 行使）」二者关系（任一？皆须？）未定，Step 2「从安装入口（Step 1 快捷方式）启动应用」继承该含混（-2）；② Step 2b「启动应用并走查主界面加载」的走查深度未锚定 Step 3 的三区口径，下游可最简化执行（-2）。 |
| 覆盖 happy + 必察派生（0-70） | 68 | validation-error 实步覆盖（Step 4b）✓、session-expired N/A 论证 ✓、启动失败口径（Step 2c）✓、离线边界（Step 2b）✓、越界项显式记账（M8）✓。扣 2：安装段失败仅有负向观察（见攻击 6），与启动段拥有显式失败步（Step 2c）不对称。 |

### Dimension 2. Semantic Purity（语义纯度）— **188 / 200**（下限 120 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| Outcome 自然语言、非代码/regex（0-80） | 76 | 全文无 regex / 选择器 / 断言调用。扣 4：Step 1 Expected Result 内嵌验证通道与分层记账散文（「验证通道 = 安装产物与构建配置检查（审计通道承载）；运行期网络断言由 Step 2b 行使」）——"how to verify" 混入 "what is observed"，宜移注记位。 |
| Precondition 声明式（0-60） | 60 | 「目标机器处于断网环境」「安装完成但启动异常（…）」「Step 4 会话已建，对话 tab 输入框为空或仅空白字符」均为状态描述；Setup 三条亦声明式。无可引用缺陷。 |
| Step 无实现耦合（0-60） | 52 | User Action 层干净（安装/启动/等待/点击/点发送）。扣 8：架构内部词汇仍在 Step 块内——Step 2「审计注记：装载机制（薄宿主 + 自有前端入口 + 壳内核经 boot manifest 掌舵）为架构内部件（提案 In Scope M0），由契约面 pin 测试（G1 门）承载」；虽已显式标注「非浏览器可观察断言」并完成测试分层记账（较 iteration-1 的直接写入期望已实质改善），更优形态是移出 Step 体（如统一审计段），使 Step 块零内部词汇。 |

### Dimension 3. Precondition Exclusivity（前置条件互斥性）— **144 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| 同 Step 内前置互异（0-60） | 60 | 每步单 Outcome；Step 2（默认环境启动）/ 2b（断网）/ 2c（启动异常）与 Step 4（输入回显）/ 4b（输入空或纯空白）前置两两可区分。无重叠对，-20/对规则无适用实例。 |
| 前置足以唯一定选（0-50） | 44 | 跨步消歧成立（Setup 全新安装 ⇒ Step 3 hero 相位为确定断言，无互竞期望——iteration-1 矛盾已消除）。扣 6：Step 2c 前置「安装完成但启动异常（运行时缺失 / 首启崩溃 / 白屏类故障）」将三种故障模式并写一档，而期望的可见呈现句「可见失败呈现 = OS 级进程退出 / 崩溃对话框」不能覆盖白屏模式（白屏 = 窗口在而内容缺，无进程退出/崩溃框）——同一前置类下两种异质呈现，下游按呈现句对白屏变体断言会误判。超时判据（「首屏未在等待窗口内呈现」）对三模式统一成立，故为局部而非系统性歧义。 |
| 错误/边界前置齐全（0-40） | 40 | Step 2b（断网）、2c（三类启动异常）、4b（空/纯空白输入）均显式声明触发前置。 |

### Dimension 4. Fact Alignment（事实依据）— **140 / 150**（下限 90 ✓）

正向事实链全部复核通过（对照原文）：PRD Goals 4 步冒烟与 In Scope「MVP 门」✓ 逐字；UF-1 交互流第 1 条（新会话入口）✓ 逐字；UF-1 States（rail 空态）、UF-2（hero 相位 + 让位）、UF-4 States（空会话引导输入）、UF-7（dock 轨道归零）✓；提案 Key Scenario「MVP 门走查」、SC-MVP 后半、SC-NFR、NFR（无 CDN/远程脚本/远程字体）、In Scope M0（薄宿主/壳内核/boot manifest）、G1 门（契约面 pin）、M8 两条名称（「三平台安装包与更新检测」「空错态与过渡打磨」）✓ 均在提案 Out of Scope M8 行原文中；PRD 安全边界（本机回环 / 凭证归 dsh profile 域）✓；跨旅程引用（session-workbench Step 2 / Step 2c、knowledge-recall-flywheel）✓ 实存且语义相符。

| 子项 | 得分 | 理由 |
|---|---|---|
| 事实声明可溯源（0-60） | 58 | 溯源段覆盖面完整且逐条核实。扣 2：Step 1 引号内容「静态资源本地打包，无 CDN / 远程脚本 / 远程字体」标注「提案 NFR 原文」，但提案原文为「静态资源与运行时不依赖网络分发（无 CDN / 远程脚本 / 远程字体）」——括号段逐字、前半为改写，「原文」标签下混装改写语。 |
| 推理声明带规则依据 + source: inferred（0-50） | 48 | 两个必察项处置均带 required_outcomes 规则依据与 source: inferred ✓。扣 2：Invariant 2 标注形态为混合体（「cited sources 未明文，source: inferred」）——按 rubric 分类学，无源且非规则触发的未知主张规范形态是 UNKNOWN；inferred 的规范依据是 required_outcomes 规则，而该条并非规则触发。诚实但形态不规范。 |
| 无未分类虚构声明（0-40） | 34 | 扣 6：Step 1「应用启动入口就位（开始菜单 / 桌面快捷方式，供 Step 2 行使）」为对安装产物行为的正向存在断言（特定 OS 位置就位），全部 cited sources（PRD/提案）均无安装器创建快捷方式的记载，且无 inferred/UNKNOWN 标注——属未分类声明。从轻计（-6 而非全额 -30）理由：它是冒烟门「启动」步的可执行化措辞（启动须有入口），非与源矛盾的行为捏造；处置方式 = 标注 inferred 或泛化为「任一启动入口」。全额规则口径下的替代读法已在 Deduction Rules 节声明。 |

### Dimension 5. Surface Fitness（Surface 适配）— **132 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| 必察派生 Outcome 在场（0-60） | 58 | validation-error 实步覆盖（Step 4b，含前置/动作/期望）+ session-expired N/A 论证（PRD 安全边界映射），均带规则依据与 source: inferred——"must be considered" 满足，无 0 分情形。扣 2：Step 4b 称「焦点保持 / 引导态保持等完整行为断言由兄弟 Journey session-workbench Step 2c 承载」，经核该步实际断言为「不发送——无消息上屏、无 agent 往返；空会话引导态保持，焦点仍在输入框」——仍未覆盖 surface-web validation-error 断言组中的「error message displayed near the relevant field」与「user can correct and retry」两条；委托链终点亦未承接完整断言形。 |
| 测试策略比例（web = 50/50）（0-50） | 42 | 期望粒度已可拆契约级断言（三区构成 / hero CTA / rail 入口清单 / dock 收起 / 输入聚焦回显 / 空提交拦截 / 离线零远程请求 / 启动超时口径），与旅程级 4 步链并存，比例接近均衡。仍偏薄：每步单 Outcome、边界步共 3 个，且 Step 1/2 部分期望划归审计通道后浏览器可断言素材进一步收窄。 |
| 环境与执行假设现实性（0-40） | 32 | Windows 安装 + 断网切换 + UI 走查组合现实；离线断言有观察通道（「观察通道 = 启动期网络请求记录」）；等待策略有口径（等待窗口 + Step 2c）。扣 8：安装形态下浏览器自动化/探针如何附着于已安装应用仍未声明（surface-web 的 Environment Readiness Checks——dev server / HTTP 200 / playwright——对安装形态全部失效；如 CDP/远程调试端口的附着方式），「网络请求记录」隐含一套从未说明的挂载工具——iteration-1 攻击点 13 仅部分解决。 |

无 -25 Surface type violation 适用（无 CLI 式断言混入）。

### Dimension 6. Internal Consistency（一致性）— **141 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| Invariant 逐步成立（0-60） | 54 | 无任何步骤违反两条不变量；Invariant 1 双通道行使（运行期 Step 2b / 产物侧 Step 1），Invariant 2 审计通道承载并标注。扣 6：不变量声明范围与观察通道不匹配——「加载与走查全程无远程资源请求……运行期观察由 Step 2b 行使」vs Step 2b「观察通道 = 启动期网络请求记录」：通道只覆盖启动期，走查期（UI 交互中惰性拉取的远程字体/脚本——恰是 SC-NFR「加载与 UI 走查无远程资源请求」的 UI 走查半段）与在线happy path 全程均无观察安排。 |
| 跨步引用一致（0-50） | 50 | Step 2→2c、Step 1→2b、Step 4b→Step 4、Step 4b→session-workbench Step 2c、Step 4→session-workbench Step 2 + knowledge-recall-flywheel、Step 4b→Derived Outcomes、Invariant→Step 1/2b：全部解析且语义准确（兄弟 journey 原文已核）。 |
| 风险级别与内容一致（0-40） | 37 | Medium 与内容匹配（可逆、无数据丢失、多步交互），与兄弟旅程分级惯例一致（session-workbench=Medium，注册类=High）。扣 3：文档自带注释定义 High = "Workflow involves state mutation, data loss risk, or irreversible operations"，而行内论证自认「安装 = 机器状态变更」——字面上满足 High 第一子句；归中档依赖注释未写明的判断（可逆/无损失不算危险变更）。宜在论证中补一句对 High 子句的排除理由或修注释措辞。 |

无 -40 Invariant violation 适用。

### Dimension 7. Workflow Coverage（工作流覆盖度）— **133 / 150**（下限 90 ✓）

| 子项 | 得分 | 理由 |
|---|---|---|
| Golden Path 存在（veto, 0-60） | 58 | **Veto 未触发**：Happy Path 4 步连续、领域级（安装/启动/等待首屏/点新会话），语义上与 SC-MVP 后半「（安装 → 启动 → 主界面可达 → 会话面板可用）」逐字对应——已对照 prd-spec Goals 与提案原文验证。frontmatter golden_path: false 合特性级惯例（仅 knowledge-recall-flywheel 标 true），非矛盾。扣 2：Step 2 自身正向断言薄（「主窗口打开并完成装载进入首屏」之外主要靠负向观察「无报错弹窗、无白屏停留」），首屏具体性全靠 Step 3 承接。 |
| 多步覆盖深度（0-50） | 38 | 边界步三枚（离线启动 / 启动失败口径 / 空提交拦截）+ 显式移交（真实往返 → 兄弟旅程）+ 显式越界记账（M8）。对冒烟类为合理深度。扣 12：无二次启动/重启探针——Step 4「中区切换为会话视图并新建会话」写入的实体（会话、首启初始化状态）从未在重启后复验，而安装类缺陷的经典暴露位恰在第二次启动；亦无 卸载/清理 置置。二者可记账豁免，但现状既无覆盖也无记账。 |
| 对 PRD 范围的完整度（0-40） | 37 | 自界范围内 PRD/提案要点齐备（4 步门 + SC-NFR 离线断言 + 产物来源分层声明 + 覆盖安装/升级 M8 记账——iteration-1 两项缺口均已补）。扣 3：范围记账行「覆盖安装 / 升级 / 残留数据处置归 M8」未含 卸载/残留清理 的处置——安装类 QA 的收尾面（测试机回归初始态）无去向说明。 |

### 跨维度一致性检查

- 快捷方式断言：D4 计「无源未分类」（分类学失败），D1 计「二者关系未定」（结果精度失败）——同一引文、两种正交判据，各计一次，成立。
- Step 2c 三模式并写：仅 D3 计（选择唯一性）；其可检出性正面价值已在 D1 子项 3 承认，不重复计罚。
- 观察窗口窄于不变量：仅 D6 计（不变量行使完整性）；不另入 blindspot（rubric 内有归属）。
- 附着机制缺失：仅 D5 计（surface 环境假设）；其在 Phase 1 的可执行性影响不再计分。
- 重启探针缺失：仅 D7 计（覆盖深度）；不入 blindspot（rubric 内有归属）。

## 4. Phase 3 — Blindspot Hunt（rubric 之外的 QA 失败模式）

1. **[blindspot] 脏机器前置无核对/复位机制** — 引用：「目标机器无既有安装（全新安装路径）」。可重复执行的安装类门禁必须回答：跑前如何检出并清除既有安装（注册表残留 / 开始菜单项 / 用户数据目录）？跑后如何 teardown？前置只声明不核对时，脏机器上旅程静默失效或误报（本仓自身就有「单实例锁致整片 e2e 失败」的同类教训）。须补机器状态核对/复位口径，或显式声明由门禁编排层承载。
2. **[blindspot] Step 4b 存在空转通过（vacuous pass）风险** — 引用：「**User Action**: 直接点发送」「**Expected Result**: 不发送——无消息上屏、无 agent 往返（冒烟最小口径）」。若产品实现为空输入时发送按钮禁用（聊天输入的常见设计，PRD 未定义该行为），点击禁用按钮是 no-op，断言照样通过——测试无法区分「拦截生效」与「按钮本就不可点」，保障力弱于表面。宜加一句对两种合法设计（禁用/拦截）的显式兼容声明，或以「发送入口在空输入下的可达状态」作为附加观察。
3. **[blindspot] 提案 MVP 门走查的读法歧义未记账** — 引用：「提案 Key Scenario『MVP 门走查』、SC-MVP 后半（安装包构建并启动冒烟通过）」。提案该条原文为「上述全链在安装包形态下启动冒烟通过」——字面可读作「六步飞轮全链须在安装形态下走」，而旅程按 PRD Goals 的两项拆分（演示与安装冒烟各自独立）取窄读法。PRD 拆分是正当的 requirements 层裁决，但旅程引用提案条目时未加一行记账说明窄读法依据，下游 gate 执行者对「安装形态下要不要跑全链」可能产生分歧。须补一句读法记账（PRD Goals 两项拆分为准）。

## 5. Deduction Rules 应用汇总

| 规则 | 应用 |
|---|---|
| Missing required field/section → 维度 0 分 | 不适用（结构完整：frontmatter / Overview / Setup / Happy Path / Edge Cases / Derived Outcomes / Invariants 全在场） |
| Hallucinated unclassified claim −30/条 | Step 1 快捷方式存在断言 1 条边缘情形：D4 子项 3 内折算 -6（理由见该行）；若 reviser 认定应按全额 -30，则 D4 = 116，仍高于下限 90，总分 = 1048，仍 ≥ 975——判定不变 |
| Surface type violation −25/条 | 不适用 |
| Invariant violation −40/条 | 不适用（无步骤违反不变量） |
| Precondition overlap −20/对 | 不适用（无同 Step 重叠对；Step 2c 模式并写按「不足以唯一定选」计 D3 子项 2） |
| Golden Path veto | **未触发**（金路存在且语义对应 SC-MVP 后半，已对照原文） |
| 金路步骤 API 级描述 −15/步 | 不适用（步骤为领域级用户操作） |

## 6. Final Summary

```
SCORE: 1072/1150
DIMENSIONS:
  Completeness: 194/200
  Semantic Purity: 188/200
  Precondition Exclusivity: 144/150
  Fact Alignment: 140/150
  Surface Fitness: 132/150
  Internal Consistency: 141/150
  Workflow Coverage: 133/150
```

**判定：PASS**（总分 1072 ≥ 975；全部维度高于下限：194≥120 / 188≥120 / 144≥90 / 140≥90 / 132≥90 / 141≥90 / 133≥90）。iteration-1 的致命项（Surface Fitness 54 < 90）已解除：必察派生 Outcome 齐备且带完整推理纪律；Step 3/3b 矛盾、Step 4 可执行性、Invariant 2 分类、启动失败覆盖、M8 记账、跨旅程归属全部核销。

**遗留修复优先级（面向 reviser，均为小项）**：
1. 【建议】Step 1「开始菜单 / 桌面快捷方式」：补 source 标注（inferred/UNKNOWN）或泛化为「任一启动入口」，并消解任一/皆须歧义。
2. 【建议】Step 2c：以「首屏未在等待窗口内呈现」为唯检出口径，或将「可见失败呈现」按故障模式分写（白屏 ≠ OS 级退出/崩溃框）。
3. 【建议】Invariant 1 观察通道从「启动期网络请求记录」扩至走查全程会话的请求记录。
4. 【建议】声明安装形态下自动化/探针的附着方式（或记账给测试编排层）；补脏机器核对/teardown、二次启动探针与 卸载/清理 的记账；Step 4b 补两种合法设计兼容声明；提案 MVP 门走查窄读法补一行记账。
