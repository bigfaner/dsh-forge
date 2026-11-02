---
name: breakdown-tasks
description: 把定稿的技术设计拆解为可执行任务图（经 addTask）——分阶段业务任务带依赖、逐阶段摘要与 gate 任务、旅程/契约先行任务与脚本后置 + test-run 收口的测试链，最后经 validateFeatureTasks 校验容器。
---

# 目标拆解（breakdown-tasks）

把技术设计拆解为可执行任务——每个任务 1-4 小时、依赖清晰、验收标准可客观核验——全程只经 `addTask` 工具作用于 feature 容器。任务活在状态层。

<HARD-RULE> 不得创建任务文件、`index.json`、阶段门文件或任何逐任务 markdown——那是旧的文件形态。每条任务、每条依赖、每个 gate 都是经 `addTask` 创建的状态层行。 </HARD-RULE>

## 目标导向拆解原则

**每个任务有且只有一个清晰、明确的目标。** 拆解时逐条自检：

- **一任务一目标**：任务标题能用一句"做完后 `<什么>` 成立"陈述；说不出单一目标（标题含多个动词、"顺手"、"以及"）即未拆到位，先拆再建。
- **目标可核验**：目标落在可客观核验的验收标准上，而不是"尽量""改善"之类的模糊方向——验收标准就是目标的物化形态。
- **目标属任务，不属阶段**：阶段是组织结构（并行分组、gate 边界），目标必须归属单条任务；禁止出现"本阶段完成 X 的一部分"这类无目标任务。
- **目标面向下游**：`task_desc` 写清该任务交付什么、下游谁消费它；不写"等待""配合"等无交付物表述。

## 前置条件

| 工件 | 缺失时 |
|---|---|
| `prd/prd-spec.md`（注册为 `prd-spec`） | 先跑 `write-prd` |
| `design/tech-design.md`（注册为 `tech-design`） | 先跑 `tech-design` |

此处不调 `registerFeature`——本技能作用于已存在的 feature 容器（两类显式链接边界——mode 设定后的 NULL-mode 提案、已接受的升级——由持有提案裁决的会话处理，不在拆解期处理）。

## 任务创建协议（addTask）

按依赖顺序创建任务——每次 `addTask` 返回自然键（`slug`/`local_id`）；捕获全部返回的 `local_id` 以便后续 `depends_on` 接线。所有调用携带容器对：

```
addTask { source_kind: "feature", source_slug: "<slug>", title: "...", type: "...",
          priority: "P0|P1|P2", estimated_time: "...", task_desc: "...",
          acceptance_criteria: ["...", "..."], depends_on: ["<prior local_id>"],
          vars: ["KEY=VALUE"], complexity: "low|medium|high", breaking: true|false }
```

- `title` = 动词先行的业务措辞；`task_desc` = 工作描述。
- `acceptance_criteria` = 可客观核验的清单项（提交时 AC 证据门逐项对照此清单——每项都必须可核验）。
- `depends_on` = 同容器前置任务的自然键 localId（仅同 feature 内的边）。
- 正文不写跨容器等待：`task_desc` / `acceptance_criteria` 绝不说"等另一个容器的任务落地"——管线看不见、守不住、也恢复不了这种等待（它退化为 worker 级阻塞加人工裁决）。若后续工作需要另一容器的更早交付物（同文件、分层产出），停下来交用户裁决：合并进同一容器，或排序派发（前一个落定后才注册依赖容器）。绝不创建等待型任务。
- 改共享接口/模型/契约（含增量式接口变更）时 `breaking: true`。
- `vars` 以 KEY=VALUE 条目承载结构化上下文（`SOURCE_FILES`、`TEST_SCRIPT`…）。
- 文件范围边界：触及多文件的任务在 `task_desc`/`vars` 里枚举确切路径——绝不"所有文件"。同一模式 >8 个文件时按文件组拆分；被拆任务加一条列明其文件的范围约束 var。

### 类型词表（封闭）

`type` 从 addTask 工具面的封闭词表精确取一（全量以工具注册面为准，本技能不复述）。判断规则：按**产出工件**分类、不按意图——可编译或可运行 → `coding-*`；仅不可编译产出（`.md`、`.yaml`、`.json`、`.sql`…）→ `doc` 族；`coding-fix` 仅 fix 链派生，禁止手工指派。

优先级：P0 核心机制或阻塞他人；P1 对应一条 PRD AC 或核心流程；P2 打磨。

## 工作流

