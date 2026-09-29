---
journey: "project-workbench-home"
step: 6
step-action: "重启恢复活跃项目"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-workbench-home/journey.md
anchors:
  web:
    page: "项目工作台(启动首屏恢复)"
    route: "project(视图键;恢复 active_project_id)"
    requires_auth: false
    layout: "AppFrame → ConversationPanel + forge 注入;首屏呈现计时以 500 任务规模计测"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-workbench-home / Step 6: 重启恢复活跃项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (active_project_id 持久化于 app_state 单行;FT-134) -->

## Outcome "success"
- Preconditions: "此前已将活跃项目切到目标项目(Step 3);该项目含 500 任务规模数据"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "active_project_id"
            value: "指向 Step 3 切换后的目标项目"
      - entity_type: "Task"
        min_count: 500
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "目标活跃项目(SC6 计测规模)"
- Input: "编排者退出并重启应用"
- Output: "首屏仍为项目工作台,恢复最后活跃项目(Step 3 切换后的项目);首屏呈现 ≤2s(500 任务规模计测)"
- State: "active_project_id 跨重启持久并恢复指向"
- Side-effect: "none"
- Invariants: "项目工作台恒为启动首屏"

## Outcome "last-active-deleted"
<!-- source: inferred -->
<!-- reasoning: journey Step 6b;指针清除语义 = 移除事务内清空且不自动激活下一项目(FT-134,BIZ-workbench-002) -->
- Preconditions: "应用记住的上次活跃项目已被删除(指针悬挂),其余项目或零项目存在"
  fixture_spec:
    entities:
      - entity_type: "AppState"
        min_count: 1
        field_constraints:
          - field: "active_project_id"
            value: "指向已删除项目的悬挂 id(或已被清空)"
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "其余存活项目(备选落点)"
- Input: "编排者重启应用"
- Output: "首屏落到其余项目或空态(hero 引导);不指向已删项目、无报错残留"
- State: "悬挂指针被清理;active_project_id 落到合法项目或空"
- Side-effect: "none"

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
