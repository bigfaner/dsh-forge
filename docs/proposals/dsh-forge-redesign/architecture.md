---
created: "2026-10-02"
author: "faner"
status: "Accepted"
intent: "architecture-baseline"
---

<!-- 本文档 = 总纲（proposal.md）的技术配套：把 §产品形态 原则落实为模块/包能力边界与演进纪律。宪法级原则以总纲为准；本文边界划分随各阶段设计细化，调整记录于文末版本历史。2026-10-02 可读性梳理（内容不变，语句重写）。 -->

# dsh-forge 架构基线 —— 模块与包的能力边界

## 0. 指导原则（总纲 §产品形态 的落实）

1. **为 forge 而建**：有且只有一个场景。数据模型、API、UI 直接表达 forge 语义，零场景中立抽象。
2. **边界干净**：单向依赖、单一写入路径、独立可测。
3. **切分即管理**：工件划分 = 代码管理与迭代节奏，不承载运行时可替换承诺。
4. **基础能力迭代沉淀**：证据驱动提炼；未来新产品 = 在沉淀的基础能力上快速搭建（届时另立提案）。
5. **可机械验证优先**（2026-10-02 增补）：纪律优先落为 lint / 测试 / CI / 类型约束；落不成的才靠人工评审，且必须显式列入评审清单——禁止只活在 prose 里。

**设计评审问句**（替代已退役的「换场景包还成立吗」）：**forge 需要吗？边界干净吗？能机械验证吗？**任何以「未来新产品/新场景」为由的预先抽象，按定义为过度设计，当场砍。

## 1. 工件版图

> 命名为示意，P1 设计期定名；工件拆并 = 代码管理操作（记入文末版本历史），能力边界变更随阶段提案。物理分色**尽早**落地（import 规则的 enforcement 载体），不以「后期再拆」推迟——AI 协作时代其维护成本近乎零（见 §2）。

| 工件 | 能力边界（做什么） | 不做什么 | 迭代节奏 |
|---|---|---|---|
| `host/` 薄宿主 | 进程入口、profile 加载、boot manifest 组装（官方 ui-\* 选型 + 产品自有 client 插件注入）、`{url, injections}` IPC | 一切业务语义 | 随上游锁定版 |
| `web/` 三区工作台 | 自有 vite 入口 + `dsh-client-web` 壳内核；左栏导航 rail（品牌行/新会话/知识库入口/项目树+会话列表）；中区一等公民视图互换（会话面板：对话/轨迹/知识召回 ⇄ 知识库面板：浏览/统计分析/召回日志）；右栏 dock 页签容器（页签跟随所属项目）；任务三视图（列表/DAG/泳道，feature 绑定）；`--dsw-*` 令牌纪律 | 状态/知识的写逻辑（只调 API） | 产品主线 |
| `state-layer/` forge 状态层 | features/tasks/proposals 存储 + 动词 API（claim/submit/…）+ 转移校验 + 依赖终态守卫 + append-only 执行记录 + 任务↔会话挂接表 | UI、技能、文档路径语义（docPath 为不透明字段）、dsh 会话账本（实时读，不复制） | 产品主线 |
| `knowledge/` 知识链路 | 知识目录解析、frontmatter 契约校验、索引（可重建缓存）、动态置信度（四信号读取时计算）、召回能力面（域过滤+关键词+阈值+理由+使用事件）、审核与合并队列、晋升流 | 会话编排、知识注入决策（agent 自行决定）、代码仓与文档位置写入 | 产品主线（P2 重头） |
| `plugin-knowledge/` 知识插件 | dsh tool：召回四动词 + 写入 tool（契约校验，与 UI 管理面同后端）；系统提示词知识段组装 | 管线/SDD 任何语义 | 随产品交付 |
| `plugin-forge/` forge 管线核心插件 | 双模式共用技能（quick-tasks / run-tasks / fix 链 / submit-task / git 纪律 / run-tests / consolidate-specs）+ 命令 tool（消费 state-layer API） | 状态存储（只消费） | 独立工件、独立发版 |
| `plugin-forge-spec/` forge 规格深化插件 | 仅远征组合的规格技能（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / eval 幸存者） | 状态存储（只消费）；突击会话不在组合内（物理边界，见《技术预研笔记》§5） | 独立工件、独立发版 |
| `plugin-brainstorm/` brainstorm 技能工件 | 结构化探索技能（产出 proposal）；远征/突击经 customSkillDirs 接入，标准模式经默认技能根全局通道（宿主环境变量）共享 | 一切后端依赖（零耦合：不依赖 state-layer / knowledge——沉淀判据双命中，见《技术预研笔记》§5.5） | 独立工件、独立发版 |
| profile 出厂双预设 | **forge 模式的物理形态**：远征模式（`expedition`，出厂默认 = plugin-brainstorm + plugin-forge + plugin-forge-spec + plugin-knowledge + 远征 persona + skill-filesystem 行）；突击模式（`blitz` = plugin-brainstorm + plugin-forge + plugin-knowledge + 突击 persona + skill-filesystem 行）。经 profile patch 安装（`cordis.patch.yml` 同机制）。**persona 只谈作风，不谈角色与工具禁令**——组合继承下 executor 继承模式作风，其角色规格仍唯一来自派发前合成的 dispatch prompt（见《技术预研笔记》§2/§5） | 会话编排（预设是环境配置，产品只看不管）；干预用户自定义预设 | 随产品交付 |

