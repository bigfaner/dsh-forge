---
journey: "split-pane-layout-memory"
step: 5
step-action: "离开并重进恢复"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/split-pane-layout-memory/journey.md
anchors:
  web:
    page: "项目工作台·重进恢复(布局记忆重放)"
    route: "project(重放 = open 操作序列:openTab/setRatio 等;恢复态 = 离开前布局)"
    requires_auth: false
    layout: "getProjectUiState(stored:true)→ planLayoutReplay → 各腿(sidebar/rightbar/split/detached)按序重放"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: split-pane-layout-memory / Step 5: 离开并重进恢复

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (重放序列与恢复态断言;FT-116/FT-118/FT-122;e2e 断言 = 恢复态与离开时一致) -->

## Outcome "success"
- Preconditions: "项目已摆出分屏布局(pane 结构/比例/subagent 收起状态/溢出折叠状态)并离开(写盘落库)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "stored"
            value: true
          - field: "rightbar"
            value: "多 pane 结构 + 钳制后比例"
          - field: "tree"
            value: "展开/收起与溢出折叠状态"
- Input: "编排者离开该项目后重进"
- Output: "pane 结构、比例、subagent 收起状态与每组会话溢出折叠状态恢复;无需重新摆布局(恢复态 = 离开前布局)"
- State: "记忆重放后布局与离开前一致;无残留默认姿态覆盖"
- Side-effect: "恢复重放的回声上报不触发写回(避免写回抖动)"

## Outcome "cross-project-layout-isolation"
<!-- source: inferred -->
<!-- reasoning: journey Step 5b(推自必答⑨/UF2 布局记忆按项目存储——按项目隔离即不串扰);project_ui_state 行按 projectId 域(FT-117/FT-119) -->
- Preconditions: "两个项目各自摆过不同布局"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
      - entity_type: "LayoutMemory"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "content"
            value: "两项目各自不同的 pane 结构/比例/收起状态"
- Input: "编排者在两项目间切换并重进"
- Output: "项目间布局互不串扰,各自恢复各自姿态"
- State: "各项目 project_ui_state 行独立;切换时旧项目即时落盘(write-on-leave)"
- Side-effect: "none"

## Outcome "restore-target-missing"
<!-- source: inferred -->
<!-- reasoning: journey Step 5c(推自 BIZ-resilience-001 非致命失败降级不崩溃基线 × 布局记忆随项目语义);重放逐 op 守护,单 op 降级不中止序列(FT-122) -->
<!-- surface-web required_outcomes 映射:validation-error → 恢复时 pane 视图目标非法/损坏(记忆布局指向已删除或不可用的视图实例),呈现为降级空态可替换,不崩溃、不静默 -->
<!-- surface-web required_outcomes 映射:session-expired → pane 操作/恢复期间 dsh 宿主·会话通道失联,pane 内容呈现明确错误 + 恢复引导(重试),不静默 -->
- Preconditions: "记忆布局中某 pane 视图的目标数据已删除;另一同类不可达 = 目标会话已归档(行消失但可经恢复入口找回——归档 ≠ 删除)"
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
            value: "其一 pane 指向已删除的目标(不可解析/不可用),其余 pane 目标健全"
- Input: "编排者重进项目"
- Output: "恢复不崩溃;缺失目标降级呈现(空态/可替换),其余 pane 正常恢复"
- State: "坏 op 计入 degraded(仅日志),序列继续;其余恢复腿完整落地"
- Side-effect: "none"

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
