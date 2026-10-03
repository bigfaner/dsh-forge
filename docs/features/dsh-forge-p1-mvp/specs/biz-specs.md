---
feature: "dsh-forge-p1-mvp"
generated: "2026-10-03"
status: draft
---

# Business Rules: dsh-forge P1（MVP）—— 走线架 + 知识飞轮第一圈

> 提取源：prd/prd-spec.md、prd/prd-user-stories.md、docs/proposals/dsh-forge-p1-mvp/proposal.md。
> 目标文件映射为 non-interactive 自动集成裁决（[auto-specs]）。

## 工作区注册一致性

### BIZ-001: 项目注册四步补偿链

**Rule**: 项目注册内聚四步链——① ownership 预检（`registry.list()` 按 canonical path 匹配，命中既有工作区 = 本次「挂接」，`attachedToExisting=true`，不登记补偿）→ ② `registry.create(wsPath)`（幂等）→ ③ 应用库事务写入 `projects` 行（仅本次新建路径登记补偿）→ ④ 第 ③ 步失败或流程窗口内取消且属本次新建 → `registry.delete(workspaceId)` 补偿。
**Context**: 保证 dsh 侧孤儿注册 = 0（SC12），同时绝不误删既有工作区；补偿链内聚在 ProjectService（单一裁决点）。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程一 / tech-design §Interface 1

→ docs/business-rules/workspace-consistency.md

### BIZ-002: ownership 保护（幂等命中不得误删）

**Rule**: 同 canonical path 命中既有工作区（幂等挂接）时，任何失败路径都不得删除该既有工作区——幂等命中不是本次新建，无补偿资格。
**Context**: 「挂接既有」与「本次新建」的补偿资格区分是防误删的关键不变量（SC12 断言：任何失败不删既有）。
**Scope**: [CROSS]
**Source**: prd-user-stories Story 1 AC3 / proposal SC12

→ docs/business-rules/workspace-consistency.md

### BIZ-003: 补偿语义（保数据 + 幂等）

**Rule**: `registry.delete` 补偿只删注册不删数据——保留工作区目录与会话日志；重复补偿为 no-op（幂等）。
**Context**: 补偿目标是清理「注册残留」而非销毁用户数据；dsh registry delete 语义 = 保目录保会话日志（契约面 pin 项）。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程一 / tech-design §契约面清单第 4 项

→ docs/business-rules/workspace-consistency.md

### BIZ-004: 补偿失败处置（记账 + 提示，不自动删）

**Rule**: 补偿调用失败 → app_key_logs 记账日志（warn/error）+ 启动对账提示；孤儿工作区只提示不自动删。
**Context**: 自动删孤儿会与 dsh 侧其他用途冲突；显式留痕 + 人工处置是运行期一致性监控的唯一形态（单机无服务端监控）。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程一 / §Monitoring Requirements

→ docs/business-rules/workspace-consistency.md

### BIZ-005: 启动对账（每次启动）

**Rule**: 每次启动校验 `projects.workspace_id` 与 dsh registry canonical path：匹配通过；失配按 path 找回并单向修引用（记账 warn）；找不回则 `registry.create(ws_path)` 幂等重建后修引用；dsh 有而应用无的孤儿 → 记账 + 提示（不自动删）。
**Context**: 应用库与 dsh 账本是两份事实，启动对账是唯一的周期性收敛点；「单向修引用」防双向覆盖。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程一第 8 步 / tech-design §交互三

→ docs/business-rules/workspace-consistency.md

### BIZ-006: 取消点干净退出

**Rule**: 两段式注册对话框的取消点（返回上一步或直接关闭）均位于 dsh create 之前——干净退出，无任何副作用、无补偿动作。
**Context**: 用户在不可逆动作（create）之前的任何退出都必须零残留（SC13 取消路径断言）。
**Scope**: [LOCAL]
**Source**: prd-spec §Flow Description 流程一第 4 步 / prd-user-stories Story 1 AC2

（留在 feature：注册流程 UI 专属）

## 产品纪律

### BIZ-007: 无投影直读（SC2）

**Rule**: 状态全部直读——项目记录 / 知识索引 / 使用事件来自数据库或缓存直读，会话列表实时读 dsh 账本（零缓存零副本）；禁止 watch/fs 监听驱动的回流模块与快照同步表；知识索引是唯一明文豁免的派生缓存（按需一次性重建，绝不落知识目录）。
**Context**: 投影/回流层是旧线 M1–M4 打磨上限被封死的结构性根因（教训①同源）；直读由 lint 禁令 + 运行断言机械执行。
**Scope**: [CROSS]
**Source**: prd-spec §Goals 无投影纪律 / proposal SC2

→ docs/business-rules/product-discipline.md

### BIZ-008: 只读纪律（SC3 起步）

