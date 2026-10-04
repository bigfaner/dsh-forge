---
created: "2026-10-02"
status: "探索笔记（不改现行方案；重估点见 §3）"
related: "proposal.md, tech-research.md, ../dsh-forge-m2-pipeline/db-schema.md"
---

# 插件架构探索：域归属独立 与 工作区插件覆盖

> 性质：两次用户发起的架构探索的记录（2026-10-02）。**不构成任何现行方案变更**——M2 提案、db-schema、总纲零改动；本文件只为 M3 拆包与 M4 自举前的方向重估积累判断材料。
>
> 证据基线：① dsh 安装包源码勘察（`D:\software\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\*`）；② 官方插件开发文档（`dsh-agent-preset/skills/cordis-plugin-development/` 的 SKILL.md + references/{host-plugin,practices,ui-plugin}.md）；③ 本项目既有裁决（M2 db-schema §6-37/38/39、M2 提案「范围对齐」节、总纲 SC1/P1 流程）。

## 1. 探索一：knowledge / forge 分别做成独立插件（域归属轴）

### 1.1 问题校准

两者**已经是两个插件**（P1 knowledge 插件、M2 plugin-forge，同一条 Cordis 注入缝）。真问题是**域归属**：现在是「胖 core + 薄 tool 半身插件」（域服务与库都归产品核心），探索的是能否走到「**插件自有域**」（存储 + 服务 + 面板都随插件走，核心瘦成中立基建）。

### 1.2 前提检验：存储分离确实成立

推理链 = 「存储不交叉」原则的升级——从*表不越界*升到*域不共库*再到*插件自有域*：

| 域 | 存储现状 | 独立完备度 |
|---|---|---|
| forge | 每工作区 forge.db，中央零足迹（M2 范围对向后连 repo_root 列都移了） | ✅ 已完备 |
| knowledge | `.knowledge` 目录 + central state.db 共库（与 projects 同库） | ⚠️ 差一步：拆出独立 knowledge.db 才对称 |

两域**真零耦合**：dispatchPrompt 不注入知识（总纲 SC10 显式「不注入会话」）；召回 tab 与任务挂接都只锚会话身份（中立）；无跨域查询需求。共享的只有 projects 注册表 + 会话身份 + 壳——全是中立物。

```text
现状（计划）                         探索（仅推演）
dsh host                            dsh host
└─ dsh-forge 产品（胖 core）         └─ dsh-forge 产品（瘦壳）
    ├─ core: state.db[proj+know]        ├─ 中立基建: projects 注册表
    │        + 每工作区 forge.db         │   + 会话身份 + UI 槽位机制
    │        + 全部域服务                ├─ web 工作台（消费插件注册的服务/面板）
    ├─ plugin-knowledge（薄 tool）       ├─ plugin-knowledge（自有 knowledge.db
    └─ plugin-forge（薄 tool）           │   + 召回/事件服务 + tools + 面板）
                                        └─ plugin-forge（自有每工作区 forge.db
                                            + 状态机服务 + tools + 面板 + skills）
```

### 1.3 全独立要设计的五条缝

| 缝 | 现状 | 探索下 |
|---|---|---|
| 存储所有权 | core 管句柄/迁移 | 随插件走；knowledge 需一次性 state.db 拆分 |
| **UI↔插件服务**（关键新缝） | UI 直调 core RPC（transitionTask 人类面） | 插件注册服务、UI 解析消费——Cordis 正向注入（产品→插件）P1 已验证，反向注册是唯一待验证点 |
| 面板贡献 | 任务/知识视图写死在产品 web | dsh 宿主 UI 本身就是 client 插件 + slots（勘察证实，见 §2.1）——槽位机制现成，自建壳亦可自定义 |
| 生命周期 | 启动多句柄 + §7-12 迁移编排 | 移到插件激活——失败隔离反而更好（一个插件挂不砖壳） |
| 读路径 | 视图直读库 | 经插件读服务（**勿**让 UI 只读 attach SQLite 文件——存储格式耦合进 UI） |

