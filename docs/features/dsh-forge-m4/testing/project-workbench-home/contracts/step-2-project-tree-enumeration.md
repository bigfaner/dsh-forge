---
journey: "project-workbench-home"
step: 2
step-action: "左栏全项目树枚举"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-workbench-home/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3)"
    route: "project(全局座位 sidebar.workspaces / sidebar.panellist)"
    requires_auth: false
    layout: "ProjectTreeBrowser(座位注入,行语言自绘);数据 = ctx.workspaces/ctx.sessions + listProjects IPC"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-workbench-home / Step 2: 左栏全项目树枚举

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (listProjects v3 列 archived/sortOrder 注册序可直接比对;FT-133) -->

## Outcome "success"
- Preconditions: "应用处于项目工作台;存在 ≥2 个注册项目(活跃 + 归档),活跃项目含会话数据"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "archived"
            value: "1 个活跃 + 1 个归档"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "活跃项目"
- Input: "编排者查看左栏「项目」区全项目树"
- Output: "全部注册项目可枚举,归档项目呈树内降透明只读分区(不挂会话);项目行带路径健康角标;不存在独立项目列表页入口(项目枚举/切换/归档分区并入左栏)"
- State: "纯读枚举;项目树内容与 forge 项目注册表一致"
- Side-effect: "none"

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
