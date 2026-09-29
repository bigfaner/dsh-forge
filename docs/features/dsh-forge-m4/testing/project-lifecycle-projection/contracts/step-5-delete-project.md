---
journey: "project-lifecycle-projection"
step: 5
step-action: "删除项目(经确认对话)"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md
anchors:
  web:
    page: "项目工作台·删除确认对话(C8 浮层)+ 左栏归档行菜单"
    route: "project(removeProject:buildRemovalPlan 先于行删除 + FK cascade + 拆出窗关闭)"
    requires_auth: false
    layout: "C8 归档/删除确认 Dialog;删除必经确认对话(禁反向写唯一入口纪律)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-lifecycle-projection / Step 5: 删除项目(经确认对话)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (removeProject 语义 + forget 前置 + cascade;FT-133/FT-117/FT-134) -->

## Outcome "success"
- Preconditions: "承载项目处于活跃态(Step 4 恢复后),含会话、布局记忆与归档前数据;其余 ≥1 项目存有布局记忆;dsh 侧 workspace 在位"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "archived"
            value: "承载项目 = false(活跃,将删);其余项目 = false(活跃,另存布局记忆)"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "= 承载项目 anchor canonical(承载项目 workspace 的期望投影路径,删除后移除)"
          - field: "title"
            value: "与 forge 期望名一致(承载项目 workspace)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cwd"
            value: "canonical 落在承载项目 workspace 投影路径下(分组经宿主 workspace 派生,删除后退未分组)"
      - entity_type: "LayoutMemory"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "projectId"
            value: "两行分属不同项目:其一 = 承载项目(删除后清除),其二 = 其余项目(应保持)"
- Input: "编排者对当前活跃的承载项目经确认对话执行显式删除(必答⑤显式支路)"
- Output: "forge 侧项目条目删除;dsh 侧 workspace 移除;会话按 dsh 语义退为未分组且历史不删除;该项目布局记忆随之清除;工作台落到其余项目或空态,不指向已删 id"
  <!-- source: inferred:工作台落点 = UF1「删除当前项目 → 工作台落到其余项目或空态」× BIZ-workbench-002/FT-134(指针同事务清空、不自动激活下一项目)的调和;journey Step 5 同款标注 -->
- State: "forge 项目条目删除,期望快照与布局记忆等自有数据随项目删除一并清除;激活指针随删除清空,不自动激活下一项目"
  <!-- FT-133:buildRemovalPlan 先于行删除组装;级联全集 = er-diagram projects 全部 FK 关系(workspace_projection/project_ui_state/session_links/task_snapshot/feature_snapshot 等 CASCADE);FT-117:forget 前置清除(防 debounce 复活);FT-134:active_project_id 同事务清空 -->
- Side-effect: "删除投影单向推送;该项目全部拆出窗口关闭;项目列表变更通知"
  <!-- FT-135:通知经 workbench-events 通道 project_list_changed 载荷 -->
- Invariants: "删除必经确认对话;确认后不可逆;会话历史永不删除"

## Outcome "archived-delete-branch"
<!-- source: journey Step 5b -->
<!-- reasoning: 必答⑤「删除(归档态或显式)」两支路收敛同一终态(FT-133 removeProject 同语义) -->
- Preconditions: "待删项目处于归档态(不经 Step 4 恢复),dsh 侧 workspace 仍在位"
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
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cwd"
            value: "canonical 落在待删项目 workspace 投影路径下(分组经宿主 workspace 派生,删除后退未分组)"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "projectId"
            value: "= 待删归档项目(删除后级联清除)"
- Input: "编排者经左栏归档行菜单删除并经确认对话"
- Output: "归档分区中该条目移除;dsh 侧终态与显式支路相同——workspace 移除、会话退未分组且历史不删除(两支路收敛同一终态)"
- State: "与显式删除同一终态(条目删除 + workspace 移除 + 布局记忆清除)"
- Side-effect: "删除投影单向推送"
- Invariants: "两支路收敛同一终态"

