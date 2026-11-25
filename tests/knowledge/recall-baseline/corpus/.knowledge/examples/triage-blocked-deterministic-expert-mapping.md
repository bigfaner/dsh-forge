---
title: 预置坏专家映射确定性触发 triage 走查
summary: >-
  真机走查需要触发 blocked→triage 链时，不依赖 LLM 产任务，启动前在 forge-settings.json 预置
  experts.mapping 坏键（或双坏键构造 spawn 失败态），claim 链 fail-loud 抛 ExpertNotFoundError 进
  triage 阶梯——确定性、可复跑、同一条坏键通路同时覆盖成功链与失败链。
keywords:
  - triage
  - 走查
  - blocked 构造
  - fail-loud
  - 确定性
  - expert mapping
domainPath: .knowledge/examples/
来源容器: triage-progress-row
来源任务: first-pass 知识沉淀（1.10），素材取自 1.5 走查会 record.md
bug id: 无
id: triage-blocked-deterministic-expert-mapping
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 预置坏专家映射确定性构造 blocked 触发 triage 走查

## 场景

triage-progress-row 1.5 批次末走查会：需要真机触发 blocked 任务 → triage 处置 → 进度面板行/台账全链取证，且不能依赖 LLM 自发产出会 blocked 的任务。

## 做法

- **主链（triage 正常 spawn）**：启动前 `forge-settings.json` 预置 `experts.mapping.doc = no-such-profile-key` → doc 型任务 claim 链取 worker 档案 `experts.get(...)` 抛 `ExpertNotFoundError`（fail-loud，消息含键名）→ `onClaimFailLoud` → `runTriageLadder`。triage 映射不预置坏键 = triage-analyst 在场，正常 spawn。
- **spawn 失败态**：`experts.mapping` 预置 `{ triage, doc }` 双坏键 → claim 入阶梯后 triage spawn 被同款 fail-loud 拒绝 ×3 → 终态事件无 workerSessionId，正好构造失败行渲染分支。
- 同一条坏键通路，靠「坏几个键」即可切换成功链/失败链，一轮环境覆盖两条验收线。

## 边界（何时不成立）

- 依赖宿主在场的 fail-loud 语义（resolver 缺档必抛）——若某类 claim 失败是 fail-soft 静默降级，此构造不触发 triage。
- 预置文件写的是启动时点状态，测运行中热改映射的行为不适用。

## 出处

proposals/triage-progress-row/walkthrough/record.md §一（104 主链 + 105 spawnfail 两轮全链复跑 PASS）。