### 1.4 收益与成本

**收益**：边界纪律机械化（core 无法偷摸调域内部）；自举更真实（M4 起用自己的扩展点开发自己）；plugin-forge 可独立发布给纯 dsh 用户（老 forge 本是宿主插件——可移植性回归，旧用户迁移路径复活）；schema 迁移爆炸半径隔离到包。

**成本**：多一层契约（UI↔插件服务契约进 contracts pin 池）；knowledge 侧动中央库（一次性拆库）；SC7「写入应用状态层」措辞与 SC2「直读」断言对象需重定向（断言存活，对象迁移）。

**结论**：方向成立、无硬阻碍、与宪法同向（存储不交叉 / 只看不管 / 面分治的自然延伸）。**现在不动**（M2 刚回到 1–2 周体量；插件入仓 + 以包为单位独立发版已买到节奏独立这半收益）。迁移路径平滑：薄 tool 半身 → 全域插件 = 包内重构，tools/skills 契约面不变，agent 零感知。

## 2. 探索二：自定义插件覆盖 dsh 工作区插件，项目升一等公民

### 2.1 事实基线（源码勘察）

**① dsh 本体 = Cordis 插件星座**。功能以 `@deepseek-ai/*` 包粒度组合：`dsh-workspace`（工作区域包）、`dsh-api-workspace-controller`（API 面：directory-picker / default-workspace / commands）、`dsh-client-ui-workspace`（**侧边栏本身就是 client 插件**）、`dsh-plugin-manager`（bundle 安装/启停/移除）、`dsh-client-ui-plugin-manager` 等。

**② dsh 的 workspace registry 就是宿主的「项目」概念**（`dsh-workspace/README.zh.md`）：`ctx.workspaceRegistry` = 有序、持久的**项目目录列表** + 每目录中运行的会话；宿主侧边栏项目树即其消费面。设计要点：`fs.realpath` 唯一性规范（与我们 canonical path 同哲学）；会话按运行目录自动归属、一会话一项目；隐藏/归档会话不删历史；移除项目非破坏、重加从空开始。**它对模型不可见**（零工具零提示词注入）。

**③ P1 已经在消费它**：`dsh create` = registry 创建、ownership 预检 = `list()` 按 canonical path 匹配、SC12 补偿 = `registry.delete`。即 dsh-forge 项目与宿主 workspace 行已是 1:1 双注册（宿主行 + 中央 projects 行）。

**④ 覆盖机制存在且分层**（`cordis-plugin-development` 技能）：

- bundle = 声明 `dsh.bundle.patch` 的包，经 `plugin_manager install_bundle` 装入 **profile** 层，`cordis.patch.yml` 以 insert 行插入插件条目；
- **shipped 层可被 profile 层覆盖**：SKILL 明示「shipped bundle 可将某行置 `disabled`——写一个 workspace bundle，其 patch **override 该行**为 `disabled: false`」；`list_plugins` 的 `overridden` = 「更高优先级层胜出」；`host-plugin.md`：「a matching override replaces the complete `config`」；
- Client 侧同理：UI 插件经 slots 注册（`ctx.slots.inject`），可覆盖/禁用。

**⑤ 官方纪律：最弱机制优先**（`practices.md` 原则 4）：扩展点从弱到强 = `tools.restrict()`（只能移）→ `tools.guard()`（只能拒）→ waterfall 监听（可改写、依赖注册序）→ 整体替换。「机制越强，越要自己保全其他插件的贡献」。

### 2.2 什么不是一等公民

宿主项目模型的缺口恰是 §6-37 的痛点在宿主侧的根源：**平铺目录列表，无 repo 级分组**——每个 worktree/checkout = 独立一行、互为孤岛；主 checkout 与它的 worktrees 在侧边栏毫无关系。此外 dsh-forge 的项目语义（forge 目录 / 知识库目录 / 任务清单路径 / 中央行）纯在产品侧叠加，宿主不知情。

