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
