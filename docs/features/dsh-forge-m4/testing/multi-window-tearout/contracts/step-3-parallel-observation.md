---
journey: "multi-window-tearout"
step: 3
step-action: "并行观察与操作"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "主窗口 + 拆出窗口并行(board / conversation 视图)"
    route: "project(主窗)+ WindowRole={kind:'detached'}(拆出窗)"
    requires_auth: false
    layout: "两侧并行观察与操作;同一数据内核的派生视图(TECH-product-arch-003 词汇)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: multi-window-tearout / Step 3: 并行观察与操作

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (两侧窗口操作与状态经 e2e 断言核验:互不干扰 + 同属单实例) -->

## Outcome "success"
- Preconditions: "主窗口与一个独立窗口并行在屏(如主窗会话、独立窗看板)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者在主窗口操作会话、同时在独立窗口操作看板"
- Output: "两侧互不干扰(操作互不抢占、状态互不串扰);两窗口呈现同一数据内核的派生视图"
- State: "两侧状态各自独立演进,数据内核为共同事实源"
- Side-effect: "none"
- Invariants: "数据内核恒为事实源,窗口内容为派生视图"

## Outcome "same-data-parallel"
<!-- source: inferred -->
<!-- reasoning: journey Step 3b(推自数据内核单一事实源 × BIZ-workbench-005 派生面失效-重建传播);两侧镜像同一数据面时状态一致更新 -->
<!-- surface-web required_outcomes 映射:session-expired → 并行观察期间 detached 会话视图所依 dsh 会话通道不可用,拆出窗口内呈现明确错误 + 恢复引导(重试/重连),不静默空白、不丢已呈现内容 -->
- Preconditions: "同一数据面(如同一任务状态面)在主窗口与独立窗口两侧镜像呈现"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "mirrored"
            value: "同一任务状态面在两侧镜像呈现"
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者两侧并行观察与操作该同一数据面"
- Output: "状态以数据内核为事实源,两侧一致更新、互不覆盖互不丢失"
- State: "两侧派生面收敛于同一内核状态"
- Side-effect: "none"

## Outcome "main-switch-no-drag"
<!-- source: journey Step 3c -->
<!-- reasoning: 拆出窗 = 派生快照的显示面、非第二激活——BIZ-workbench-002 单激活指针仅约束主窗(ui-design C10 窗口语义;FT-100 role 携 projectId) -->
- Preconditions: "项目 A 处于 multi-window 态(存在绑定来源项目 A 的拆出窗口),主窗口当前在项目 A;另有项目 B 可切换"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "layout"
            value: "A = 活跃且存在拆出窗;B = 可切换目标"
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "sourceProject"
            value: "项目 A"
- Input: "编排者主窗口经项目切换切到项目 B"
- Output: "A 的拆出窗口仍以 A 上下文渲染(A/B 并行观察);拆出窗 = 派生快照的显示面、非第二激活"
- State: "主窗 active_project_id = B;拆出窗绑定 projectId=A 不变"
- Side-effect: "none"
- Invariants: "单激活指针仅约束主窗"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
