---
journey: "task-dispatch-pipeline"
step: 3
step-action: "dispatcher 同步派发匿名 executor"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-dispatch-pipeline/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: ""
---

# Contract: task-dispatch-pipeline / Step 3: dispatcher 同步派发匿名 executor

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 派发动作 = dsh 子代理 API 调用（非表单）。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "claimTask 已返回 dispatchPrompt 与 digest；dispatcher 会话持有该简报；executor 子代理可匿名派发"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verb"
            value: "claim"
- Input: "dispatcher 以 dispatchPrompt 为初始提示词同步派发匿名 executor subagent（阻塞等待）"
- Output: "executor 子会话以 dispatchPrompt 为唯一差异化通道启动执行（无 per-spawn 系统提示注入），约束标记原样保留"
- State: "dsh 侧子会话创建（子会话 id 与主会话 id 相异可判——SC6③ 前提）；每工作区库无直接变更"
- Side-effect: "无库写入；executor 后续按简报执行（Step 4）"

## Outcome "submit-from-mismatch-rejected"
- Preconditions: "任务实际状态与动词假设不符（如已被人工转移出 in_progress——转移为 suspended / skipped 等非 in_progress 态）；executor 持有按 in_progress 假设合成的简报"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "非 in_progress（如 suspended）"
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verb"
            value: "claim"
- Input: "executor 调 submitTask 结算（对实际状态非 in_progress 的任务）"
- Output: "拒绝并回报校验提示（from 匹配口径——错误码 ERR_INVALID_TRANSITION，agent 面矩阵先验：仅 in_progress 可提交）"
- State: "库状态不被破坏（单事务拒绝零残留）；任务保持其被人工处置后的状态"
- Side-effect: "none"

## Journey Invariants

- 每次写动词必产生一行 append-only 审计记录：claim 记派发会话 id，submit 记执行会话 id
- 任务状态唯一来源 = 每工作区库状态机（七态转移矩阵）；所有转移经 core 动词 API 单门（UI 与 tool 同门，无第二写者）
- dispatchPrompt 四段构成恒定：人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 快照）+ 类型策略块——executor 唯一差异化通道
- 概览列表数据全部直读每工作区库，无 watch / 回流 / 快照同步模块
- 应用自身不发起编排动作；对代码仓的写入仅限 executor 结算的 git 提交

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
    - entity_type: "TaskRecord"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "verb"
          value: "claim"
```
