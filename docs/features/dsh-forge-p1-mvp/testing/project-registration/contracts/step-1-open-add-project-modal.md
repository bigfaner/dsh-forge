---
journey: "project-registration"
step: 1
step-action: "从 hero 空态打开添加项目流程"
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

# Contract: project-registration / Step 1: 从 hero 空态打开添加项目流程

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（注册前置的 UI 态浏览器可观察；dsh/应用库零变更由探针通道核对） -->

## Outcome "success"
- Preconditions: "应用以零项目状态首用启动，中区呈现 hero 空态；本地存在可浏览的目录层级"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册（canonical path 不命中任何既有工作区）"
    state_requirements:
      - description: "应用零项目首用状态（projects 表零行）；dsh workspace registry 与应用状态库可用，无历史孤儿注册"
        prerequisite_entity: "Project"
- Input: "在中区 hero 空态点击「＋添加项目」CTA"
- Output: "添加项目两段模态打开，处于第一段文件浏览器——目录列表、面包屑与「已注册」标记（ownership 预检可视化）呈现；「下一步」在未选中目录时不可用"
- State: "模态打开态（中区交互锁定于对话框自身）；尚未发生任何注册动作，dsh 侧与应用库零变更"
- Side-effect: "none（仅目录列举读取与项目列表查询）"

## Outcome "cancel-clean-exit"
<!-- 溯源: journey Step 1b（文件浏览器段取消） -->
- Preconditions: "流程处于第一段文件浏览器，尚未进入注册表单；未选中并确认任何目录"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册"
    state_requirements:
      - description: "应用零项目首用状态；取消点存在于对话框内"
        prerequisite_entity: "Project"
- Input: "直接关闭对话框（关闭按钮、Esc 或遮罩点击任一取消意图）"
- Output: "干净退出回工作台 hero 空态——模态关闭、无残留面板或半开状态；hero 与「＋添加项目」CTA 仍在位"
- State: "dsh 侧与应用侧均无残留（未调用 dsh create，无补偿登记，projects 表零行）——无副作用、无补偿动作"
- Side-effect: "none"

## Journey Invariants

- 取消点只存在于两段对话框（返回上一步或直接关闭），均在 dsh create 之前；任何取消后 dsh 侧与应用侧零残留
- 应用库 projects 记录必须携带 workspace 外键，canonical path 为对账 join key
- 左栏会话列表实时读 dsh 账本，零缓存零副本（无投影同步）
- hero 空态仅在项目数 = 0 时呈现；首个项目注册成功后永久让位，不残留

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（未注册候选目录，至少 1 个）＋ 应用零项目首用状态（Project 零行）。逐 Outcome 明细见各 Preconditions 内 fixture_spec。