## Outcome "layout-isolation-others"
<!-- source: inferred -->
<!-- reasoning: journey Step 5c(推自 PRD 数据要求「布局记忆:按项目存储,项目删除时随之清除」);布局记忆按项目域隔离(project_ui_state 行按 projectId;FT-117/FT-119) -->
- Preconditions: "其余活跃项目存有布局记忆(pane 结构/收起状态/拆出窗口集合);承载项目删除已完成"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "archived"
            value: "false(活跃,存活未删除)"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "layoutJson"
            value: "既有 pane 结构/收起状态/拆出窗口集合(删除前姿态,ProjectLayout v1)"
- Input: "编排者重进该其余项目"
- Output: "该项目布局恢复如删除前——布局记忆按项目存储,删除仅清除被删项目自身的记忆,不牵连其余项目"
- State: "其余项目布局记忆原样保持;被删项目布局记忆已随删除清除"
- Side-effect: "none"

## Outcome "confirm-cancel-zero-change"
<!-- source: inferred -->
<!-- reasoning: journey Step 5d(推自 UF8「删除必须经确认对话」:未确认 = 未授权删除) -->
<!-- surface-web required_outcomes 映射:validation-error → 删除确认对话取消映射为零变更退出(与 Step 2c 改名空名同族,设置面输入/确认边界) -->
- Preconditions: "删除确认对话已弹出且处于未决状态(尚未确认、尚未取消)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "archived"
            value: "false(活跃,待删项目仍完整在位)"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title"
            value: "与 forge 期望名一致(零变更对照面)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cwd"
            value: "canonical 落在该项目 workspace 投影路径下(分组对照面,经宿主 workspace 派生)"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者在确认对话点击取消"
- Output: "对话关闭,零变更——项目条目/workspace/会话分组/布局记忆全部保持,不发起任何投影写"
- State: "两侧零变更;确认对话关闭"
- Side-effect: "none"
- Invariants: "取消 = 零变更(未确认 = 未授权删除)"

## Outcome "delete-projection-failure"
<!-- source: inferred -->
<!-- reasoning: journey Step 5e(推自必答④降级流 × 必答⑤删除语义 × BIZ-workbench-001;必答④非阻断清单未列删除,本旅程补全口径,PRD 对账记 open question);relay fire-and-forget 回填竞态 → 终态 no-op(FT-126/FT-133) -->
- Preconditions: "投影通道处于不可写态(workspace 不可写或宿主通道不可达;删除投影写入必经此通道)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "archived"
            value: "false(活跃,承载项目,确认删除)"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "= 承载项目 anchor canonical(期望投影路径,删除重试的目标)"
          - field: "title"
            value: "与 forge 期望名一致(重试删除的对照基线)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cwd"
            value: "canonical 落在承载项目 workspace 投影路径下(重试成功后退未分组,分组经宿主 workspace 派生)"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "投影通道处于不可写态(通道注错或宿主不可达);恢复后可重试"
        prerequisite_entity: "Workspace"
- Input: "编排者经确认对话删除;通道恢复后重试投影"
- Output: "本地删除生效:forge 条目删除、布局记忆清除、快照/挂接等自有数据随删除清除(BIZ-workbench-001 移除语义,级联全集见注释);投影删除保留待重试(降级提示 + 手动重试),恢复后重试成功 → workspace 移除、会话退未分组"
  <!-- 级联全集(er-diagram Relationships,projects FK CASCADE):workspace_projection / project_ui_state / session_links / task / dispatch / task_snapshot / feature_snapshot / prefs / stage_asset / proposal_snapshot / migration_event -->
- State: "forge 行与级联数据已清;删除投影保留待重试;重试成功后 dsh 侧终态与成功支路一致"
- Side-effect: "拆出窗口随删除关闭;降级不静默(提示 + 重试入口)"

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
