---
journey: "project-lifecycle-projection"
step: 3
step-action: "归档项目"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3)归档分区 + 生命周期动作·归档"
    route: "project(archiveProject:archived=1;dsh 侧 workspace 保留)"
    requires_auth: false
    layout: "归档后项目行入左栏归档分区(降透明只读,不挂会话);归档行菜单提供恢复/删除"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-lifecycle-projection / Step 3: 归档项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (archiveProject = archived=1 零投影 op;FT-133) -->

## Outcome "success"
- Preconditions: "项目已注册且处于活跃态,含会话与归档前数据;投影 healthy"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "archived"
            value: "承载项目 = false(将归档);其余 ≥1 项目保持活跃"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "承载项目"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者执行归档并确认"
- Output: "forge 侧项目移入归档分区(左栏降透明只读),项目会话列表不再展示(断言);dsh 侧 workspace 保留,会话仍按该项目 workspace 分组(断言,历史可按组找回)"
- State: "archived=1;workspace 不移除(零投影 op);会话分组保持"
- Side-effect: "project_list_changed 事件;零投影推送(必答⑤)"
- Invariants: "归档 ≠ 删除:归档恒保留 workspace 与按项目分组"

## Outcome "archived-partition-cross-project"
<!-- source: journey Step 3b -->
<!-- reasoning: 归档分区在任何活跃项目左栏全项目树中呈现(UF1);listProjects v3 archived 列随行(FT-133) -->
- Preconditions: "存在归档项目,且当前工作台活跃项目为另一项目"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "archived"
            value: "其一 = true(归档),其二 = false(当前活跃)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "归档项目(断言其不在当前工作台呈现)"
- Input: "编排者在当前活跃项目的工作台左栏定位归档分区,展开归档行菜单"
- Output: "归档分区在任何活跃项目的左栏全项目树中均呈现;归档项目降透明只读、不挂会话;行菜单提供恢复/删除;该项目会话不在当前工作台呈现(UF1「不挂会话」断言)"
- State: "纯读巡检;归档态与分区呈现保持"
- Side-effect: "none"

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
