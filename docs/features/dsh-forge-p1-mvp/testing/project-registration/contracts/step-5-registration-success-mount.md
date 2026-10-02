---
journey: "project-registration"
step: 5
step-action: "确认注册成功与左栏挂载"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/project-registration/journey.md
anchors:
  web:
    page: "工作台·会话视图（默认态）"
    route: "workbench/session"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: project-registration / Step 5: 确认注册成功与左栏挂载

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full（注册记录与外键可经应用库直读；工作区注册可经 registry 探针核对） -->

## Outcome "success"
- Preconditions: "注册执行四步链全部完成（新建路径成功，无故障）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "注册前未注册（本次新建，执行后命中新注册）"
    state_requirements:
      - description: "注册执行已完成且成功（衔接 Step 4 终态）"
        prerequisite_entity: "Project"
- Input: "等待注册执行完成"
- Output: "成功反馈呈现（新建工作区说明）并自动关闭模态；左栏出现该项目及其 dsh 会话列表（实时读 dsh 账本，零副本）；hero 空态永久隐退，不残留"
- State: "注册记录落应用数据库（含 workspace 外键；canonical path 为对账 join key）；应用项目数由 0 变为 1；dsh registry 存在该工作区注册"
- Side-effect: "应用库写入 projects 行；dsh registry 新增工作区注册"

## Outcome "second-project-via-tree"
<!-- 溯源: journey Step 5b（项目态下经项目树「＋」再次添加项目） -->
- Preconditions: "已有至少一个项目，工作台处于项目态（hero 已隐退）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "archived"
            value: "false（在册项目）"
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "registration_state"
            value: "未注册（待新增的第二个项目候选）"
- Input: "点左栏项目树「＋」打开添加项目流程并完成注册"
- Output: "同一两段式流程可用（入口等价）；注册成功后左栏项目树新增该项目，多项目并存，hero 不再出现"
- State: "应用项目数加 1；新旧项目记录并存（各携 workspace 外键）；hero 相位因项目数大于 0 不再呈现"
- Side-effect: "应用库写入新 projects 行；dsh registry 新增对应工作区注册"

## Journey Invariants

- 取消点只存在于两段对话框（返回上一步或直接关闭），均在 dsh create 之前；任何取消后 dsh 侧与应用侧零残留
- 应用库 projects 记录必须携带 workspace 外键，canonical path 为对账 join key
- 左栏会话列表实时读 dsh 账本，零缓存零副本（无投影同步）
- hero 空态仅在项目数 = 0 时呈现；首个项目注册成功后永久让位，不残留

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（新建候选）＋ Project（第二场景需既有在册项目，WorkspaceDirectory 与新候选并置）。注册终态断言经 registry 探针与应用库直读双通道。
