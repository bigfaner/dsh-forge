---
journey: "split-pane-layout-memory"
step: 1
step-action: "进入单视图默认态"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/split-pane-layout-memory/journey.md
anchors:
  web:
    page: "项目工作台·右栏 dockkit(单 pane 默认态)"
    route: "project(原生 rightbar;forge tab kinds = guide/overview/board/doc/depgraph)"
    requires_auth: false
    layout: "右栏单 pane 默认姿态(基础 pane);无 C9 分屏时无分隔条"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: split-pane-layout-memory / Step 1: 进入单视图默认态

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (无 project_ui_state 行 → stored:false 默认布局,零重放;FT-118) -->

## Outcome "success"
- Preconditions: "已注册项目含会话数据与任务看板/面板数据;该项目此前无布局记忆"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "该项目无 project_ui_state 行(stored:false,首次进入)"
        prerequisite_entity: "Project"
- Input: "编排者打开该项目工作台"
- Output: "内容区单视图呈现(single 默认态);此前无布局记忆时无残留布局"
- State: "默认布局(无重放);首次 seam 报告后将写入首行布局记忆"
- Side-effect: "none"

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