1. **通读全部 feature 文档**——按可得性读 prd-spec、tech-design、用户故事、ui-functions、ui-design、ER 图、schema.sql。UI 文档贡献 UI 组件任务行；ER/schema 贡献一条 schema 任务；tech-design 的接口/数据模型/错误类型逐项映射为任务；PRD 流程 gate 映射为 gate 校验任务。
2. **PRD 覆盖核验**——读 tech-design 的 PRD Coverage Map（兜底：直接读用户故事 AC）。每条 AC 映射 ≥1 任务；有缺口即缺任务或设计有洞——创建前先解决。
3. **推导阶段与依赖**——阶段顺序编号（1.x、2.x…）；优先采用 PRD 声明的阶段结构，否则按依赖深度分组。同阶段 = 可并行（冲突除外）；跨阶段 = 依赖前一阶段的 gate。拆分规则按优先序：(1) 可独立核验的产出 → 各自成任务；(2) 多动词标题 → 按功能边界拆；(3) >8 个同模式文件 → 按文件组拆。纯文档特性（全部产出不可编译）跳过语言解析，全程用 `doc` 类型。
4. **逐阶段创建业务任务**（经 `addTask`，协议见上）。创建期复杂度：`low` = ≤3 条 AC 且无硬约束；`high` = ≥5 条 AC 或有硬约束；其余 `medium`。
5. **创建逐阶段摘要 + gate**——每阶段业务任务之后：一条 `doc-summary` 任务（依赖 =该阶段业务任务 localId），再一条 `gate` 任务（依赖 = 摘要的 localId）。gate 即阶段边界；下一阶段的首个任务依赖前一 gate。
6. **创建测试链**——涉运行期装配面的特性建链（**豁免正判据**：改动触及子进程 spawn / 网络通道 / 外部文件系统写径 / UI 装配面任一即建链，UI 装配面默认建链；纯逻辑/纯文档特性免建）。工作区测试策略文档在场则遵从其细则，缺席不破环——本技能正文自含判据，不硬编码任何仓内路径。
   - **旅程/契约先行任务**（与业务任务并行建卡，不设业务任务对它们的依赖边）：
     - 默认两任务：旅程叙事任务（type `test-gen-journeys`）→ 契约文档任务（type `test-gen-contracts`，`depends_on` 旅程任务）；产物落 `proposals/<slug>/testing/<旅程名>/`（journey.md + contracts/）。
     - 小体量可合 1（单旅程 ≤3 步且契约 ≤5 个 Outcome → 单个 `test-gen-journeys` 任务，旅程作者主笔契约节）；多旅程提案一旅程一任务，不做跨旅程杂烩。
     - 领取顺序：旅程/契约任务一律 P0 且建卡先于全部业务任务卡，业务任务默认 P1 起——串行派发下首个被领即旅程/契约，保证测试基准先于实现落盘。
     - **旅程/契约任务 AC 模板**——`acceptance_criteria` 含价值标准条目：
       1. 旅程针对明确行为：用户可见交互序列、状态变化与副作用，禁空洞叙事（「页面能打开」「功能正常」式）；
       2. 契约条目可判定：Preconditions/Input/Output/State/Side-effect/Invariants 均可验证，Outcome 穷举有意义分支（成功/失败/边界），禁恒真断言；
       3. 分层正当性：每条旅程答「为何值得一条 E2E、单元测试为何覆盖不了」；
       4. 演进友好：断言锚定稳定行为（交互序列/状态语义/副作用），不锁文案字面、DOM 层级与实现路径——重构不红；
       5. 宁少而精：服从回归时长预算，禁以数量堆砌安全感。
   - **脚本任务（后置执行）**：type `test-gen-scripts`，`depends_on` 该特性全部业务任务 + 旅程/契约任务——实现落盘后撰写：核实/回填契约锚值、以真实锚落 spec、每条断言标注来源契约条目 id（断言-契约溯源）；契约与实现不一致经 fix/disc 链上报，禁脚本内就地调和。
   - **test-run 收口**：type `test-run`，`depends_on` 脚本任务 + 全部业务任务；派发前自查依赖闭包覆盖全部 coding/旅程/契约/脚本任务，缺失即 blocked 附清单。
   - **review-doc**（`doc-review`）仍留最终 gate 之后，依赖最终阶段 gate。
   - 旅程/契约/脚本/收口以**任务类型 + 任务简报 + 专家路由**承载（旅程 = `test-journey-author`、契约 = `test-contract-author`），任务简报写明产物落点与断言-契约溯源要求。
7. **体量审计**——逐任务复查：多动词标题拆；AC 跨无关领域拆；守住操作上限；**每任务 ≤6 条验收标准**（更多 = 范围过大，继续拆）；任何 `task_desc` / AC 内零跨容器引用（确需外部排序就是合并或排序，不是等待任务）。
8. **校验容器**——`validateFeatureTasks { feature_slug: "<slug>" }`：每条上报违规都点名违规任务键；修到子图健康为止（只经工具面允许的任务状态转移——绝不直写）。

## 产出

呈报创建好的图：阶段结构、逐阶段任务数带自然键、gate 链、测试链（旅程/契约先行任务、脚本任务、test-run 收口）。可派发执行（run-tasks）按 DAG 就绪度消费任务池——此处无需再接线。
