---
title: 回放环境失败先证环境前提——最小探针双径对照证伪产品成因
summary: >-
  回放环境（DSH_FORGE_REPLAY_PLAN=1）下 UI 建会话五轮不物化，五轮单点修 UI 径均失败——最小探针 spec 做回放 env /
  非回放 env 同径对照（2 passed 双绿），证伪「回放链拦截」假设；真因为环境前提缺席（profile.dev 安装树未装 → experts
  服务缺席 → inject 永久 pending），与产品代码零关。
keywords:
  - 回放环境
  - 环境前提
  - 双径对照
  - 探针
  - profile.dev
domainPath: .knowledge/lessons/
来源容器: loop-recurrence-hardening
来源任务: fix-2（walkthrough/fix-2-session-precondition-diagnosis.md）
bug id: 850d6a1c（关联环境族先例 1659c9e6）
id: replay-env-failure-check-environment-precondition
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 回放环境失败先证环境前提（fix-2 判例）

## 现象与弯路

回放环境 e2e 中 UI 建会话不物化绑定会话 → 右栏概览入口断言失败。run7-11 五轮沿「UI 径/回放拦截专属成因」方向修，全部失败——环境前提缺席时对产品面做配方排查即误诊（与 commit-exhaustion 判例同构：环境级耗尽，崩在哪看运气）。

## 有效的做法：双径对照探针

1. 写**最小探针 spec**（两个用例：回放 env / 非回放 env 同径对照），只验证最小链路（launch → registerProject → 点「新会话」→ 转录绑定属性 → 入口在场），不载业务断言。
2. 双径全绿 ⇒ 回放链零专属成因，产品/断言门零改动是正确裁定；单径红 ⇒ 才是产品成因。
3. 环境前提缺席的特征链逐环核销：`apps/host/profile.dev` 安装树缺席 → 插件 bundle 不可解析 → 服务缺席 → inject 永久 pending → 上游动作被静默全拒。

## 适用条件

- 失败面在带环境开关（env 标记/replay/probe）的专用环境里复现、通用环境不复现时，先怀疑环境前提，做对照探针。
- e2e 旅程断言对环境前提应 fail-fast（探针验证后在本 spec 前置物化会话，无绑定属性即断言失败、不静默跳过后续断言）。

## 边界（何时不成立）

- 对照探针只证伪/证实「该环境开关的专属成因」；环境前提修复归宿主环境纪律（安装树漂移即复发），不属 spec 侧改动面，不因此改产品代码。
- 单径也红时本判例不适用，走常规产品面诊断。
