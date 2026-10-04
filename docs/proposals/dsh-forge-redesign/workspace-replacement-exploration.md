---
created: "2026-10-02"
status: "探索笔记（不改现行方案；路线 C 详解——上篇《plugin-architecture-exploration》§2.3 的展开）"
related: "plugin-architecture-exploration.md, proposal.md, ../dsh-forge-m2-pipeline/db-schema.md"
---

# 探索：替换 dsh 工作区注册表——「项目一等公民」的替换路线详解

> 性质：用户指定的独立详解文档。**不构成现行方案变更**。对象 = 用自定义注册表**替换** `@deepseek-ai/dsh-workspace`（宿主项目/工作区引擎），与上篇的「增强不替换」（路线 A/B）互为备选。
>
> 证据基线：dsh 安装包源码（`D:\software\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`），关键引用标注 `包名:行号`；`dsh-tool-cordis` 的 api-catalog（宿主自描述的 API 清单）为交叉验证源。

## 1. 「替换」到底替换什么

```text
dsh 工作区子系统的分层（替换对象加粗）

  dsh-client-ui-workspace     侧边栏项目树视图（client 插件）           —— 可换脸，非本篇重点
  dsh-api-workspace-controller RPC 面（web UI 的全部工作区操作经此）     —— 兼容层保护对象
  dsh-api-session-controller  会话 RPC：attach/forget/归档门禁          —— 硬编码消费者（§2.4）
  dsh-webhook                 外部会话入径：create + attach + 不变式     —— 硬编码消费者（§2.4）
  dsh-agent / jobs / schedule / subagent   归档准入提供方（应答事件）    —— 事件契约依赖方（§2.3）
  ─────────────────────────────────────────────────────
  dsh-workspace               ★ 本篇替换对象：注册表引擎（服务 + 域 + 实体 + 不变式 + 两事件）
  ─────────────────────────────────────────────────────
  dsh-storage-domain / dsh-session-persistence / dsh-storage   基建 —— 不替换
```

**不替换**：会话存储与持久化、storage-domain 基建、web 壳。**替换深度两档**：C1 同名顶替（drop-in 服务，§4.1）与 C2 新引擎新服务名（§4.2）——§4.2 将证明 C2 在原版 dsh 上不可行、在 fork 内等于改上游源码。

## 2. 替换对象的完整解剖（源码证据）

### 2.1 服务面：必须兼容或重写的 API 清单

`WorkspaceRegistry`（服务名 `workspaceRegistry`，`dsh-workspace/lib/index.js:374`）——从消费方实际调用面归纳（交叉验证：`dsh-tool-cordis/lib/types/api-catalog.js:3540-3604, 7832`）：

| 方法/属性 | 语义 | 主要调用方 |
|---|---|---|
| `list(): Workspace[]` | 全量（新到旧） | controller feed/重名检查、session-controller、webhook 不变式 |
| `get(id): Workspace \| undefined` | 按 id 取实体 | controller 详情、session-controller、invariant 伴生 |
| `resolveByPath(path)` | realpath 规范后查重 | controller create 预检（幂等命中返回现有） |
| `create(path, title?)` | realpath 规范 → 建行（存在性校验，ENOENT 拒绝） | controller、**webhook**（`:160`） |
| `delete(id): boolean` | 非破坏移除（会话转 Ungrouped） | controller |
| `insertBefore(id, beforeId?)` | 权威显示序重排 | controller |
| `archiveSession(sid, {stopActivity?})` | 归档（活动 waterfall 门禁 + stop 派发 + 摘 pin） | controller |
| `unarchiveSession(sid)` / `pinSession` / `unpinSession` | 归档/置顶集合操作 | controller |
| `forgetSession(sid)` | 会话账目除名 | **session-controller**（`:825`） |
| `archivedSessionIds` / `pinnedSessionIds` | 集合直读 | controller、session-controller 归档门禁（`:2794`） |
| `initializeDefault(resolveDirectory)` | 首次使用工作区（空注册表 + 零会话史才允许） | controller `:877` |

