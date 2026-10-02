---
journey: "project-registration-compensation"
step: 2
step-action: "dsh create 新建工作区并登记补偿"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/journey.md
anchors:
  web:
    page: "添加项目（两段模态流程）"
    route: "modal/add-project"
    requires_auth: false
    layout: "覆盖中区的模态"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: project-registration-compensation / Step 2: dsh create 新建工作区并登记补偿

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full（工作区注册可经 registry 探针直查：workspaceId 按 path 反查） -->

## Outcome "success"
- Preconditions: "新建分支注册执行进行中（①预检已完成未命中）；无故障注入"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "②执行前未注册，②执行后命中新注册"
- Input: "注册执行继续（等待②步完成）"
- Output: "②步（dsh create，幂等）完成——dsh 侧出现本次新建的工作区注册；该 canonical path 命中新注册（workspaceId 为 uuid，即应用库外键素材）"
- State: "补偿已登记（写入失败可回滚删除——新建路径专属）；dsh registry 新增 1 条工作区注册；workspaceId 可经 registry 探针按 path 捕获"
- Side-effect: "dsh registry 写入新工作区注册；补偿登记于流程执行态"

## Outcome "create-idempotent-existing-path"
<!-- source: inferred -->
<!-- reasoning: Fact Table（COMP_DELETE_SEMANTICS/REG_CREATE，packages/core/src/forge/registry.ts:14-23——create 按 canonical path 幂等）——旅程明示「②dsh create，幂等」；同路径重复 create 返回既有注册为幂等性的直接体现，亦为 Step 5b 补偿后重注册走新建分支成功的机制依据 -->
- Preconditions: "目标 canonical path 在 registry 中已存在工作区注册（同路径重复 create 场景）"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "与目标路径一致（已存在注册）"
- Input: "对同一 canonical path 再次执行 dsh create"
- Output: "幂等返回既有工作区（workspaceId 稳定不变），不产生重复注册、不报错"
- State: "registry 注册数不增加；workspaceId 与首次创建一致"
- Side-effect: "none（幂等命中无新增写入）"

## Journey Invariants

- 补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）dsh 侧孤儿注册 = 0——SC12 四断言零失败（补偿删除/防误删/补偿幂等/对账提示）；唯一例外 = Step 4b：孤儿按设计保留（只提示不自动删），不计入「孤儿=0」口径
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行 UI 内不可交互中断；宿主级中断（Step 3b 形态）不属交互中断；失败反馈必须同时说明补偿结果

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（新建路径候选）或 Workspace（同路径既有注册）。观察通道：registry 探针（按 path 反查 workspaceId）、应用库直读。
