---
journey: "project-registration"
step: 4
step-action: "点「确认」提交注册"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/project-registration/journey.md
anchors:
  web:
    page: "添加项目（两段模态流程）"
    route: "modal/add-project"
    requires_auth: false
    layout: "覆盖中区的模态"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: project-registration / Step 4: 点「确认」提交注册

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（执行态 UI 可观察；四步链内部步骤经 registry 探针/应用库直读核对——失败路径断言归 project-registration-compensation Journey） -->

## Outcome "success"
- Preconditions: "第二段表单通过校验（无校验问题，「确认」可用）；目标工作区目录未注册（新建路径）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册（本次为新建路径）"
    state_requirements:
      - description: "dsh workspace registry 与应用状态库可用；无故障注入"
        prerequisite_entity: "Project"
- Input: "点击底部「确认」按钮"
- Output: "进入不可交互中断的注册执行——进度指示呈现，四步链启动（ownership 预检 → dsh create → 应用库写入）；Esc、关闭按钮与遮罩点击统一不再响应（取消点已过）"
- State: "注册执行进行中（新建分支将按需登记补偿）；表单不再可编辑"
- Side-effect: "dsh registry 新建工作区注册（②步）；应用库写入（③步，完成态断言见 Step 5）"

## Outcome "double-confirm-reentry-blocked"
<!-- source: inferred -->
<!-- reasoning: Fact Table（FLOW_PHASES，apps/web/src/flows/add-project/flow-model.ts:50-56 与 flow-actions.ts:77-91——beginExecute 单次进入护栏，非表单态重复触发返回空）——「确认」快速连击/重入为提交面的现实边界，防重复注册链 -->
- Preconditions: "「确认」点击后注册执行已开始（流程已离开表单态）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册（新建路径）"
- Input: "「确认」的快速连击或重复提交尝试（第二次触发落在执行态开始之后）"
- Output: "无第二次注册链启动——执行态单次进入，进度呈现连续不被打断"
- State: "注册执行状态不变；无重复 dsh create、无重复应用库写入"
- Side-effect: "none（相对单次执行而言的增量副作用为零）"

## Journey Invariants

- 取消点只存在于两段对话框（返回上一步或直接关闭），均在 dsh create 之前；任何取消后 dsh 侧与应用侧零残留
- 应用库 projects 记录必须携带 workspace 外键，canonical path 为对账 join key
- 左栏会话列表实时读 dsh 账本，零缓存零副本（无投影同步）
- hero 空态仅在项目数 = 0 时呈现；首个项目注册成功后永久让位，不残留

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（未注册新建路径候选，至少 1 个）＋ registry 与应用库可用。失败与补偿路径由 project-registration-compensation Journey 承载。
