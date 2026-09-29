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
          - field: "status"
            value: "承载项目 = 活跃(将删);其余项目 = 活跃且另存布局记忆"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "承载项目"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "承载项目(删除后应退未分组)"
      - entity_type: "LayoutMemory"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "scope"
            value: "其一 = 承载项目(应清除),其二 = 其余项目(应保持)"
- Input: "编排者对当前活跃的承载项目经确认对话执行显式删除(必答⑤显式支路)"
- Output: "forge 侧项目条目删除;dsh 侧 workspace 移除(断言);会话按 dsh 语义退为未分组且历史不删除(断言);该项目布局记忆随之清除;工作台落到其余项目或空态,不指向已删 id"
- State: "forge 行删除(删除 plan 先于行删除组装);期望集 FK cascade;布局记忆 forget 前置清除;active_project_id 同事务清空(不自动激活下一项目)"
- Side-effect: "投影 delete 单向推送;该项目全部拆出窗口关闭;project_list_changed 事件"
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
- Input: "编排者经左栏归档行菜单删除并经确认对话"
- Output: "归档分区中该条目移除;dsh 侧终态与显式支路相同——workspace 移除、会话退未分组且历史不删除(断言:两支路收敛同一终态)"
- State: "与显式删除同一终态(条目删除 + workspace 移除 + 布局记忆清除)"
- Side-effect: "投影 delete 单向推送"
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
          - field: "status"
            value: "其余存活项目(未删除)"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "content"
            value: "既有 pane 结构/收起状态/拆出窗口集合(删除前姿态)"
- Input: "编排者重进该其余项目"
- Output: "该项目布局恢复如删除前——布局记忆按项目存储,删除仅清除被删项目自身的记忆,不牵连其余项目"
- State: "其余项目 project_ui_state 行原样保持;被删项目行已级联清除"
- Side-effect: "none"

## Outcome "confirm-cancel-zero-change"
<!-- source: inferred -->
<!-- reasoning: journey Step 5d(推自 UF8「删除必须经确认对话」:未确认 = 未授权删除) -->
<!-- surface-web required_outcomes 映射:validation-error → 删除确认对话取消映射为零变更退出(与 Step 2c 改名空名同族,设置面输入/确认边界) -->
- Preconditions: "删除确认对话已弹出,操作者选择取消"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "待删项目仍完整在位"
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
- Preconditions: "删除确认时投影写入失败(workspace 不可写或宿主通道不可达)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "承载项目(确认删除)"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "投影通道不可写(通道注错/宿主不可达)"
        prerequisite_entity: "Workspace"
- Input: "编排者经确认对话删除;通道恢复后重试投影"
- Output: "本地删除生效:forge 条目删除、布局记忆清除、快照/挂接等自有数据级联随清;投影删除保留待重试(降级提示 + 手动重试),恢复后重试成功 → workspace 移除、会话退未分组"
- State: "forge 行与级联数据已清;delete plan 保留待重试;重试成功后 dsh 侧终态与成功支路一致"
- Side-effect: "拆出窗口随删除关闭;降级不静默(提示 + 重试入口)"

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
