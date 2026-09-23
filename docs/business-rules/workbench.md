---
title: "工作台业务规则(项目三分模型 · 单激活 · 会话挂接 · 时效基线 · 单向投影 · subagent 反查)"
domains: [project-registration, three-part-model, doc-location, session-link, prompt-injection, freshness-baseline, single-active, workspace-projection, archive-semantics, subagent-lineage, task-session-binding, executing-state]
---

# 工作台业务规则(项目三分模型 · 单激活 · 会话挂接 · 时效基线 · 单向投影 · subagent 反查)

## Project Registration

### BIZ-workbench-001: 项目三分模型与工作台自有状态

**Rule**: forge 项目注册采用三分模型——①代码根目录;②工作台自有状态(项目注册表/挂接索引/视图状态,独立存放,不与 forge 数据混放);③过程文档位置(仓内默认 / 仓外本地路径可选)。仓外文档默认关闭,须注册向导显式选择并显式授权(授权登记持久化于自有状态,校验链只读登记,无入参旗标绕过通道);移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据。
**Context**: 过程资产可不入代码仓与数据所有权隔离(PRD 存储约束/DF005)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-001(prd/prd-spec.md §In Scope/§G5/DF005;design/tech-design.md §Interface 1/§Data Models)

### BIZ-workbench-002: 单激活项目模型(注册不自动激活)

**Rule**: 工作台同一时刻至多一个激活项目(app_state 单激活指针 `active_project_id`,应用层事务不变量);注册成功不自动激活——激活是显式独立动词,切换在事务内完成;移除激活项目时指针在同一事务内清空(ui-design「自动激活剩余首行」口径与落地实现分歧,按实现动词裁决并记录于 feature records)。code_root 注册时规范化(分隔符/尾斜杠统一)后 UNIQUE,重复注册 → ERR_PROJECT_EXISTS。
**Context**: 多项目注册 + 单激活切换(G5);UNIQUE 比对依赖注册期路径规范化。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-002(design/tech-design.md §Interface 1;design/er-diagram.md §app_state;records/5.14、5.gate)

### BIZ-workbench-003: 注册校验链(forge 数据检出)

**Rule**: 注册路径必须存在且可读(ERR_CODE_ROOT_UNREADABLE),且检出 forge 数据(`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED,错误引导修正路径或先初始化项目);仓外文档路径必须 ≠ codeRoot(行级 CHECK + ERR_DOC_PATH_CONFLICT),仓外路径须显式授权确认且可读(ERR_EXTERNAL_PATH_UNREADABLE)。
**Context**: 注册向导 ≤3 步与仓外越界防护(PRD 边界约束:仅对已注册项目路径执行 forge CLI)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-003(prd/prd-spec.md §Business Flow 异常流/§Security;design/tech-design.md §Error Handling)

## Session Linking

### BIZ-workbench-004: prompt 全量注入与挂接发起侧收敛

**Rule**: 从任务一键发起的 dsh 会话,首条用户消息 = `forge prompt get-by-task-id` 完整输出逐字符注入(100% 自动、零手工粘贴;prompt 原文不改写,仅允许追加归因指令行);任务↔会话挂接关系为工作台自有状态,发起成功即持久化、历史可回溯;dsh 会话无终态信号(AgentStatus 二态 idle/running,disposed/archive 均非会话完成),挂接 status→ended 由发起侧收敛,不以宿主信号为判据。
**Context**: 一键挂接 + 注入链路验收;终态不可得为 spike 实证结论。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-004(prd/prd-spec.md §G2/SC3;design/tech-design.md §Interface 2/§Open Questions;design/spike-1-findings.md)

## Performance Baseline

### BIZ-workbench-005: 工作台时效基线

**Rule**: 会话/终端侧任务变更 → 看板免手动刷新可见 ≤5 秒;看板首屏 ≤2 秒(500 任务规模);一键发起到会话界面可交互 ≤3 秒;规模假设 ≤500 任务/项目、≤50 feature/项目、≤20 注册项目。
**Context**: 状态时效与首屏的产品级量化口径;CI 计时用宽松阈值防抖动。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-005(prd/prd-spec.md §Performance Requirements/§Data storage)

## Workspace Projection & Task-Session Binding

### BIZ-workbench-006: workspaceRegistry 单向投影(权威-投影,归档≠删除)

**Rule**: forge 项目注册表为权威,dsh workspaceRegistry 为单向投影——注册(新增,同名同序)、改名(同步)、归档(workspace 保留,会话仍按项目分组;forge 侧移入归档分区,项目会话列表不再展示)、删除(workspace 移除,会话按 dsh 语义退未分组、历史不删除)四操作同步;任何入口禁止反向写——dsh 侧手改仅对账呈现偏差提示;投影写入失败降级为无投影继续运行,不阻断注册/改名/归档,可手动重试。
**Context**: 双向同步引入双写源与冲突合并;归档≠删除保历史分组可找回(workspaceRegistry 移除语义本身不删会话)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答④⑤;PRD 期裁决 1)

### BIZ-workbench-007: subagent 归拢与任务反查(血缘推断权威,命名辅助)

**Rule**: subagent 会话(origin=subagent)在项目会话列表归拢于 parent 会话血缘树下——顶层永不平铺、默认收起(计数徽标 = 运行中/总数,超上限尾部「查看全部」);任务↔subagent 绑定 = 运行时血缘推断(任务 → session_links active 顶层会话 → 血缘树内后代),不落库、可随时重算;派发 prompt 约定执行 subagent 以「任务 id + title」命名——命名仅辅助可读,与血缘冲突时以血缘为准;多任务共会话场景降级为会话级标注(「该会话执行中」)。
**Context**: 零新协议面、数据完备;回写(任务级精度)后置 M5 派发协议重构。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答⑥;PRD 期裁决 2)

### BIZ-workbench-008: 「执行中」判定(状态 × 挂接正交)

**Rule**: 任务「正在执行」的呈现判定 = status=in_progress 且存在 active 会话挂接;status 与会话挂接为正交事实——in_progress 而无 active 挂接的任务常规展示并标注「未挂接会话」,不得计入执行中突出呈现。
**Context**: 状态生命周期(forge 状态机)与会话挂接(发起侧收敛,见 BIZ-workbench-004)是两个事实源;feature 执行态聚焦与任务反查共用此判定,避免「点执行中任务却无会话可开」的空转。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答⑦;PRD 期裁决 3)
