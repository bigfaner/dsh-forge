---
title: "非致命失败静默降级"
domains: [resilience, silent-degradation, projection-degrade, lineage-degrade, offline, error-handling]
---

# 非致命失败静默降级

## Resilience

### BIZ-resilience-001: 非致命失败静默降级优先(SC2 口径)

**Rule**: 非致命失败(更新检测不可达、通知权限被拒/DND、托盘不可用等)一律静默降级 + 主进程结构化 log(错误码 ERR_* 收敛于本地 log 文件),不弹错、不阻断启动;仅宿主崩溃恢复(UF4)走显式用户面 UI。
**Context**: 离线自足(SC2)与免签名社区工具的「不打扰」基线。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m1 BIZ-002(prd-spec §SC2;tech-design §Error Handling)

- 降级矩阵:更新 feed 不可达 → 无 UI;通知被拒 + 托盘可用 → missedCount++ + 一次性 toast;托盘不可用(Linux)→ 无驻留、关窗即退出;全部保留 log。

**M4 注记(2026-10-01,M4 交付生效)**:新增一族「**可操作降级呈现**」(非纯静默,亦非弹错)——投影降级/偏差 = 概览状态行(StateDot 三态 + [重试投影] 仅 degraded)+ 结构化 log,不弹错、不阻断、不自动重试(重试是用户动作);血缘超时降级 = 静默 + log 仅顶层(本条直接适用);布局 blob 违规 = 重置默认 + log;归档项目不渲染投影状态行(归档不对账,呈现只会制造噪音)。
**Source**: features/dsh-forge-m4 prd/prd-spec.md §Monitoring Requirements;tasks/records/3.5、4.1