### 2.3 三条路线评估

| 路线 | 机制强度 | 内容 | 判断 |
|---|---|---|---|
| **A 增强（不替换）** | 弱（inject 订阅 + slot 贡献） | 自定义插件 `inject ['workspaceRegistry']`，订阅列表，叠加 repo_root 分组（**§6-37 判定器原样复用**），经 client slot 贡献项目树两级视图 | ✅ **推荐**：registry 保持 SoT，分组 = 派生缓存（符合官方原则 1/3）；禁用插件即回原生平铺，零数据丢失 |
| B 补持久化 | 中（自有 storage domain） | 分组映射存插件自有 domain（宿主 `dsh-storage-domain` 先例，如 workspace domain v2）——不碰 workspaces 表 | A 的自然补件：分组需跨启动记忆时加 |
| C 覆盖/替换 | 最强（disable 原行 + insert 替代） | bundle patch 置 `dsh-workspace`（及 `dsh-client-ui-workspace`）为 disabled，换自研注册表 | ⚠️ 机制可行但代价被官方纪律预警：接管会话归属（头部索引/引导/成员资格校验，与 dsh-session 持久化深耦）、controller API、其他消费方——等于 profile 层 fork 一个核心子系统，上游每次演进手工跟 |

**fork 维度的附注**：dsh-forge 是 dsh 的 vendor/fork——可以直接改 shipped 组合层。但分层纪律建议：**fork 尽量薄，产品件走 bundle 叠加/覆盖层**（只覆盖需替换的行，其余 shipped 原样）——上游合并成本与 profile 独立性双赢。「覆盖」语义的正确用法是精准换行，不是整体换引擎。

### 2.4 对现行方案的影响面（仅记账，未改动）

1. **§6-37 repo_root 分组的 M3 实现面多一个候选**：宿主插件增强路线（路线 A/B）——分组住插件自有 domain，**中央 state.db 可继续零改动**（连 M3 的 repo_root_path 列都可能免掉）；代价 = 分组只在装了该插件的宿主可见，dsh-forge 产品侧消费需经其服务面。
2. **SC1 左栏「项目树+会话列表」与宿主 `dsh-client-ui-workspace` 的关系**成为显式设计题：换掉宿主 client 插件（覆盖行）vs 在其 slot 上叠加——属 M3/设计期，随 §7-16 一并裁决。
3. 探索一的「插件自有域」与本节「增强不替换」**同向兼容**：forge/knowledge 域插件化后，宿主侧增强插件是第三个同构件。

### 2.5 勘察副产品（值得知道的宿主事实）

- **宿主有 domain KV 存储体系**（`dsh-storage-domain`）：workspace domain v2、领域写链串行化、`pendingMutation` 两写标记、**不变式伴生插件**（实体缓存必须镜像持久表，绕过注册表的写入触发不变式失败）——与 forge.db 的 schema_meta/版本化/机械断言同哲学，互为印证（也说明该哲学在宿主上游已验证）。
- **UI 插件纪律**（practices.md）：只用 `--dsw-alias-*` 主题 token、禁 import 任何 `dsh-client-ui-*` 包（复制标记/样式到插件内并改前缀）、React 组件入 slot、不写 DOM——未来任何 forge/knowledge 面板插件（探索一的「面板贡献」缝）的直接规范来源。
- 会话日志 = 唯一 SoT，插件记忆 = 派生缓存（原则 1）——与总纲「无投影」宪法同构。

## 2.6 路线 A 实现蓝图（增补：用户追问「具体如何实现」）

### 2.6.1 证据基线：官方已有「外部观察者」完形样板

`dsh-workspace/invariant.js`（不变式伴生插件）就是增强模式的全部零件（节选）：

```js
// 可选服务注入：无 registry 的 profile 里插件休眠（practices 原则「optional services in inject」）
const install = Object.assign((ctx, fail) => {
  ctx.on("domain/changed", (change) => {          // 宿主事件总线，任意插件可订阅
    if (change.domain !== "workspace" || change.table !== "workspaces") return;
    // change = { domain, table, key: WorkspaceId, operation: "deleted" | upsert }
  });
}, { inject: ["workspaceRegistry"] });
```

