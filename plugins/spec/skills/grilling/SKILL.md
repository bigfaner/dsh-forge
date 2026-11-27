---
name: grilling
description: 就用户的计划、决策或想法持续追问到底，直至达成共享理解，并沉淀为 Spec 文档与 create_spec 记录行注册进 spec 域。何时用：用户想检验自己的想法、使用「grill」类触发语、或提出新想法需要成 Spec 时。
---

# Grilling（Spec 共识探索）

职责界线 = 事实与决策的界线：技术要点（触点、复用、对齐、量级）是事实，探索代码库作答；选型与取舍是决策，问用户。

<HARD-GATE> 禁止写代码或执行任何实现动作——本技能只产出 Spec 文档及其 spec 域记录行。 </HARD-GATE>

<HARD-RULE> **事实自己查，决策才问人。** 凡能从环境（代码库/工具/文档）查到的是事实——自己去查，不问用户；凡取舍（方案取舍、接受红旗、档位取舍）是决策——必问用户，不沉默假设。 </HARD-RULE>

## 流程

```
建设计树 → 分轮访谈 → 终局确认 → 成文（Spec 文档 + Goals/AC） → 一致性检查 → 用户批准 → 注册
```

### Step 1：建设计树

检索代码库相关特性、文档、Spec 与近期历史，把问题组织成设计树：每个决策节点挂着依赖它的子决策。树根 = 根本需求界定（「我理解的需求是 X；备选 Y、Z」）；根未裁决树不往下长。

**档位分叉判据（建树时点即判，成文前必答）**：单次成文能否承载全部验收？——能（验收判据一批发得下）= 单 Spec 档，照常走完全流程；**≥2 批注册物**（验收需拆两批以上 Spec 承载）= 走大需求档（见「大需求档共识流」）：拆 Milestone 逐批挂 Spec，不硬塞单 Spec。分叉是决策——拿不准即问用户裁决。

### Step 2：分轮访谈

**每轮只问当下就能问的问题**：前置决策已定、不依赖本轮其他未决问题的，才进本轮。每轮经 `ask_user_question` 一次打包发出：

- 每题编号（Q1/Q2/…）、推荐答案置首；措辞让「是」即接受推荐。
- 依赖本轮仍未决问题的，留到下一轮。
- 用户答完一轮即更新设计树：已决节点解锁其下游问题；推翻早前假设则回溯重决。

**事实查证不阻塞提问**：问题需要环境事实时派子代理去查，查证期间只有它的下游问题等待，其余照问。典型事实（结论落 Spec 文档「改动范围」段）：

- 触点细化到 **file 粒度**——预期要动的文件路径清单，拿不到不成文。
- 复用核销——先核销官方同语义机械（工作区 AGENTS 约定）；「官方没有」以读懂为前提。
- UI/DB 对齐门——触及 UI 或 DB 变更面，对齐结论落 Spec 文档后才成文。
- **官方核销结论**——触及外部/官方机械装配面时，核销结论（源码位置、声明方式、生命周期、并发/持久化语义）作为事实落「改动范围」段；纯逻辑/纯文档 Spec 不要求。
- **真机取证方式**——交付物含运行期装配面（进程、网络端点、真实调度/时钟、对外部系统/硬件的真实副作用）时，取证方式与环境作为事实先行核实落档；纯逻辑 Spec 不要求。
- **方案不确定面识别**（成文时识别）：识别高不确定面——对接外部系统、引入第三方库级的方案级假设（装载通道、注册时序、宿主形态、未核销承重假设）；成熟且通用的第三方库豁免。核实前先 `knowledge_search` 检索同主题既有结论——命中即复用（引用条目 id），不重复核实。核实结论（含探针目录 `project.probes_dir` 下的取证引用）落 Spec 文档方可成文。
- 可行性红旗（改动面超量级 / 需自建机制 / 外部依赖取证成本高）——事实呈现后转为决策，用户裁决是否继续。

**Need Gate**：深入任何特性细节前按序检查——有更简单的替代？真实需求是什么？为什么是现在？用户否决则记 `Challenge Override`，不再纠缠。

### Step 3：终局确认

终止 = 没有遗留可问的问题：全分支裁决完毕，零沉默假设——未问出口的问题不得默认成立，未呈出的备选不得默认排除。逐条复述问答供用户审核，末尾必附「有没有我该问而没问的？」；更正即回溯重决。确认前不进成文。

### Step 4：成文（Spec 文档 + Goals/AC）

Spec 文档落 `.forge/specs/{slug}/spec.md`（目录布局见 forge:pipeline 系统提示段「文档位置/目录树」），章节随 Spec 文档契约：

