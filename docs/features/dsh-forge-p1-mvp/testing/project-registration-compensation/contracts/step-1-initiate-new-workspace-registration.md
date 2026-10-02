---
journey: "project-registration-compensation"
step: 1
step-action: "发起一次新建工作区注册"
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

# Contract: project-registration-compensation / Step 1: 发起一次新建工作区注册

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（预检判定分支浏览器不可直接观察；分支结果经后续步骤的 registry 探针间接断言） -->

## Outcome "success"
- Preconditions: "存在一个未注册的目标目录（canonical path 不命中既有工作区，本次为新建路径）；dsh workspace registry 与应用状态库可用"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册（canonical path 不命中 registry）"
    state_requirements:
      - description: "场景隔离：专属新建路径，不与其他场景路径重叠；无故障注入"
        prerequisite_entity: "Project"
- Input: "打开添加项目流程，文件浏览器选定未注册目录，注册表单点「确认」"
- Output: "四步链启动——ownership 预检（registry.list 按 canonical path 匹配）未命中既有工作区，判定本次为「新建」而非「挂接」；注册执行进入不可交互中断态"
- State: "注册执行处于新建分支（后续②步将登记补偿）；预检为 registry 读取，无写副作用"
- Side-effect: "none（预检只读）"

## Outcome "attach-branch-selected"
<!-- source: inferred -->
<!-- reasoning: Fact Table（REG_PRECHECK，packages/core/src/forge/project-service.ts:67-68——命中即 attachedToExisting、②整步跳过；104-110 挂接不登记补偿）——Step 1 判定面的另一半取值（挂接分支），为 Step 3c ownership 保护断言提供前置分支；与兄弟 Journey project-registration Step 2b 的挂接 happy path 同源不同焦（本 Journey 聚焦失败保护） -->
- Preconditions: "候选目录 canonical path 命中 registry 既有工作区（浏览器行带「已注册」标记）"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "与候选目录 canonical path 一致（既有注册，供 ownership 保护断言）"
- Input: "打开添加项目流程，选定该已注册目录，注册表单点「确认」"
- Output: "预检命中既有工作区，判定为「挂接」——②dsh create 整步跳过（不新建工作区）；「已注册」标记与挂接语义一致"
- State: "挂接分支不登记补偿（后续任何失败不删既有工作区——Step 3c 断言基础）"
- Side-effect: "none（预检只读）"

## Journey Invariants

- 补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）dsh 侧孤儿注册 = 0——SC12 四断言零失败（补偿删除/防误删/补偿幂等/对账提示）；唯一例外 = Step 4b：孤儿按设计保留（只提示不自动删），不计入「孤儿=0」口径
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行 UI 内不可交互中断；宿主级中断（Step 3b 形态）不属交互中断；失败反馈必须同时说明补偿结果

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（未注册新建路径）或 Workspace（已注册既有工作区），按 Outcome 取其一；场景隔离要求各场景专属新建路径互不重叠。故障注入通道为测试基建契约（fact FAULT_INJECTION_CONTRACT：经依赖缝实现，非 shipped 代码）。