`Workspace` 实体面（api-catalog `:7832`）：`id / path / title / createdAt / updatedAt / sessionIds（按活 cwd 过滤）/ setTitle / attachSession / insertSessionBefore / detachSession / status(): 'ok'|'missing-dir'`。

### 2.2 持久形态：workspace 域 v2

`defineDomain({name:'workspace', version:2, …})`（`dsh-workspace/lib/types/spec.js:61-69`）：`workspaces` 表（键 = WorkspaceId；行 = `{path(realpath 规范戳), title, sessionIds, createdAt, updatedAt}`）+ 全局单例 `{initialized, defaultWorkspaceId?, workspaceIds(权威序), archivedSessionIds, pinnedSessionIds, pendingMutation?}`。

**唯一性规范 = `fs.realpath`**（`lib/index.js:36-51`）：尾斜杠/`..`/符号链接全部解析；符号链接指向既有工作区目录 = 碰撞（与我们 canonical path 哲学同源但不同实现——注意：宿主 realpath 会解析 subst/junction，S10 spike 的对象差异点，记账）。

### 2.3 事件契约（双向）

- **派发**（注册表拥有的两个宿主事件，替换者必须继续派发，否则归档门禁碎）：`workspace/session-activity`（waterfall，`index.js:529`）与 `workspace/session-stop`（parallel，`:641`）。四个上游提供方**应答**它们：`dsh-agent`（turn 族，`lib/index.js:27`）、`dsh-jobs`（job 族，`:20`）、`dsh-schedule`（schedule 族，`:2680`）、`dsh-subagent`（subagent 族，`:2244`）。`SessionActivityKindMap` 键空间由提供方合并——替换者不得收窄。
- **订阅**：注册表**不发自定义变更事件**；外部观察通道 = 存储域层的 `domain/changed`（invariant 伴生的官方订阅写法，上篇 §2.6.1）。

### 2.4 消费方图谱（谁会碎——替换的硬边界）

| 消费方 | 耦合方式 | 替换下的命运 |
|---|---|---|
| `dsh-api-workspace-controller` | `inject ['typert','workspaceRegistry']`（`:840`），RPC 全动作直调 | C1 下零修改继续工作 |
| `dsh-api-session-controller` | **硬编码** `inject [...,'workspaceRegistry']`（`:2778, 3191`）：attach（`:739,896` 子会话入账）/ forget / list / 归档门禁（`:2794`） | 同上——**服务名被迫保留**（见 §4.2 推论） |
| `dsh-webhook` | create（`:160`）+ attach（`:179`）+ 自带不变式（一会话一归属检查，`invariant.js:17`） | 同上 |
| `dsh-client-ui-workspace` | 经 controller feed（baseline + 增量，`feed.js:41-94`），不直碰服务 | controller 存活即存活（平铺视图） |
| 四个归档提供方 | 应答 §2.3 两事件 | 事件照派即存活 |
| `dsh-tool-cordis` api-catalog | 内省面收录服务与 Workspace 接口 | 替换后内省到我们的实现——**契约 diff 的机械检测通道**（§6） |
| `workspace-invariant` 伴生 | `inject ['workspaceRegistry','invariants']`，校验「实体缓存镜像持久表」 | 若复刻缓存纪律可保留（免费不变式）；否则随行禁用 |

### 2.5 引擎内部机制（替换者要复刻的工程量清单）

① 首次引导：凭**只读会话头部**从会话史重建归属（头部索引，绝不加载事件正文）；② 两写变更标记 `pendingMutation`（create/delete 先持久化标记再动记录/序对，启动补全被中断操作，未标记分叉 = 显式损坏报错）；③ 串行化写入（单操作链 + 领域写链 `table.update` + `updatedAt` 戳）；④ attach 时头部 cwd 校验（会话目录解析失败拒绝入账）；⑤ 失效账目惰性剪除（读时过滤 + 下次变更持久化剪除）；⑥ 启动状态校验（重复路径/重复账目/序漂移显式报错）。

