---
journey: "task-dispatch-pipeline"
step: 4
step-action: "executor 按简报执行并跑质量门"
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

# Contract: task-dispatch-pipeline / Step 4: executor 按简报执行并跑质量门

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 质量门 = 约束块规定的命令序列执行（compile→fmt→lint→测试），非 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "executor 子会话已以 dispatchPrompt 启动；任务处于 in_progress；简报改动范围明确（ Surgical Changes 纪律在场）"
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
- Input: "executor 按简报执行改动，随后依次执行质量门四步：编译 → 格式 → lint → 测试（严格顺序，遇首个未解决失败即停）"
- Output: "质量门四步全部通过；gate 结果（compile/fmt/lint/test 布尔四项，可选 coverage 小数）可被记录与提交"
- State: "工作区代码变更落盘（改动文件集 = files 清单候选）；每工作区库无变更（gate 载荷在 Step 5 submit 时落账）"
- Side-effect: "工作区文件系统写入（executor 执行改动的本职面）；gate 载荷原样落账不服务内判红——失败分诊归 executor 技能纪律（失败走 blocked 结算）"

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
