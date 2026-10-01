---
journey: "project-lifecycle-projection"
step: 4
step-action: "恢复归档项目"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3)归档行菜单·恢复"
    route: "project(restoreProject:archived=0;经 UF1 行菜单)"
    requires_auth: false
    layout: "归档行菜单 → 恢复 → 项目移回活跃区;投影不变化"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-lifecycle-projection / Step 4: 恢复归档项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (restoreProject = archived=0 零投影 op;FT-133) -->

## Outcome "success"
- Preconditions: "项目处于归档态(archived=1),其 workspace 与会话分组在 dsh 侧保持"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "archived"
            value: true
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title"
            value: "与 forge 期望名一致(归档期间从未移除)"
          - field: "orderIdx"
            value: "与 projects.sort_order 一致(归档期间保持)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cwd"
            value: "canonical 落在该项目 workspace 投影路径下(分组经宿主 workspace 派生,非 Session 直挂 project 字段;归档期间分组保持,恢复后不破)"
- Input: "编排者经左栏归档行菜单恢复项目(UF1:恢复/删除经行菜单)"
- Output: "项目移回活跃区;投影不变化(workspace 未移除,会话分组保持)"
- State: "archived=0;dsh 侧零变更(无投影推送)"
- Side-effect: "项目列表变更通知;无投影推送"
  <!-- FT-133:restoreProject = archived=0,投影不变、零投影 op;FT-135:通知经 workbench-events 通道 project_list_changed 载荷 -->
- Invariants: "恢复不触碰投影面(归档期间 workspace 从未移除)"

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
