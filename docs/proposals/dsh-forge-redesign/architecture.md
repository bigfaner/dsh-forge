---
created: "2026-10-02"
author: "faner"
status: "Accepted"
intent: "architecture-baseline"
---

<!-- 本文档 = 总纲（proposal.md）的技术配套：把 §产品形态 原则落实为模块/包能力边界与演进纪律。宪法级原则以总纲为准；本文边界划分随各阶段设计细化，调整记录于文末版本历史。 -->

# dsh-forge 架构基线 —— 模块与包的能力边界

## 0. 指导原则（总纲 §产品形态 的落实）

1. **为 forge 而建**：有且只有一个场景。数据模型、API、UI 直接表达 forge 语义，零场景中立抽象。
2. **边界干净**：单向依赖、单一写入路径、独立可测。
3. **切分即管理**：工件划分 = 代码管理与迭代节奏，不承载运行时可替换承诺。
4. **基础能力迭代沉淀**：证据驱动提炼；未来新产品 = 在沉淀的基础能力上快速搭建（届时另立提案）。

**设计评审问句**（替代已退役的「换场景包还成立吗」）：**forge 需要吗？边界干净吗？**——任何以「未来新产品/新场景」为由的预先抽象，按定义为过度设计，当场砍。

## 1. 工件版图

> 命名为示意，P1 设计期定名；工件拆并 = 代码管理操作（记入文末版本历史），能力边界变更随阶段提案。

| 工件 | 能力边界（做什么） | 不做什么 | 迭代节奏 |
|---|---|---|---|
| `host/` 薄宿主 | 进程入口、profile 加载、boot manifest 组装（官方 ui-\* 选型 + 产品自有 client 插件注入）、`{url, injections}` IPC | 一切业务语义 | 随上游锁定版 |
| `web/` 三区工作台 | 自有 vite 入口 + `dsh-client-web` 壳内核；左栏（知识库面板/项目树/会话列表）、中区（dsh 会话）、右栏 dock；看板/管线视图（forge 七态直渲染）；`--dsw-*` 令牌纪律 | 状态/知识的写逻辑（只调 API） | 产品主线 |
| `state-layer/` forge 状态层 | features/tasks/proposals 存储 + 动词 API（claim/submit/…）+ 转移校验 + 依赖终态守卫 + append-only 执行记录 + 任务↔会话挂接表 | UI、技能、文档路径语义（docPath 为不透明字段）、dsh 会话账本（实时读，不复制） | 产品主线 |
| `knowledge/` 知识链路 | 知识目录解析、frontmatter 契约校验、索引（可重建缓存）、动态置信度（四信号读取时计算）、召回能力面（域过滤+关键词+阈值+理由+使用事件）、审核与合并队列、晋升流 | 会话编排、知识注入决策（agent 自行决定）、代码仓与文档位置写入 | 产品主线（P2 重头） |
| `plugin-knowledge/` 知识插件 | dsh tool：召回四动词 + 写入 tool（契约校验，与 UI 管理面同后端）；系统提示词知识段组装 | 管线/SDD 任何语义 | 随产品交付 |
| `plugin-forge/` forge 插件 | SDD 管线技能（eval-\* 裁剪）+ 命令 tool（消费 state-layer API） | 状态存储（只消费） | 独立工件、独立发版 |

**依赖方向（单向）**：`web` →（能力面 RPC）→ `state-layer` / `knowledge`；`plugin-forge` → `state-layer`；`plugin-knowledge` → `knowledge`；`host` 组装一切但不含业务。不存在反向 import；`state-layer` / `knowledge` 不 import UI 与插件。

**单一写入路径**：状态写只经 `state-layer` 服务（UI 动作与 forge tool 同门）；知识写只经知识能力面（UI 管理面与知识插件 tool 同门）。数据库无第二写者。

**插件化的真实动机**：① dsh tool 须以插件形态注册（机械要求）；② 技能线与产品壳迭代节奏不同（管理便利）。非可替换机制——两个插件均无 client 半身，全部 UI 在 `web/`。

## 2. 状态层边界细则（P1 设计的输入）

- **表**：`features` / `tasks`（七态 CHECK）/ `task_edges`（blockers，写入时无环校验）/ `task_records`（append-only）/ `proposals` / `task_session_links`（应用侧挂接记录，会话账本本体归 dsh）；SQLite 部署于应用 profile，按 `workspace_id` 外键域。
- **状态机** = 代码内一份具体常量（task 七态、proposal 四态、feature manifest 态）+ 动词函数（`taskAdd / taskClaim / taskSubmit / taskTransition / taskQuery…`）；校验（from 匹配、依赖终态、record/reason 必带）全在服务内。
- **机制不变量**：键唯一（`<feature>/<localId>`）、blockers 无环、记录 append-only、每次写自动审计。
- **对齐总纲**：SC2（无投影、状态直读）、SC7（tool 消费本 API 写入，产品只看不管）。

## 3. 基础能力沉淀机制

- **提炼判据（满足其一）**：① 出现第二个真实消费方；② 能力输入输出已全契约化且与 forge 语义零耦合。
- **提炼动作**：轻量提炼案（随阶段提案或独立小提案）→ 从 forge 实现中抽包（不改行为）→ 消费方改依赖；**数据不动**。
- **候选观察清单（观察，非计划）**：知识链路、薄宿主、会话面板接入层、令牌化 UI 基座。
- 总纲 P5「新产品」锚点的前置 = 本机制积累的提炼程度。

## 4. 演进纪律

- 上游 dsh 版本精确锁定 + 显式适配任务（继承总纲策略）。
- 能力边界变更随阶段提案；工件拆并记入下方版本历史。
- 本文与总纲冲突时，以总纲为准。

## 版本历史

- 2026-10-02：初版。随总纲「产品形态」修订（场景包两层模型退役）建立；状态层细则出自 forge 具体设计（具体表结构 + 状态机常量 + 动词 API）。
