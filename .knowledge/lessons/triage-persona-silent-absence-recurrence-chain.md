---
title: fail-soft 装配降级让档案缺席沉默四轮——排查成本远超 fail-loud
summary: triage 处置子代理 persona 档案段缺席连续 4 轮复发才收口，因降级链 fail-soft 零痕迹；档案合成缺档应 fail-loud 含键名，降级必须留诊断日志。
keywords: [triage, persona, 档案, fail-loud, 复发]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
source_bug: ad32e240
---

# persona 沉默缺席：fail-soft 的排查税

## 现象

triage 处置子代理 persona 档案段缺席（persona=no）连续 4 次复发（bug 64f155fe → b16dcdf6 → ad32e240 → 1343ca22 fixed），每轮都要真机取证才能确认「仍缺席」。

## 根因

1. 缺档/装配失败走 fail-soft 降级，子会话静默失去 persona；
2. 上游装配撞车降级（见 convention「装配守卫原子幂等」）无日志，症状与成因跨层错位。

## 避免

- 档案取用缺键 fail-loud 含键名（worker 派发既有语义，triage 同口径）。
- 降级路径必留 emitDiag 痕迹；「症状在下游、成因在上游」时先查装配事件日志再逐轮复测。
