---
journey: "split-pane-layout-memory"
step: 3
step-action: "拖拽调整 pane 比例"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/split-pane-layout-memory/journey.md
anchors:
  web:
    page: "项目工作台·右栏 dockkit·C9 分隔条"
    route: "project(pane 分隔条拖拽/键盘步进;SplitControls)"
    requires_auth: false
    layout: "分隔条拖拽调比例;钳制 30%–70%(ui-design C9,两侧 pane 最小宽 30%)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: split-pane-layout-memory / Step 3: 拖拽调整 pane 比例

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (钳制常量 0.3–0.7 纯函数;FT-114;widthPct 域 FT-120) -->

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
            value: "两 pane 在屏"
- Input: "编排者拖拽 pane 分隔条调整比例"
- Output: "比例即时生效;各 pane 复用同一视图组件,功能面不变(分屏不改变视图本身)"
- State: "钳制后的比例入布局记忆(拖拽突发经 800ms 尾随去抖合流为一次写)"
- Side-effect: "none"
- Invariants: "分屏不改变视图本身的功能面"

## Outcome "ratio-clamp-extreme"
<!-- source: journey Step 3b -->
<!-- reasoning: SPLIT_RATIO_MIN=0.3/SPLIT_RATIO_MAX=0.7,拖拽与键盘步进全经 clampSplitRatio(FT-114);ui-design C9 最小宽钳制 -->
<!-- surface-web required_outcomes 映射:responsive-layout → pane 比例在窗口尺寸变化下保持可用(最小宽约束),内容不溢出不可读 -->
- Preconditions: "两 pane 比例已处于钳制极限一侧(达最小可读宽度边界)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "rightbar.widthPct"
            value: "已达 30 或 70(钳制极限一侧)"
- Input: "编排者继续将该侧分隔条向极限方向拖拽(并可经键盘步进),随后松手继续操作"
- Output: "比例钳制不再收缩(钳制 30%–70%,两侧 pane 最小宽 30%),不失能、不产生 0 宽死区;松手后布局可继续操作"
- State: "比例恒留在 [30%,70%] 域内"
- Side-effect: "none"

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
