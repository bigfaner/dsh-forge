---
journey: "project-registration-compensation"
step: 3
step-action: "第③步应用库写入失败触发补偿"
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

# Contract: project-registration-compensation / Step 3: 第③步应用库写入失败触发补偿

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full（dsh 注册态 = registry 探针 /「已注册」标记；应用侧记录 = 左栏项目树或应用库直读） -->
<!-- fact-note: 故障注入为测试基建契约（fact FAULT_INJECTION_CONTRACT）——③失败在单测经 ws_path UNIQUE 冲突行预置实现，e2e 需建注入缝；语义前置按旅程口径声明 -->

## Outcome "success"
- Preconditions: "②步已完成（新建工作区注册在场，workspaceId 已经 registry 探针捕获）；③应用库写入被注入失败（测试开关令应用库写入失败）"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "本次新建路径（②创建，尚未写入应用库）"
    state_requirements:
      - description: "故障注入生效：③应用库写入失败（测试基建契约通道；无预置冲突行/注入缝则本场景不可达）"
        prerequisite_entity: "Project"
- Input: "注册执行进行中（②已完成），系统级触发故障——经注入开关令③步应用库写入失败"
- Output: "④补偿自动执行，终态——本次新建的工作区注册已删除：观察通道断言该路径无注册、应用侧无残留；工作区目录与会话日志原样保留；「确认」后 UI 内无取消点的约束不受影响"
- State: "dsh 侧该路径注册数归零（孤儿 = 0）；应用库无该项目行；工作区目录与会话日志不变"
- Side-effect: "registry.delete 补偿删除（仅删注册记录，目录与日志保留）"

## Outcome "host-cancel-in-window"
<!-- 溯源: journey Step 3b（流程窗口内取消——宿主级中断） -->
- Preconditions: "②步已执行、③应用库写入尚未完成（流程窗口内，「确认」后的 UI 取消点已过）"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "本次新建路径（②已创建注册）"
    state_requirements:
      - description: "流程窗口内：注册执行进行中、③未完成；应用可终止并可重启"
        prerequisite_entity: "Project"
- Input: "关闭应用窗口/终止宿主进程——「确认」后 UI 内无取消点，「流程窗口内取消」唯一形态 = 宿主级中断（不违「不可交互中断」：该约束限定 UI 交互面）"
- Output: "判定属本次新建 → ④补偿执行删除该注册；重启后经观察通道断言：目录与会话日志保留、该路径无孤儿注册"
- State: "重启后 dsh 侧该路径零注册；工作区目录与会话日志原样；应用库无该项目行"
- Side-effect: "宿主级中断触发补偿删除（registry.delete）"

## Outcome "existing-workspace-protected"
<!-- 溯源: journey Step 3c（同路径既有工作区保护——ownership） -->
- Preconditions: "本次注册经①预检命中既有工作区（幂等挂接，非本次新建，未登记补偿）；后续步骤失败（含应用库写入失败）经注入触发"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "既有注册（挂接目标——不得被误删）"
    state_requirements:
      - description: "故障注入生效：挂接分支的③应用库写入失败"
        prerequisite_entity: "Project"
- Input: "后续任一步骤失败（含应用库写入失败）"
- Output: "既有工作区不被删除——幂等命中不是本次新建，不得误删；registry 探针断言既有注册仍在，既有工作区与其会话不受影响"
- State: "补偿 delete 零调用、记账零写入（挂接分支 ownership 保护）；既有工作区注册保持"
- Side-effect: "none（保护性零删除）"

## Journey Invariants

- 补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）dsh 侧孤儿注册 = 0——SC12 四断言零失败（补偿删除/防误删/补偿幂等/对账提示）；唯一例外 = Step 4b：孤儿按设计保留（只提示不自动删），不计入「孤儿=0」口径
- 补偿只删 registry 注册记录，工作区目录与会话日志一律保留
- 幂等命中（挂接既有工作区）永不登记补偿、任何失败路径下不被删除
- 补偿失败不自动删除孤儿——仅记账日志 + 启动对账提示
- 「确认」后的注册执行 UI 内不可交互中断；宿主级中断（Step 3b 形态）不属交互中断；失败反馈必须同时说明补偿结果

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Workspace（新建路径注册供补偿删除 / 既有注册供保护断言）＋ 故障注入生效态（③写入失败或④前窗口中断）。观察通道：registry 探针、应用库直读、左栏项目树。