1. **用户旅程**——根本需求界定 + 意图推断（new-feature / enhancement / refactor / cleanup / fix / doc）给出推理过程，用户可否决。
2. **方案**——目标形态，不留调整修复叙事；关键术语随首次出现以定义句固化。
3. **改动范围**——事实结论：**file 粒度触点清单 + 复用核销结论**。
4. **tiers 交付档位**——封闭四值多选 `ui | api | pure-logic | docs`（ui = 原型走查+E2E；api = 契约文档+集成测试；pure-logic = 单测基座；docs = 零测试）；取舍是决策，随访谈裁决。
5. **Goals/AC 全集**——Goal 划分交付目标，每个 Goal 挂达成标准（AC 判据文本；判据 = 后续投影对齐键，逐字精确，可被任务验收逐字承接）。

**一致性检查（批准前强制）**：每条 AC 都有纳入项满足、每个纳入项都服务于某条 AC、AC 两两不矛盾；冲突先解决再继续。

不自动提交；呈现 Spec 文档与 Goals/AC 全集，等待用户明确批准。

### Step 5：注册 Spec

```
create_spec({ slug: "<slug>", title: "<title>",
              tiers: ["ui", "api"],
              goals: [{ title: "<goal>", acs: ["<criterion>", ...] }],
              doc_path: ".forge/specs/<slug>/spec.md",
              doc_content: "<Spec 文档全文>" })
```

（goals 全集单次落库，禁散调补写；Spec 出生即 draft，送审与接受走状态流转由用户动作驱动。）

## 大需求档共识流（≥2 批注册物走此档）

单次成文无法承载全部验收的大需求：共识达成后不走单 Spec 注册——**拆 Milestone 逐批挂 Spec，经管理面动词持久化**：

1. 共识落档：`create_roadmap` 注册 Roadmap（产品级目标 + 产品级 AC 清单 ac_json）；
2. 拆批：逐批 `create_milestone`（序由服务层赋，出参 `milestone_id` 寻址；每 Milestone 挂模块级 AC，条目 `addresses` 指回产品级 AC id）；
3. 逐批挂 Spec：每批走既有流程单次成文一个 Spec，`create_spec` 时以可选 `milestone_id` 挂链——本批验收由该 Spec 承载；
4. 批间修订与排序：条目修订 `update_roadmap` / `update_milestone`；优先级调整 `move_milestone`（before/after 锚点互斥二选一）；
5. 里程查询：`query_roadmap`（include=`achievement`）达成聚合派生——查询期现算，零人工勾对。

（每批 Spec 仍各走既有评审/流转/终审全程；Milestone 达成 = 挂链 specs 全 completed 聚合派生，人工确认走 `transition_milestone` / `transition_roadmap`。）

## 注册动词 token 快照（spec 域 22 动词——机检对读锚）

> 薄封装纪律：每动词 = 服务域零域逻辑薄封装；本清单与 `FORGE_SPEC_TOOL_NAMES` 注册序单源对读
> （机检 tests/structure/tool-token-snapshot.test.ts——双向集合相等）。入参纪律：工具面零
> projectKey（服务层 cwd 派生）/ 零 actor（对话 tool 径 = plugin-tool 注入）；
> milestone 寻径 = roadmap_slug + milestone_id；goal 寻径 = slug + goal_seq。

```
create_spec / update_spec / replace_spec_goals / transition_spec / query_spec / list_specs
create_roadmap / update_roadmap / transition_roadmap / query_roadmap / list_roadmaps
create_milestone / update_milestone / move_milestone / transition_milestone / query_milestone / list_milestones
accept_spec
finalize_goal
review_goal / review_objective
spec_stats
```

### 工具面消费要点

- **Roadmap/Milestone 拆解（grilling 收尾大需求档）**：`create_roadmap` 共识落档 → 逐批
  `create_milestone`（seq 服务层赋序，后续操作以出参 `milestone_id` 寻址）；条目修订
  `update_roadmap` / `update_milestone`；优先级调整 `move_milestone`（before/after 锚点
  互斥二选一）。
- **查询**：`query_roadmap`（include=`achievement` 达成派生）、`query_milestone`
  （include=`specs` / `achievement`）、`query_spec`（include=`goals` / `acProjection` /
  `latestReviews` / `transitions`——封闭枚举，未知值拒）；清单 `list_roadmaps` /
  `list_milestones` / `list_specs`；里程诊断 `spec_stats`。
- **状态流转（human-only 边仅用户明示）**：`transition_spec` / `transition_roadmap` /
  `transition_milestone`——`awaiting_acceptance → completed` 为 human-only 边，仅用户
  明示验收时调用；退回边 note 必填。`accept_spec`（decision=`completed|return`）为 spec
  验收确认/退回 human-only 动词；approved → in_progress 为机械段，零工具。
- **终审（human-only）**：`finalize_goal`（decision=`completed|rejected`，rejected note
  必填）——agent 会话禁止自动终审。
- **复核 agent 专用**：`review_goal`（verdict=`passed|failed`，failed 时 gap_note 必填，
  报告驱动状态机）与 `review_objective`（milestone/roadmap 验收预检报告，passed 不改
  状态——人类经 transition_* 完成）；人类零填写复核报告。