**依赖方向（单向）**：`web` →（能力面 RPC）→ `state-layer` / `knowledge`；`plugin-forge(-spec)` → `state-layer`；`plugin-knowledge` → `knowledge`；`host` 组装一切但不含业务。不存在反向 import；`state-layer` / `knowledge` 不 import UI 与插件；**`knowledge` 不依赖 `state-layer`**（头号沉淀候选的场景隔离禁令）。

**单一写入路径**：状态写只经 `state-layer` 服务（UI 动作与 forge tool 同门）；知识写只经知识能力面（UI 管理面与知识插件 tool 同门）。数据库无第二写者。

**库消费基座**：markdown 正文渲染复用官方 `ui-primitives`（`MarkdownText` 族，静态 ESM 库消费——不可信 GFM + TeX、流式增量、文件链接行号跳转；机制与消费契约见《技术预研笔记》§1.6），不自建渲染器；与 ui-theme 令牌同属库性质消费通道。

**插件化的真实动机**：其一，dsh tool 须以插件形态注册（机械要求）；其二，技能线与产品壳迭代节奏不同（管理便利）。非可替换机制——两个插件均无 client 半身，全部 UI 在 `web/`。

## 2. AI 协作防腐机制

> 公理（2026-10-02 定向）：AI coding 时代 code is cheap——代码可廉价重生成，**昂贵且复利的是约束与意图的丢失**（「越写越腐化」）。防腐 = 把约束从 prose 变成机器资产；瓶颈从「写」移到「审与断」，架构的职责是让审断可机械化。护栏：code is cheap ≠ 抽象免费——错误抽象误导 agent 高速奔跑，预设通用性仍是过度设计。

**要防的 agent 腐化形态**：隐式跨界（import 禁区 / 绕过单一写入路径直写 DB / UI 里补业务逻辑）；平行实现（复制既有能力改一份）；prose 约定侵蚀（裸色值、绕能力面——第三个会话后无人察觉）；schema/接口漂移（无迁移、私扩字段）；死代码与影子路径累积。

**五层防线（每层都必须可机械验证）**：

| 层 | 机制 | 对抗的腐化 |
|---|---|---|
| L1 硬边界 | 物理工件 + import 规则（dependency-cruiser / eslint no-restricted-paths / TS project references）；sqlite 句柄仅 `state-layer` 可持有 | 隐式跨界——越界即编译/lint 红，agent 无法「悄悄」做 |
| L2 类型契约 | 跨边界 API 全类型化 + contract tests；DB schema 版本表 + 迁移函数 | 接口/schema 漂移——编译器当防腐官 |
| L3 机械断言池 | 无投影审计（禁 watch/回流模块）、CSS 令牌 lint（禁裸色值/字号）、依赖规则、上游契约面回归（slot 洞名 / boot manifest 形状）——CI 常驻 + 阶段回归 | 约定侵蚀——断言红灯，而非评审意见 |
| L4 流程方向盘 | SDD 管线本身（设计先行、小步任务、执行记录）；阶段设计评审固定过沉淀候选清单与断言池 | 平行实现、大爆炸改动——agent 的方向盘是设计文档，不是自由发挥 |
| L5 知识闭环 | 架构决策与教训入知识库 → 后续会话召回；腐化被纠正时沉淀 lesson | 同类腐化复发——防腐资产的复利形态 |

## 3. 状态层边界细则（P1 设计的输入）

- **表**：`features` / `tasks`（七态 CHECK）/ `task_edges`（blockers，写入时无环校验）/ `task_records`（append-only）/ `proposals` / `task_session_links`（应用侧挂接记录，会话账本本体归 dsh）；SQLite 部署于应用 profile，按 `workspace_id` 外键域。
- **状态机** = 代码内一份具体常量（task 七态、proposal 四态、feature manifest 态）+ 动词函数（`taskAdd / taskClaim / taskSubmit / taskTransition / taskQuery…`）；校验（from 匹配、依赖终态、record/reason 必带）全在服务内。
- **机制不变量**：键唯一（`<feature>/<localId>`）、blockers 无环、记录 append-only、每次写自动审计。
- **对齐总纲**：SC2（无投影、状态直读）、SC7（tool 消费本 API 写入，产品只看不管）。

