---
journey: "fix-chain-auto-recovery"
step: 2
step-action: "创建修复任务（fix 链）"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/fix-chain-auto-recovery/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: ""
---

# Contract: fix-chain-auto-recovery / Step 2: 创建修复任务（fix 链）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — addTask = agent 面 tool 调用，无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "任务 X 已 blocked（Step 1 落账）；executor 持源任务 TaskRef；fix 链深未超上限；无成环依赖构造"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "blocked"
- Input: "executor 调 addTask --block-source 创建修复任务（sourceTask = 任务 X 的 TaskRef，type = coding-fix）"
- Output: "单事务原子完成三件事——fix 任务行（localId = fix-N 前缀分配）+ 依赖边（源→fix，origin='fix-chain'）+ 源任务置 blocked（审计 verb='auto-block'，actor='core'）；三者原子，无半成品"
- State: "每工作区库变更（单事务）：tasks 新增 fix 行（source_task_id = X，task_status = pending）；task_edges 新增 fix-chain 边；task_records 新增 add 行（fix 任务，actor='plugin-tool'）+ auto-block 行（源任务）；features 相位重算"
- Side-effect: "写后事件发射；源任务的 blocked 态与 auto-block 审计同事务落账"
- Invariants: "fix 链三件套原子性：fix 任务行 + 依赖边 + 源任务置 blocked 于单事务完成，任一失败全部不落"

## Outcome "cycle-dependency-rejected"
- Preconditions: "试图构造会成环的依赖（addTask dependsOn 与 block-source 双 flag 组合，使新 fix 任务的依赖 D 经既有出边可达源任务 S）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "roles"
            value: "S = 源任务（block-source 目标）；D = dependsOn 声明的前置，且 D 经既有出边可达 S"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "formsPath"
            value: "D 到 S 的既有出边路径在场（组合后成环）"
- Input: "提交会成环的 addTask（dependsOn 声明 D 且 block-source 指向 S）"
- Output: "拒绝写入并回报完整环路径（错误码 ERR_CYCLE_DETECTED，环节点以 slug/localId 自然键呈现）；无部分写入（无半成品边）"
- State: "零变更（单事务拒绝回滚，边表无环不变量保持）"
- Side-effect: "none"
- Invariants: "task_edges 恒无环：成环写入必被拒绝且回报完整环路径"

## Outcome "chain-depth-exceeded"
- Preconditions: "fix 链深度将超过上限（既有源链长 + 1 > 6，如已存在 6 层嵌套 fix）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 6
        relationship_type: "has_many"
        parent_entity: "Project"
        field_constraints:
          - field: "sourceChainDepth"
            value: "沿 source_task_id 链计数 = 6（已达上限）"
- Input: "提交 addTask --block-source（对链深 6 的任务再挂 fix）"
- Output: "拒绝并提示人工介入（错误码 ERR_CHAIN_DEPTH_EXCEEDED，data 带链诊断 root 先序自然键呈现）；链深 ≤6 守卫成立"
- State: "零变更"
- Side-effect: "none"
- Invariants: "fix 链深度 ≤6：超限拒绝并提示人工介入"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_ADD_TWO_LEVEL_DEDUP（add.ts:238-252、366-385）：任务级去重 = 同源同型且未终态的既有任务直接复用（reused=true，纯读零变更，不重复建链不重复置 blocked）——重复受阻重试 addTask 是 fix 链的一等幂等边界（旅程不变量「两级去重」的合约承载）。 -->
## Outcome "duplicate-fix-reuse"
- Preconditions: "源任务 X 已有同型（coding-fix）未终态的 fix 任务在场（此前一次受阻已建链）；executor 再次提交 addTask --block-source（重复重试）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "has_many"
        parent_entity: "Project"
        field_constraints:
          - field: "roles"
            value: "X = 源（blocked）；F = 既有 fix（source_task_id = X，task_type = coding-fix，非终态）"
- Input: "executor 再次调 addTask --block-source（同源同型）"
- Output: "复用既有 fix 行（返回 reused=true 与既有 taskId），不重复建链、不重复置源 blocked（持久边已承载等待事实）"
- State: "零新增写（纯读命中即返回；不发射事件）"
- Side-effect: "none"

## Journey Invariants

- fix 链三件套原子性：fix 任务行 + 依赖边 + 源任务置 blocked 于单事务完成，任一失败全部不落
- task_edges 恒无环：成环写入必被拒绝且回报完整环路径
- 依赖终态守卫满足集恒为 {completed, skipped}，恢复判定与领取判定同源
- 自动恢复只改状态不删边（verb='auto-restore' 审计在场，边保留）
- fix 链深度 ≤6：超限拒绝并提示人工介入

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
      field_constraints:
        - field: "taskStatus"
          value: "blocked"
    - entity_type: "TaskEdge"
      min_count: 1
```
