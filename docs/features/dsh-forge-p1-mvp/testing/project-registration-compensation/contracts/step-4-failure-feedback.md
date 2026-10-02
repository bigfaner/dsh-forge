---
journey: "project-registration-compensation"
step: 4
step-action: "失败反馈呈现"
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

# Contract: project-registration-compensation / Step 4: 失败反馈呈现

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full（dsh 侧无孤儿 = registry 探针；应用侧无残留 = 左栏项目树 / 应用库直读；记账日志 = 测试侧日志探针，P1 无对账 UI） -->
<!-- fact-note: fact RECONCILE_NOT_AUTO_INVOKED——启动对账当前仅为通道暴露（forge:projects/reconcile），启动期自动调用缝未接线；4b 的「下次启动呈现启动对账提示」为旅程期望，触发缝属缺陷信号/设计裁决点 -->

## Outcome "success"
- Preconditions: "③应用库写入失败且④补偿已成功执行（衔接 Step 3 终态）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "post_state"
            value: "补偿已删除注册（目录与日志保留），应用侧无残留"
- Input: "查看注册流程反馈"
- Output: "失败反馈呈现，含失败原因与补偿结果说明（UF-3「失败」态）——补偿已执行的说明与挂接保护未补偿的文案可区分；dsh 侧无孤儿、应用侧无残留——观察通道断言（registry 探针；左栏项目树无该项目）"
- State: "注册流程终态 = 失败已补偿；模态可经失败态关闭意图退出"
- Side-effect: "none（相对 Step 3 终态无新增副作用）"

## Outcome "compensation-failure-ledger-and-reconciliation-hint"
<!-- 溯源: journey Step 4b（补偿失败走记账与对账提示） -->
- Preconditions: "④补偿调用本身失败（经注入开关触发）"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "孤儿留存（补偿失败，注册仍在 registry）"
    state_requirements:
      - description: "故障注入生效：④registry.delete 补偿调用失败；应用可重启供启动对账断言"
        prerequisite_entity: "Project"
- Input: "重启应用并查看启动对账提示（观察通道：记账日志探针 / 对账报告探针）"
- Output: "补偿失败记入记账日志（error 级 compensation 域条目，说明孤儿留存交由启动对账提示、不自动删）；下次启动呈现启动对账提示——孤儿工作区只提示不自动删（该孤儿为设计终态，口径见 Invariants）"
- State: "孤儿注册按设计保留（该终态不计入「孤儿=0」口径）；对账报告含该孤儿条目；记账日志含补偿失败条目"
- Side-effect: "app_key_logs 写入补偿失败条目（error/compensation）与对账孤儿提示条目（warn/reconcile）"

## Journey Invariants

- 补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）dsh 侧孤儿注册 = 0——SC12 四断言零失败（补偿删除/防误删/补偿幂等/对账提示）；唯一例外 = Step 4b：孤儿按设计保留（只提示不自动删），不计入「孤儿=0」口径
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行 UI 内不可交互中断；宿主级中断（Step 3b 形态）不属交互中断；失败反馈必须同时说明补偿结果

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（已补偿路径）或 Workspace（补偿失败留存的孤儿注册）＋ 故障注入生效态。非 UI 断言观察通道：registry 探针、应用库直读、测试侧日志探针（记账日志）、对账报告探针。