三个关键事实：① registry 服务经 `static inject = ["storageDomain", "sessionPersistence"]` 组合，消费面 = `ctx.workspaceRegistry`（`list()` / `get(id)` 等）；② 变更通知 = 存储域层的 `domain/changed` 事件（registry 自身不发插件级事件——订阅域事件是官方认可的观察通道，invariant 即此写法）；③ 记录形态 = `{path(realpath 规范), title, sessionIds, createdAt, updatedAt}` + 全局 `workspaceIds` 权威序。

### 2.6.2 包结构（四个文件，照 decoration 模板 + host-plugin.md）

```text
plugin-workspace-repo-grouping/
  package.json        # dsh.bundle.patch 指向 cordis.patch.yml；dsh.client 段（platform/inject）；
                      #   exports: "." → index.js（Host）, "./client" → client.js（Client）
  cordis.patch.yml    # insert：host 行 + client 行；（可选）override 置 dsh-client-ui-workspace disabled（仅视图换脸方案，见 2.6.4b）
  index.js            # Host：注入、订阅、解析、服务、（可选）自有存储域
  client.js           # Client：slots.inject 注册两级项目树（React 取自浏览器模块表）
```

### 2.6.3 Host 侧（index.js）设计

```text
apply(ctx):
  inject = ['workspaceRegistry']            # 缺席即休眠——卸载/未装宿主件时零痕迹

  触发面（三处，全部只读）:
    ① 启动: 全量 derive 一次
    ② ctx.on('domain/changed'): 过滤 domain='workspace' ∧ table='workspaces' → 防抖重derive
    ③ 惰性: 视图请求时对可疑项重验（外部 mv 不可感知——与宿主已知限制同款，
            「外部变更延迟可见」，下次刷新/重启对账，§6-37 对账重解析同哲学）

  derive(registry.list()) → Map<repoRoot|null, WorkspaceId[]>:
    每个 workspace.path 过 §6-37 判定器（.git 三态解析，原样移植）:
      无 .git → repo_root = NULL（单工作区组）
      .git 目录 → 主 checkout，repo_root = canonical(W)
      .git 文件 → gitdir 再判 worktrees/<n>（剥两层）/ modules/*（独立）
    解析失败（无权限/损坏）→ 归 NULL 组，绝不抛进 registry

  暴露服务 ctx.repoGrouping:
    groups(): Group[]            # Group = { repoRoot, label, workspaceIds }
    byWorkspace(id): Group|null
    siblings(repoRoot): Path[]   # 读 main/.git/worktrees/ 目录名 → 未注册兄弟提示（§6-37 兄弟枚举）

  排序纪律: 组内序 = registry 原 workspaceIds 序（不打扰 SoT 顺序）；
            组序 = 组内最靠前 workspace 的位置（呈现细节随 §7-16 实现版裁决）
```

**持久化（可选第二阶段，路线 B）**：手动覆盖（组改名 / 组排序 / 单工作区免分组）存**插件自有** storage domain（`defineDomain({name:'workspace-grouping', …})`——`ctx.storage.domain` 先例即 workspace domain v2 本身）；派生部分永不落盘，覆盖层才落盘。**禁用回退语义**：卸载 bundle → patch 层消失 → 原生平铺回归；自有 domain 数据残留但无害（`remove_bundle` 随包清理）。

**性能**：derive = 每 workspace 一次 stat + 一次小文件读，数十 workspaces 毫秒级；仅在上述三触发点跑，无 watch、无轮询（SC2 禁 watch 纪律同款）。

### 2.6.4 Client 侧（client.js）两个子方案