## 4. 基础能力沉淀机制

- **提炼判据（满足其一）**：① 出现第二个真实消费方；② 能力输入输出已全契约化且与 forge 语义零耦合。
- **提炼动作**：轻量提炼案（随阶段提案或独立小提案）→ 从 forge 实现中抽包（不改行为）→ 消费方改依赖；**数据不动**。
- **候选观察清单（观察，非计划）**：知识链路、薄宿主、会话面板接入层、令牌化 UI 基座。
- 总纲 P5「新产品」锚点的前置 = 本机制积累的提炼程度。

## 5. 演进纪律与版本管理

### 5.1 上游追踪与升级节奏

发布形态核实见《技术预研笔记》§1.5：上游无 git tag、无 CHANGELOG，workspace 锁步发布，活跃线挂 npm `next` dist-tag。

- 依赖声明一律**精确 pin** + `pnpm-lock.yaml` 入库（产品是应用不是库，可复现构建优先；禁 semver range 与 dist-tag 通配）。
- 升级 = **节奏化显式任务**，不做被动跟随：每阶段收尾设一个升级窗口，时间兜底每 2–4 周一次；跨大版本升级（契约面大改）走阶段提案，不挤升级窗口。
- 发现：比对 `next` dist-tag 与当前 pin；同步本地源码仓（唯一权威参考）。
- 差异阅读：`git log` 按 §6 契约面清单过滤——上游无 CHANGELOG，**diff 即 changelog**；diff 上游 `docs/`（随代码再生成，如 `capability-seams.md`）= 能力面变化总览。
- **功能雷达**：升级窗口兼作新能力评估入口，按评审三问过滤（forge 需要吗？边界干净吗？能机械验证吗？），不自动接入——0.2.0 的 agent-presets 即经评估后进入预设迁移设计（《技术预研笔记》§5）。

### 5.2 升级测试门（充分测试方可采用）

升级一律走**升级分支**（`chore/upgrade-dsh-<version>`），主干零 bump；四道门全绿方可合并：

| 门 | 内容 | 载体 |
|---|---|---|
| G0 编译门 | 类型编译 + lint 全绿 | L1/L2 断言（最快失败） |
| G1 契约面回归 | §6 契约面清单逐项 pin 测试（boot manifest / slot 洞名 / workspace registry / preset 行格式 / subagent 请求面 / 组合继承） | L3 机械断言池（CI 常驻） |
| G2 功能回归 | 产品 e2e：会话主链路（SC6）、状态直读（SC2）；P2 起加知识链路（SC5/9/10/11） | SC 关联用例 |
| G3 冒烟窗口 | 日常真实管线在升级分支上 dogfood 数日，无阻断性缺陷 | 人工使用 + 缺陷记录 |

合并时记账：升级记录（版本、diff 摘要、适配点、新能力评估结论、**测试盲区**——已知未覆盖面显式列出）入 CHANGELOG。

**回滚**：pin 回退 + lockfile 恢复即可（升级不迁移数据，回滚无数据动作）；schema 迁移单向向前，由既有断言兜底（「知识索引重建失败不阻塞旧版运行」）。

### 5.3 产品自身版本与发布

- semver：0.x 阶段（P1–P3）minor = 阶段里程碑、patch = 修复；1.0 = P4 产品级完成度。版本号唯一来源 = 应用 `package.json`，发布打 git tag（产品不重蹈上游无 tag 覆辙）。
- **产品 CHANGELOG 必备**（吸取上游无 CHANGELOG 的教训）：每次升级与发布各记一条。
- 发布门 = G0–G2 同一测试池 + 三平台安装包启动冒烟（继承 M1 打包/CI 资产模式）。未过门不发布，与升级采用同一套纪律。
- vendored desktop-host（fallback 线）冻结不升级；去 vendor 主线落地后移除。

### 5.4 数据版本（schema）

状态层 schema 版本表 + 迁移函数惯例（§6 既有）为数据侧唯一机制；应用版本与 schema 版本解耦。迁移单向向前：**旧应用打开新 schema 数据明确不支持**（版本表拒绝 + 提示升级），避免静默损坏。

---

- 能力边界变更随阶段提案；工件拆并记入下方版本历史。
- 本文与总纲冲突时，以总纲为准。

## 6. 已知边界与工程配套（2026-10-02 对抗式审核处置）

