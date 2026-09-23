---
title: "任务操作主体模型"
domains: [workbench, task-operations, read-only-board, change-source, forge-cli]
---

# 任务操作主体模型

### BIZ-task-ops-001: 看板人侧只读,任务写操作归 agent 会话/终端

**Requirement**: 任务状态变更(add/claim/transition/submit/reopen)在应用看板对人侧一律不提供入口;应用内唯一变更通道 = 从任务发起的 agent 会话(执行经 forge CLI);过渡期人在终端的变更与前者并存。每笔变更在看板逐笔标记来源[会话/终端],看板仅呈现、不写回。
**Context**: 双形态一致性(应用/终端/冻结插件共享 forge 数据)+ 唯一事实源纪律(forge 文件为 SoT,应用只读消费);dsh-forge-m2 PRD 操作主体模型确立,M3+ 管线原生化延续此约束。
**Scope**: [CROSS]
**Source**: dsh-forge-m2 prd/prd-spec.md §操作主体模型;design/tech-design.md §Interface 3(来源判定序)

**M3 修订(2026-09-23,PRD 定形,M3 交付后生效)**:操作主体模型定形为——任务状态变更 = **agent 域,经 dsh tool**(零 forge CLI,actor 标识审计);人 = **观察与编排发起**(派发/审批/迁移/偏好),无任务写 UI;终端/冻结 CC 插件 = **未注册项目过渡形态**(已注册项目日常管线零 spawn,SC7 断言)。变更来源标识语义延续(actor 序),「终端」来源收敛为未注册项目外部通道。
**Source**: features/dsh-forge-m3 prd/prd-spec.md §操作主体模型;proposals/dsh-forge-m3/proposal.md 决策日志③

### BIZ-task-ops-002: 变更来源判定序(actor 透传 → 挂接推断)

**Rule**: 每笔任务变更的来源[会话/终端]判定序 = ① 记录 actor 透传槽(FORGE_ACTOR 约定,值形 `session:<sessionId>` 前缀判定 + 字面量 `terminal`;槽位在当前 forge 方言恒空不算异常,forge 仓改造为可选增强、仅覆盖 submit 记录)→ ② 挂接推断兜底(主路径):变更任务存在 status='active' 挂接 → 会话,否则终端。两序均只读消费,不写 forge 数据。
**Context**: 看板逐笔来源标识;actor 值形落地裁决 = `session:<sessionId>`(link 于 launch 成功后才落库,compose 时只有 sessionId;判定侧经 session_links 查询兼容 session:<linkId> 与 session:<sessionId> 两形)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-008(design/tech-design.md §Interface 3/§Interface 6;design/spike-1-findings.md §4;apps/desktop/src/main/workbench/indexer/source.ts)

- 归因载体 = 注入 prompt 末尾追加单行指令(agent 前缀其 forge 调用),prompt 原文不改写(逐字符注入纪律)。
- M3 延续:变更来源标识语义延续 actor 序,「终端」来源收敛为未注册项目外部通道(见上方 M3 修订注记)。
