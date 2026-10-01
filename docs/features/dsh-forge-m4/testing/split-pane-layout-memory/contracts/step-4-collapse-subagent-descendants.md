---
journey: "split-pane-layout-memory"
step: 4
step-action: "收起 subagent 后代"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/split-pane-layout-memory/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3)·parent 会话行"
    route: "project(行尾 ▾ 递归展开/收起)"
    requires_auth: false
    layout: "subagent 行 ↳ 缩进、默认收起;多级同规则递归;收起状态入随项目记忆的 tree 块"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: split-pane-layout-memory / Step 4: 收起 subagent 后代

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (tree 三集 expandedProjects/expandedSessions/overflowOpen 入 blob;FT-119;归拢断言 SC7 族) -->

## Outcome "success"
- Preconditions: "项目左栏存在带 subagent 后代的 parent 会话"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "role"
            value: "parent 会话(带 subagent 后代)"
      - entity_type: "SubagentSession"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者在左栏 parent 会话行展开/收起 subagent 后代列表"
- Output: "后代默认收起,行尾 ▾ 递归展开;展开时内嵌后代列表呈现、多级同规则递归收起;收起/展开状态记入随项目记忆的布局状态"
- State: "展开集入 tree.expandedSessions;状态随项目记忆"
- Side-effect: "none"
- Invariants: "subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目"

## Outcome "descendants-over-limit"
<!-- source: journey Step 4b -->
<!-- reasoning: LINEAGE_DESCENDANT_LIMIT=20,尾部「查看全部」折叠(必答⑥;FT-107) -->
- Preconditions: "某 parent 会话血缘后代数超上限(默认 20)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "role"
            value: "parent 会话(后代超限)"
      - entity_type: "SubagentSession"
        min_count: 21
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者经行尾 ▾ 展开该 parent 的后代列表"
- Output: "后代列表呈现至上限(20),尾部呈现「查看全部」展开其余后代(必答⑥);超限不破坏归拢——顶层列表仍不出现 subagent 条目,多级递归收起同规则"
- State: "上限截断仅影响呈现;归拢结构不变"
- Side-effect: "none"

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
