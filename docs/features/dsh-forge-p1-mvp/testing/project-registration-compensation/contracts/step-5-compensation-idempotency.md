---
journey: "project-registration-compensation"
step: 5
step-action: "补偿幂等（重复补偿为 no-op）"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: project-registration-compensation / Step 5: 补偿幂等（重复补偿为 no-op）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- anchors 注记: 本步为系统级重放/对账/重启场景，无明确 web 页面对应——锚点留空（不猜测）；5b 重注册段经 modal/add-project 与左栏（workbench/session）行使 -->
<!-- state-verification: full（registry 探针 + 应用库直读 + 对账报告探针） -->
<!-- fact-note: fact RECONCILE_NOT_AUTO_INVOKED——启动对账当前仅为通道暴露，启动期自动调用缝未接线；5c/5d 的重启触发为旅程期望（缺陷信号/设计裁决点） -->

## Outcome "success"
- Preconditions: "同一 workspaceId 已完成过一次补偿删除（②后经 registry 探针捕获的 id）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "post_state"
            value: "注册已被补偿删除（该 id 在 registry 中不存在）"
- Input: "系统级重放——经测试开关对同一 workspaceId 再触发一次补偿（模拟补偿重入）"
- Output: "重复补偿为 no-op——不产生二次删除、不报错、不波及目录与会话日志"
- State: "registry 状态与重放前一致（删除未知 id 返回未命中而非错误）；目录与会话日志不变"
- Side-effect: "none（幂等 no-op）"

## Outcome "retry-registration-same-path"
<!-- 溯源: journey Step 5b（补偿后重试注册同一路径）；source: inferred（重试成功非 PRD 原文，派生自①按 canonical path 匹配 + ②幂等——补偿删除后重注册不再命中既有、重走新建分支成功；「孤儿=0」为 SC12/PRD Goal 原文） -->
- Preconditions: "上一次注册已完整补偿（衔接 Step 3–4 同场景终态：dsh 侧无孤儿）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "补偿后未注册（可重走新建分支）"
- Input: "重新走添加项目流程，注册同一工作区路径"
- Output: "注册成功，dsh 侧与应用侧记录一致（观察通道断言：注册存在、左栏出现项目、外键一致）；本场景全流程后孤儿注册 = 0"
- State: "registry 新注册 + 应用库 projects 行（workspace 外键一致）；场景终态孤儿 = 0"
- Side-effect: "dsh registry 新增工作区注册；应用库写入 projects 行"

## Outcome "drift-repair-on-startup"
<!-- 溯源: journey Step 5c（启动对账修复引用漂移；漂移态经注入契约预置） -->
- Preconditions: "应用库 projects 记录的 workspace_id 与 registry 实际 canonical path 失配（引用漂移；漂移态经注入契约预置）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "workspace_id"
            value: "与 registry 实际按 ws_path 的注册失配（漂移预置）"
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "与该 Project 的 ws_path 一致（按 path 找回的锚）"
- Input: "重启应用（触发启动对账）"
- Output: "启动对账校验 workspace_id 与 canonical path，失配按 path 找回（单向修引用——仅修应用侧引用，不改 dsh 侧）；项目记录恢复一致"
- State: "projects 行 workspace_id 更新为按 ws_path 找回（relinked）或幂等重建（recreated）的工作区 id；对账报告含 repaired 条目"
- Side-effect: "应用库 UPDATE projects 引用修复；relinked 情形写 reconcile 域 warn 记账"

## Outcome "no-drift-startup-silent"
<!-- source: inferred -->
<!-- reasoning: Fact Table（RECONCILE_REPAIR/FACT_RC_4，packages/core/src/forge/project-service.ts:284-344——无失配不产生修复条目、无孤儿不产生孤儿提示，relinked 才写 warn 日志）——对账提示特异性防 vacuous-pass：4b 的提示应仅在孤儿在场时出现，正常重启的静默通过为其反断言 -->
- Preconditions: "应用库与 registry 引用一致（无漂移、无孤儿——正常终态）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "has_one"
        parent_entity: "Project"
        field_constraints:
          - field: "reference_integrity"
            value: "一致（workspace_id ↔ canonical path 匹配，无孤儿）"
- Input: "重启应用"
- Output: "启动对账静默通过——无孤儿提示、无引用修复动作（对账报告 repaired 与 orphans 均为空，无 reconcile 域提示呈现）"
- State: "两侧行不变；无 reconcile 域记账写入"
- Side-effect: "none"

## Journey Invariants

- 补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）dsh 侧孤儿注册 = 0——SC12 四断言零失败（补偿删除/防误删/补偿幂等/对账提示）；唯一例外 = Step 4b：孤儿按设计保留（只提示不自动删），不计入「孤儿=0」口径
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行 UI 内不可交互中断；宿主级中断（Step 3b 形态）不属交互中断；失败反馈必须同时说明补偿结果

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（补偿后路径）、Project＋Workspace（漂移预置 / 一致终态两类，互斥场景独立启动）。观察通道：registry 探针（workspaceId 按 path 反查）、应用库直读、对账报告探针、测试侧日志探针。