**Rule**: 应用全程对代码仓与文档位置（forge 目录）零写入；P1 知识目录亦只读（写入 tool 与 UI 编辑分别归 M4 / M6）；以文件系统级监控验证。
**Context**: 工作台是「读取/调度面」而非「写入面」——防与 git/编辑器/用户手工流冲突。
**Scope**: [CROSS]
**Source**: proposal §Non-Functional Requirements / SC-NFR

→ docs/business-rules/product-discipline.md

### BIZ-009: 离线自足（SC-NFR）

**Rule**: 应用自身静态资源与运行时不依赖网络分发——无远程脚本 / 字体 / 样式请求（断言）；agent 模型调用属 dsh 会话域，不在此列。
**Context**: 单机桌面产品的信任基线；也排除 CDN 供应链面。
**Scope**: [CROSS]
**Source**: proposal §Non-Functional Requirements / SC-NFR

→ docs/business-rules/product-discipline.md

### BIZ-010: 无遥测、最小数据追踪

**Rule**: 单机产品无遥测；数据追踪仅两类——使用事件（召回执行点）与补偿/对账记账日志（app_key_logs 关键一致性事件）；无种子数据。
**Context**: 数据面最小化是单机产品边界的一部分；事件仅服务产品内功能（召回 tab / 热度）。
**Scope**: [CROSS]
**Source**: prd-spec §Data Requirements

→ docs/business-rules/product-discipline.md

### BIZ-011: 模型凭证不经手

**Rule**: 模型 API 凭证归 dsh profile 域——产品不经手、不存储、不展示。
**Context**: 安全边界划分：凭证生命周期完全归 dsh，产品零接触面。
**Scope**: [CROSS]
**Source**: prd-spec §Security Requirements

→ docs/business-rules/product-discipline.md

### BIZ-012: 零代码新分支、无数据迁移

**Rule**: 零代码新分支宪法——不迁移旧分支数据，新旧并行直至旧线自然废弃；分支不含旧工作台视图 / 投影层代码（白名单 = 壳层基建与可复用工具 + vendor fallback 与打包/CI 资产模式）。
**Context**: 旧线「上游 home 增强层」路线已废止；迁移旧数据会把旧结构缺陷带入新线。
**Scope**: [CROSS]
**Source**: prd-spec §Data Requirements / proposal SC8

→ docs/business-rules/product-discipline.md

## 知识飞轮

### BIZ-013: 召回事件单表同源与热度口径

**Rule**: 每次召回于执行点写 `knowledge_recall_logs`：一行 = 调用 × 命中条目、`call_id`（uuid）分组、零命中写 `entry_id=NULL` 哨兵行；召回 tab 与卡片热度消费同一单表（单表双消费面）；热度口径 = 按条目 COUNT（search 命中与 read-abstract 各计一次；哨兵行不计）——热度展示必须与计数一致（断言）。
**Context**: 「哪些知识在哪些会话被用了」是飞轮第一圈的核心资产；单表同源杜绝 tab 与热度两套口径漂移（快照字段抗索引重建）。
**Scope**: [CROSS]
**Source**: prd-spec §Flow Description 流程三第 4 步 / tech-design §Interface 2 / §Data Models

→ docs/business-rules/knowledge-flywheel.md

### BIZ-014: frontmatter 最小契约与解析容错

**Rule**: 知识条目必填 `summary`（string）与 `keywords`（string[]）；`title` 缺省 = 文件名去扩展名；`status` 缺省 `draft`；`updated` 缺省取文件 mtime；域 = 目录路径派生（无 frontmatter 字段，单一事实源），层级 ≤3；缺必填或超层的条目不入索引（rebuild 报告计数 + UI 空态提示），硬拒收归 M4 写入面。契约常量唯一源在 `packages/contracts/frontmatter.ts`（应用与技能共享契约的子集）。
**Context**: 应用与 forge 技能共享同一知识文件面，契约须稳定且宽容（知识目录可能被外部工具写入）。
**Scope**: [CROSS]
**Source**: tech-design §frontmatter 最小契约 / packages/contracts/src/frontmatter.ts

→ docs/business-rules/knowledge-flywheel.md

### BIZ-015: 召回定位 = agentic search 工具集 + 摘要先行

**Rule**: 召回能力面定位为与 grep/glob 同位的检索原语，供 agent 自主编排多步检索（`search` → `read-abstract` → …）——产品不做应用侧编排的检索管线；`search` 域前缀为可选参数（agent 依问题自主选域，省略 = 全域）+ 关键词细分；`read-abstract` 摘要先行（返回体不含正文）；系统提示词携带最简知识段（知识库存在声明 + 召回流程指引 + 两 tool 用法），随知识插件交付、产品出契约内容源。
**Context**: brainstorm 显式裁决（2026-10-02）——应用侧检索管线会与 agent 既有 agentic search 流程形成平行模式；摘要先行防正文整段注入。
**Scope**: [CROSS]
**Source**: proposal §Innovation Highlights / prd-spec §Flow Description 流程三第 3 步 / tech-design §Interface 3

→ docs/business-rules/knowledge-flywheel.md
