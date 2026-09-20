---
title: "非致命失败静默降级"
domains: [resilience, silent-degradation, offline, error-handling, startup]
---

# 非致命失败静默降级

## Resilience

### BIZ-resilience-001: 非致命失败静默降级优先(SC2 口径)

**Rule**: 非致命失败(更新检测不可达、通知权限被拒/DND、托盘不可用等)一律静默降级 + 主进程结构化 log(错误码 ERR_* 收敛于本地 log 文件),不弹错、不阻断启动;仅宿主崩溃恢复(UF4)走显式用户面 UI。
**Context**: 离线自足(SC2)与免签名社区工具的「不打扰」基线。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m1 BIZ-002(prd-spec §SC2;tech-design §Error Handling)

- 降级矩阵:更新 feed 不可达 → 无 UI;通知被拒 + 托盘可用 → missedCount++ + 一次性 toast;托盘不可用(Linux)→ 无驻留、关窗即退出;全部保留 log。
