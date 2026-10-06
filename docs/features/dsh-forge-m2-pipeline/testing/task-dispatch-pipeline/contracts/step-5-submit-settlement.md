---
journey: "task-dispatch-pipeline"
step: 5
step-action: "executor 提交结算落账"
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

# Contract: task-dispatch-pipeline / Step 5: executor 提交结算落账

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — submitTask = agent 面 tool 调用，必填字段校验（reason/summary）在动词输入面完成，非 web 表单；其拒绝形态见下方 blocked-reason-required / success-summary-required 两 Outcome（语义等价承载）。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "任务处于 in_progress；质量门四步已全部通过；executor 持有 gate 结果、执行摘要、提交哈希与执行会话 id；success 摘要非空"
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
- Input: "executor 调 submitTask（result=success，携带 gate 结果 / 执行摘要 / 提交哈希 / 执行会话 id / files 清单）"
- Output: "任务落账 completed；返回 { taskId, status, restored }；git 提交产生"
- State: "每工作区库变更：tasks.task_status = completed；task_records 新增 submit 行（files_json/gate_json/commit_hash 结构化负载 + summary + 执行会话 id，actor='plugin-tool'）；若本任务为某些 blocked 后继的终态前置则恢复钩子触发（前置全满足的 blocked 后继 auto-restore）；features 相位重算"
- Side-effect: "git 提交落代码仓（executor 结算的唯一代码仓写入面）；写后事件 emitTasksChanged → 概览单次重取即见 completed"
- Invariants: "每次写动词一行 append-only 审计（submit 记执行会话 id，与 claim 的派发会话 id 相异可判）"

## Outcome "blocked-settlement"
- Preconditions: "executor 执行中质量门未通过或执行受阻；任务处于 in_progress；reason 已备（描述受阻原因）"
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
- Input: "executor 调 submitTask result=blocked（reason 必带）"
- Output: "任务 in_progress→blocked，reason 落审计（task_records.reason 列）；返回 { taskId, status='blocked', restored }"
- State: "tasks.task_status = blocked；task_records 新增 submit 行（reason + 执行会话 id）；blocked submit 不挂恢复钩子；应用自身不发起任何编排动作（web 无编排逻辑，代码审计断言）；插件不注册人类通道 tool（transitionTask / transitionFeature——代码审计 0 注册）"
- Side-effect: "写后事件发射（概览即时见 blocked）；后续 fix 链承接归 fix-chain-auto-recovery 旅程"
- Invariants: "应用零编排——受阻响应由 executor 的下一步动作（addTask --block-source）承接，非应用自发"

## Outcome "blocked-reason-required"
- Preconditions: "executor 提交 blocked 但 reason 缺席（空串或未提供）；任务处于 in_progress"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
- Input: "executor 调 submitTask result=blocked（无 reason）"
- Output: "拒绝提交——错误码 ERR_REASON_REQUIRED（输入面校验先于转移校验）"
- State: "任务状态不变更、不落部分审计（单事务全成全败零残留）"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_SUBMIT_INPUT_VALIDATION（submit.ts:42-48）：success 空 summary → ERR_SUMMARY_REQUIRED，与 blocked 空 reason 同为输入面必带校验——旅程钉死了 blocked 侧（5c），success 侧为其对称边界，代码侦察在场行为。 -->
## Outcome "success-summary-required"
- Preconditions: "executor 提交 success 但执行摘要缺席（空串或未提供）；任务处于 in_progress"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
- Input: "executor 调 submitTask result=success（无 summary）"
- Output: "拒绝提交——错误码 ERR_SUMMARY_REQUIRED（输入面校验先于转移校验）"
- State: "任务状态不变更、不落部分审计（零残留）"
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
```
