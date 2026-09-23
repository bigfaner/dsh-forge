---
feature: "dsh-forge-m2"
generated: "2026-09-23"
status: draft
---

# Business Rules: dsh-forge M2 — 需求与会话工作台

## 项目模型与数据所有权

### BIZ-001: 项目三分模型与工作台自有状态

**Rule**: forge 项目注册采用三分模型——①代码根目录;②工作台自有状态(项目注册表/挂接索引/视图状态,独立存放,不与 forge 数据混放);③过程文档位置(仓内默认 / 仓外本地路径可选)。仓外文档默认关闭,须注册向导显式选择并显式授权;移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据。
**Context**: 过程资产可不入代码仓(Story6)与数据所有权隔离(PRD 存储约束/DF005);仓外授权须有独立落库通道,入参无旗标可绕过。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §In Scope/§G5/DF005;design/tech-design.md §Interface 1/§Data Models;records/5.14(external 授权动词)

### BIZ-002: 单激活项目模型(注册不自动激活)

**Rule**: 工作台同一时刻至多一个激活项目(app_state 单激活指针 `active_project_id`,应用层事务不变量);注册成功不自动激活——激活是显式独立动词,切换在事务内完成;移除激活项目时指针在同一事务内清空(ui-design 的「自动激活剩余首行」口径与落地实现分歧,已按实现动词裁决记录)。code_root 注册时规范化后 UNIQUE,重复注册 → ERR_PROJECT_EXISTS。
**Context**: 多项目注册 + 单激活切换(G5);并发约束 = 双形态交替操作感知不丢失。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 1;design/er-diagram.md §app_state 注记;records/5.14(注册不自动激活/移除清指针)、5.gate(removeProject divergence documented)

### BIZ-003: 注册校验链(forge 数据检出)

**Rule**: 注册路径必须存在且可读(ERR_CODE_ROOT_UNREADABLE),且检出 forge 数据(`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED,错误引导修正路径或先初始化项目);仓外文档路径必须 ≠ codeRoot(行级 CHECK + ERR_DOC_PATH_CONFLICT),仓外路径须显式授权确认(授权登记持久化,校验链只读登记,无旗标绕过通道)。
**Context**: 注册向导 ≤3 步(G5)与仓外越界防护(PRD 边界约束)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Business Flow 异常流/§Security;design/tech-design.md §Error Handling;records/2.4

## 会话挂接

### BIZ-004: prompt 全量注入与挂接发起侧收敛

**Rule**: 从任务一键发起的 dsh 会话,首条用户消息 = `forge prompt get-by-task-id` 完整输出逐字符注入(100% 自动、零手工粘贴;原文不改写,仅允许追加归因指令行);任务↔会话挂接关系为工作台自有状态,发起成功即持久化、历史可回溯;dsh 会话无终态信号(AgentStatus 二态 idle/running,disposed/archive 均非会话完成),挂接 status→ended 由发起侧收敛,不以宿主信号为判据。
**Context**: G2 一键挂接 + SC3 注入链路;终态不可得为 spike-1 实证结论。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §G2/SC3;design/tech-design.md §Interface 2/§Open Questions;design/spike-1-findings.md;records/4.2

## 性能基线

### BIZ-005: 工作台时效基线

**Rule**: 会话/终端侧任务变更 → 看板免手动刷新可见 ≤5 秒;看板首屏 ≤2 秒(500 任务规模);一键发起到会话界面可交互 ≤3 秒;规模假设 ≤500 任务/项目、≤50 feature/项目、≤20 注册项目。
**Context**: 状态时效(G3)与首屏(G1)的产品级量化口径;CI 计时用宽松阈值防抖动。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Performance Requirements/§Data storage

## 数据一致性与来源

### BIZ-006: forge 文件唯一事实源与双形态不破坏

**Rule**: forge 文件(任务/feature/执行记录)为唯一事实源;应用(含 SQLite 数据内核)只读消费,禁止双写 forge 数据、禁止产生第二事实源;过渡期应用、agent 会话、终端/冻结插件交替操作同一项目,共享同一 forge 数据格式、互不破坏(往返断言);应用侧任务/feature 快照定位为派生缓存,可随时弃重建。
**Context**: SC7 双形态交替验收 + PRD 存储约束(forge 数据格式不变、只读消费)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §DF002/DF003/存储约束/SC7;design/tech-design.md §Overview 事实源纪律

### BIZ-007: 操作主体模型(看板人侧只读)

**Rule**: 任务状态变更(add/claim/transition/submit/reopen)在看板对人侧无入口;应用内唯一变更通道 = 从任务发起的 agent 会话(执行经 forge CLI);过渡期终端变更并存;每笔变更标记来源[会话/终端]。
**Context**: 双形态一致性 + 唯一事实源纪律。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §操作主体模型
**Note**: 已由 docs/business-rules/task-operations.md BIZ-task-ops-001 覆盖(该条 Source 已含本 feature PRD),不重复集成。

### BIZ-008: 变更来源判定序

**Rule**: 每笔任务变更的来源[会话/终端]判定序 = ① 记录 actor 透传槽(FORGE_ACTOR 约定,值形 `session:<sessionId>` 前缀判定 + 字面量 `terminal`;槽位在当前 forge 方言恒空不算异常,forge 仓改造为可选增强,仅覆盖 submit 记录)→ ② 挂接推断兜底(主路径):变更任务存在 status='active' 挂接 → 会话,否则终端。两序均只读消费,不写 forge 数据。归因载体 = 注入 prompt 末尾追加单行指令(agent 前缀其 forge 调用),prompt 原文不改写。
**Context**: 看板逐笔来源标识(PRD 操作主体模型);actor 值形落地裁决 = `session:<sessionId>`(link 于 launch 成功后才落库,compose 时只有 sessionId;判定侧经 session_links 查询兼容两种形)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 3/§Interface 6;design/spike-1-findings.md §4;indexer/source.ts 与 host/actor-env.ts(值形裁决);records/4.2

### BIZ-009: 两级插件启停语义(必备不可禁用)

**Rule**: forge 核心插件 = 必备(不可禁用,无可用禁用通道);第三方插件禁用 → 仅该插件注入内容退出、数据零损坏,重新启用恢复;产品清单条目对运行时启停只读。
**Context**: G6/SC6 两级插件模型。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §G6/SC6
**Note**: 已由 docs/conventions/product-architecture.md TECH-product-arch-001(含 SC6 验收口径 bullet)覆盖,不重复集成。

### BIZ-010: 工作台文案中英双语

**Rule**: 工作台 UI 文案中英双语,经上游 locale 机制提供。
**Context**: 继承 M1 壳级决定。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Compatibility
**Note**: 已由 docs/conventions/ui-reuse.md TECH-ui-reuse-001 bullet(「壳层自有文案中英双语,经上游 locale 机制」)覆盖,不重复集成。
