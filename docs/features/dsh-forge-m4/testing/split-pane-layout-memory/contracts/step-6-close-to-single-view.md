---
journey: "split-pane-layout-memory"
step: 6
step-action: "关闭分屏回到单视图"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/split-pane-layout-memory/journey.md
anchors:
  web:
    page: "项目工作台·右栏 dockkit·pane 关闭"
    route: "project(关闭 pane → 重排 → 单视图)"
    requires_auth: false
    layout: "关闭一个 pane 至单视图;布局记忆更新为当前结构"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: split-pane-layout-memory / Step 6: 关闭分屏回到单视图

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (blob panes 随实际更新;重进不恢复已关闭 pane;FT-119/FT-122) -->

## Outcome "success"
- Preconditions: "工作台处于两 pane 分屏态"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "rightbar.panes"
            value: "两 pane 在屏(将关至单视图)"
- Input: "编排者关闭一个 pane 至单视图"
- Output: "回到单视图呈现;布局记忆更新为当前结构"
- State: "记忆与实际一致(单 pane 结构)"
- Side-effect: "none"

## Outcome "all-closed-reenter"
<!-- source: journey Step 6b -->
<!-- reasoning: 记忆与实际一致口径;单 pane 无 split-ratio 重放腿(≥2 pane 才重放比例;FT-122) -->
- Preconditions: "已关闭全部分屏至单视图并离开(记忆已更新为单视图)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "rightbar.panes"
            value: "单 pane(分屏已全部关闭)"
- Input: "编排者重进项目"
- Output: "重进恢复单视图(记忆与实际一致),不恢复已关闭的 pane"
- State: "恢复态 = 离开前单视图姿态"
- Side-effect: "none"

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
