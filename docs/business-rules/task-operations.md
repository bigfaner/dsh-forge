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