## 3. 我们的注册表语义设计（替换的动机面：项目一等公民）

### 3.1 数据模型

```text
实体两级化（宿主原生模型 = 单级平铺目录列表）

  Project（一级，新）     = repo（repo_root 键，§6-37 判定器产出）
                           字段：repoRoot(规范) / title(独立于目录名，可改) / order / createdAt
  Checkout（二级，原 workspace 行升级）
                           = 原 workspace 记录 + { projectId?, worktreeName? }
                           主 checkout / worktree 判定落库为存量事实（非派生缓存！——与路线 A 的本质区别）
  Session 账目            = 原样保留（checkout 内有序账目 + 全局 archived/pinned 集合）
```

**创建时判定（非派生）**：`create(path)` 内部跑 §6-37 判定器 → repo_root 已有 Project 则挂入（worktree 徽标 = `.git/worktrees/<name>` 的 name），无则新建 Project；非 git 目录 = 无 Project 的裸 checkout（保持原单级语义兼容）。

### 3.2 能力增量（替换买到了什么）

| 增量 | 路线 A/B 能否给 | 说明 |
|---|---|---|
| 项目 = 存储实体（改名/排序/元数据跨重启一等保存） | B 勉强（自有域）| 判定结果落库为事实，移动/重挂有审计轨迹 |
| 未注册兄弟提示原生化 | A 可（siblings 服务） | `main/.git/worktrees/` 只读枚举 |
| 项目级折叠/重排/标题独立于目录名 | A/B 都弱 | 顺序与标题住在引擎里而非叠加层 |
| 归档/置顶集合语义升级（项目级归档？） | 否 | 新语义空间——同时也是风险面（§6） |
| session 归属规则升级（如 repo 级归属视图） | 否 | 注意：一会话一 checkout 的账目不变式建议保留 |

### 3.3 兼容层语义映射（C1 的关键设计裁决）

原 13 个 API 的返回语义**不动**（`list()` 仍返回 checkout 级平铺——旧消费者零感知）；新增 Project 面：`projects(): Project[] / projectOf(checkoutId) / createProject/renameProject/moveProject/reparentCheckout`。**平铺兼容 + 两级增量**双面并存，直至消费方（controller/侧边栏）显式升级到两级面。

## 4. 两种替换策略详解

### 4.1 C1：同名顶替（drop-in 服务 + 原域原格式 + 伴生自有域）——推荐形态

```text
plugin-workspace-pro/（或 fork 内一等包）
  patch 动作：
    - override 置 dsh-workspace 行 disabled（连带决定 invariant 伴生去留）
    - insert 我们的包（服务同名 'workspaceRegistry' —— session-controller 硬编码所迫）
  存储三件套：
    ① 原 workspace 域 v2 原格式打开（数据零迁移，回滚 = 重新启用原行）
    ② 自有新域 'workspace-project' v1（Project 表 + checkout→project 账目）——增量不碰旧域
    ③ 引擎内部 join 两域（读时合成，写入各归各域）
```

- **义务清单**：§2.1 全部 API + §2.3 两事件照派 + §2.5 六项内部机制复刻 + 缓存镜像纪律（保 invariant 伴生可选）。
- **收益**：四个消费包 + controller + 侧边栏**零修改存活**；数据回滚零成本；两级视图经自换 client 件（上篇 §2.6.4b）按需叠上。
- **代价集中点**：§2.5 复刻 ≈ 数百行关键路径代码 + 与上游演进的永久 diff 义务（§6）。

### 4.2 C2：新引擎新服务名——**原版 dsh 上不可行**（本篇最重要的否定性结论）

`dsh-api-session-controller` 与 `dsh-webhook` 是**上游包且硬编码** `workspaceRegistry` 服务名（§2.4）。新服务名 ⇒ 这两个包注入失败 ⇒ 会话入账与外部入径碎，而它们不在替换者的修改权内。因此：