> 五位倾向互异的架构专家对抗审核后的落账：无方向性翻案，以下为记账与配套。

- **单机单活跃分支**为状态层显式假设：分支切换后文档引用（`descPath` / `manifest_path`）允许悬空，UI 只读缺省渲染并标注——P3 设计断言；多机同步明确划出 v1 边界外。
- **知识资产备份/迁移**入 P4 范围（总纲同步）：两库路径可配置（允许指向用户自选同步/备份位置）+ 状态库导出/导入。
- **上游契约面清单**为 P1 设计产物：boot manifest 注入格式、slot 洞名、workspace registry API、`__DSH_TRANSPORT__` carrier、ui-\* props、**agent-preset-registry 行格式（含 persona 行模板）、tool-subagent 请求面（agentOptions / toolFilter——无超时与子代预设覆写，已核实负结论）、subagent 组合继承语义**——逐项 pin 版本 + 适配测试。机制核实记录见《技术预研笔记》（`tech-research.md`）。
- **schema 版本表 + 迁移函数惯例**入状态层设计；断言「知识索引重建失败不阻塞旧版运行」。
- **四信号分期点亮**为 P2 排序依据：审核 + 使用计数先行，agent 反馈信号随知识插件到位。
- **沉淀候选清单**随每次阶段设计评审固定过一遍（不靠自觉开提炼案）。

## 版本历史

- 2026-10-02：原型基线同步——`web/` 工件行按重构原型更新（左栏导航 rail、中区一等公民视图互换（会话 ⇄ 知识库三页签）、右栏 dock 页签跟随项目、任务三视图列表/DAG/泳道 feature 绑定）；路线调整见总纲版本历史。
- 2026-10-02：§5 扩为「演进纪律与版本管理」四子节——5.1 上游追踪与升级节奏（精确 pin + lockfile 入库、节奏化升级窗口、diff 即 changelog、功能雷达三问过滤）；5.2 升级测试门（升级分支零主干 bump；G0 编译 / G1 契约面回归 / G2 功能回归 / G3 冒烟 dogfood 四道门全绿方可合并；测试盲区显式记账；回滚 = pin 回退 + lockfile 恢复）；5.3 产品 semver + git tag + CHANGELOG 必备 + 发布门同池；5.4 schema 前向单向、旧应用打开新 schema 明确拒绝。发布形态依据 = 《技术预研笔记》§1.5。
- 2026-10-02：可读性梳理（内容不变，语句重写；工件版图行内措辞微调，如 brainstorm「产出 proposal」）。
- 2026-10-02：brainstorm 三模式共享落实——工件版图新增 `plugin-brainstorm/`（沉淀判据双命中：第三类消费者「标准模式」+ 零耦合）；出厂双预设组合更新（含 skill-filesystem 行；标准模式经默认技能根全局通道零 patch 共享，宿主环境变量注入）。技能绑定机制补入《技术预研笔记》§1.2（技能不随插件自动注册，customSkillDirs + 默认根 + rank 决胜）。
- 2026-10-02：轻装模式更名突击模式（`light` → `blitz`）；预设机制「原理与实现」补入《技术预研笔记》§1.2（含 `select` blank-session 平台锁——「一会话一模式」由机制强制，与出厂双预设设计闭环）。
- 2026-10-02：模式预设迁移落实（详见《技术预研笔记》§5）——forge 插件切 `plugin-forge`（管线核心，双模式共用）/ `plugin-forge-spec`（规格深化，仅远征）两工件；profile 出厂预设 → 出厂双预设：远征模式（`expedition`，默认）/ 轻装模式（`light`）；persona 铁律「只谈作风，不谈角色与工具禁令」写入工件版图（组合继承下 executor 继承作风、角色规格仍 = dispatch prompt）。
- 2026-10-02：预研落实——工件版图补 profile 出厂预设（agent-preset + persona 组合 = forge 模式物理形态）；契约面清单补 preset / persona / subagent 面（含两项负结论）；task-executor 迁移方案 v2 与 spike 清单另立《技术预研笔记》（`tech-research.md`）。分工纪律：原型/UI 线归用户，产品线侧只做架构设计与技术预研。
- 2026-10-02：对抗式审核落实——新增 §2 AI 协作防腐机制（公理 + 腐化形态 + 五层防线）与 §6 已知边界与工程配套；原则 5「可机械验证优先」；评审问句升三问；依赖方向补 `knowledge` ↛ `state-layer` 禁令；工件物理分色定为尽早。
- 2026-10-02：初版。随总纲「产品形态」修订（场景包两层模型退役）建立；状态层细则出自 forge 具体设计（具体表结构 + 状态机常量 + 动词 API）。
