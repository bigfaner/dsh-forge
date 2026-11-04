---
title: worker 会话 dump 取证——目录为裸 id 无 session- 前缀，session.v4.jsonl.zstd 须解码脚本
summary: >-
  真机取证取 worker 会话 agentOptions 时，会话目录名是裸 `<id>`（无 `session-` 前缀），按
  `sessionLogById` 之类带前缀假设写的探针会漏检。兜底配方：直接读
  `sessions/<ws>--/<id>/session.v4.jsonl.zstd`，用解码脚本解压归档（worker-session-events.json）后逐字段对账。
keywords:
  - worker 会话
  - dump
  - zstd
  - 取证
  - session 目录命名
  - 探针漏检
domainPath: docs/mobile/architecture.md
来源容器: expert-squad-default-routing
来源任务: disc-1 AC4 真机取证（walkthrough/ac4）
bug id: 无
id: worker-session-dump-forensics-recipe
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# worker 会话 dump 的取证配方

## 适用条件

- 需要在 dev 宿主真机核对 spawn worker 实际生效的 agentOptions / route 时。

## 配方

1. 派发前播种配置（volatile patch → loader → config 生效），派发前用面板 chip 计数佐证播种有效（如 `model=34 / inherit=0 / cards=34`）。
2. route 锚：`[forge-spawn-routing]` 日志锚 + `task-spawned` model 双面对账，不单信一面。
3. 会话 dump：目录为裸 `<id>`；带 `session-` 前缀假设的探针会漏检——改从 `sessions/<ws>--/<id>/session.v4.jsonl.zstd` 手动解码归档。
4. 对照锚顺手留：同 run 派一个无覆写子任务作基座对照，旁证覆写键寻址精确性。

## 反例边界

- 档位取值须落在目标模型支持集内：不支持的 reasoning 档（如 glm-5.3-flash 无 medium）会被 `reconcileWorkerReasoning` 剥离，误判为「覆写未生效」。