- 原版 dsh（profile bundle 路线）：**只存在 C1**；
- fork 内：C2 = 直接改上游包源码（把注入名改掉）——那已经不是「插件替换」而是 vendor 分叉改造，合并成本最大化，除非同时收获原生语义重构，否则劣于 C1。

### 4.3 与 fork 的关系（分层纪律）

| 落位 | 做法 | 回退 | 上游合并 |
|---|---|---|---|
| 原版 dsh | profile bundle（disable + insert） | `remove_bundle` / `set_plugin` | N/A（叠加层） |
| dsh-forge fork | **同为 bundle 叠加层**（shipped 层保持与上游一致） | 重启用原行 | shipped diff = 0，最便宜 |
| fork（激进） | 直接改 shipped 组合/源码 | git revert | 每次升级手工合并——C2 的代价面 |

## 5. 对 dsh-forge 现行方案的记账影响（未改动，仅记录）

1. **P1 流程零波及**：`dsh create` / `registry.list()` ownership 预检 / SC12 `registry.delete` 补偿链在 C1 下语义不变（同服务同格式）。
2. **中央 projects 表的未来瘦身开口**：若宿主原生 Project 落地（本路线），dsh-forge 中央 projects 的分组职责可让渡——但 forge 注册语义（forge 目录/知识库目录/任务清单路径锚点）仍在产品侧，中央行保留、职责收窄为「forge 注册事实」而非「分组」。M4+ 记账。
3. **§6-37 关系翻转**：增强路线（A/B）里 repo 分组是派生缓存；替换路线里是存储事实。db-schema §6-37 裁决（repo_root 分组键）在两条路线下都成立，**实现面三选一**（中央列 / 宿主叠加插件 / 宿主替换引擎）——M3 拆包时一并裁决。
4. S10 spike 补充对象：宿主 realpath 规范 vs 我们 canonical path 的差异（subst/junction 解析行为）——两条路线都需面对（宿主 realpath 可能解析 junction，导致同一物理目录两种规范形式）。

## 6. 工程量、风险与上游同步

| 项 | 评估 |
|---|---|
| 复刻工程量 | §2.5 六机制 ≈ 引擎核心数百行 + 测试（引导/两写/写链的崩溃恢复测试是主要成本） |
| 上游演进 diff 义务 | dsh-workspace 任何 API/事件/域格式演进，替换者必须跟进——**机械检测通道**：`cordis_inspect_query` 对比 api-catalog 的 workspaceRegistry 条目（服务方法/事件签名 diff 可脚本化，纳入 CI） |
| 静默落后风险 | 同名服务的契约漂移（上游加了方法，消费方开始调用，我们未实现）——运行时才爆；api-catalog diff 是唯一机械防线 |
| 归档门禁回归义务 | 两事件派发时序（waterfall 一次 → 写归档 → parallel stop）必须精确复刻，否则「归档后唤醒被拦」的安全性质破 |
| 数据风险 | 旧域原格式打开 = 单向只读兼容最安全；**若升 v3 加表**需查 dsh-storage-domain 的版本迁移语义（未知点，动手前必查） |
| 触发条件（何时选 C 而非 A/B） | ① 项目语义需要入引擎（原生排序/标题/项目级归档等 §3.2 下半表能力）；② A/B 的派生缓存已造成实际维护痛；③ 愿意承担永久 diff 义务。三者同时成立才启动 |

## 7. 结论

1. **C1（同名顶替 + 原域原格式 + 伴生自有域）是唯一在原版 dsh 上成立的替换形态**，也是 fork 内成本最低的替换形态；C2 被 session-controller/webhook 的硬编码注入否决（除非改上游源码）。
2. 替换买到的独特价值 = **判定落库为存储事实 + 项目级语义住引擎**；代价 = 引擎复刻 + 与 dsh-workspace 上游的永久契约 diff 义务（api-catalog 机械检测兜底）。
3. 决策序列建议维持：先走 A/B（增强）吃掉分组需求 → 触发条件（§6 末行）成立再升 C1 → 任何时候 C1 的回退 = 重新启用原行（数据零迁移）。三形态共享同一判定器与视图件投资，不互斥。