| | a. 纯叠加 | b. 视图换脸（推荐给两级树） |
|---|---|---|
| 做法 | 在侧边栏 slot 追加一条目（如组徽标 widget），不动原树 | bundle patch **override 置 `dsh-client-ui-workspace` 行 disabled**，同 slot 注册自绘两级树 |
| 数据源 | 原树照旧（读宿主）+ 徽标读 `ctx.repoGrouping` | 自绘树读**双源**：`ctx.workspaceRegistry`（SoT：标题/顺序/会话）+ `ctx.repoGrouping`（派生分组） |
| 边界 | 只换/加**视图层**，registry 引擎与数据零触碰——「增强不替换」的精确含义 | 同左；被替换的仅是渲染件，卸载即回宿主原生树 |
| 依赖 | sidebar slot 支持多 entry（需 `Slots.listSubTree` 实测） | 需复刻原树的交互细节（practices：从宿主页复制行为模式，token 化样式，禁 import client 包） |

**UI 纪律**（practices.md 直接引用）：只用 `--dsw-alias-*` 主题 token；React 取自浏览器模块表（零重复安装）；工厂无副作用，资源在 `apply` 内 `ctx.effect` 注册并返回清理；可见文案走 Client locale 服务。

### 2.6.5 §6-37 复用映射与减免

| §6-37 裁决件 | 去向 |
|---|---|
| .git 三态判定器 | derive 核心，原样移植 |
| repo_root 分组键 | `Group.repoRoot` |
| 兄弟枚举（main/.git/worktrees/ 只读） | `siblings()` 服务 + UI 提示 |
| submodule 独立处理 | 判定器分支保留 |
| 对账重解析（main 移动自愈） | 触发面 ③ 惰性重验 |
| **中央 repo_root_path 列** | **免掉**——分组住插件内存/自有域，中央 state.db 继续零改动（§2.4 记账项的加强） |

### 2.6.6 验证路径（按 cordis-plugin-development 技能流程）

① `cordis_inspect_query` 实测三件事再动手：`domain/changed` 事件载荷精确形状、`Service` 面 `workspaceRegistry` 方法签名、`Slots.listSubTree` 拿侧边栏 slot id 与 props；② 写四文件 → `plugin_manager install_bundle`（不做手写 package.json/patch 到 profile）；③ 读安装结果 `application: applied` + `cordis_inspect_query` 确认新行（非翻日志）；④ 浏览器可控时连页面验证明暗主题与交互。

> 落位说明：本蓝图面向**原版 dsh**（profile bundle 路线）；在 dsh-forge fork 内，同一份代码可作为一等包直接入仓，但**仍建议走 bundle 叠加层形态**（shipped 层保持与上游一致，合并成本最低）。


## 3. 汇总：重估点与触发器

两条探索是同一哲学的三个面：**薄壳 + 插件自有域 + 最弱机制增强**。

| 重估点 | 摆上桌的问题 |
|---|---|
| **M3 拆包**（现计划轴 = plugin-forge 拆管线核心/规格） | 拆包轴重定义：域归属轴（探索一）vs 管线/规格轴，哪个先；§6-37 分组实现面（中央列 vs 宿主插件路线 A/B）；SC1 左栏与宿主 client 插件关系 |
| **M4 自举前** | 自举真实度奖励插件自有域；届时若仍胖 core，自举叙事打折 |
| 触发器（探索一） | M3+ 多 worktree 管线成日常 / plugin-forge 面向仓外用户独立发布的决策出现 |
| 触发器（探索二·路线 C） | 仅当宿主 registry 语义本身错（如归属规则需根本改变）才考虑；分组需求全部可由 A/B 满足 |

> 引用源：`skills/cordis-plugin-development/SKILL.md`（bundle/覆盖/禁用语义）、`references/host-plugin.md`（patch 方言、override 整替换 config）、`references/practices.md`（最弱机制原则、UI 纪律、会话日志 SoT）、`@deepseek-ai/dsh-workspace/README.zh.md`（registry 语义与耦合面）。路径前缀 = `D:\software\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\dsh-agent-preset\` 与 `…\@deepseek-ai\`。
