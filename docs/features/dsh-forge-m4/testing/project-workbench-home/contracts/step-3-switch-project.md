---
journey: "project-workbench-home"
step: 3
step-action: "点击项目行切换工作台"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-workbench-home/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3,原位切换)"
    route: "project(视图键内切换,不跳页)"
    requires_auth: false
    layout: "左栏项目行点击 → 整台跟随(左栏会话组/中间会话面板/右栏项目概览)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-workbench-home / Step 3: 点击项目行切换工作台

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (active_project_id 单行指针可直接核验;FT-134) -->

## Outcome "success"
- Preconditions: "应用处于项目 A 工作台;项目 B 亦已注册且含会话/worktree 状态/任务数据"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "active"
            value: "当前活跃 = A,待切换目标 = B"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "项目 B(切换后应呈现的数据面)"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "项目 B"
- Input: "编排者点击左栏项目 B 的项目行"
- Output: "工作台整台跟随切换——左栏会话组、中间会话面板、右栏项目概览均切到项目 B;切换即时生效并被记住(重启恢复目标项目)"
- State: "active_project_id 由 A 改写为 B;无项目 A 内容残留(整台跟随语义)"
- Side-effect: "project_list_changed 事件族(激活指针事务内落位)"
- Invariants: "单激活指针:任意时刻至多一个 active_project_id(FT-134)"

## Outcome "path-degraded-switch"
<!-- source: inferred -->
<!-- reasoning: journey Step 3b(推自 UF1 path-degraded 角标可见提示 × BIZ-resilience-001 非致命失败不打断呈现);侦测事实面 = DetectReport readable/gitRoot(FT-131) -->
- Preconditions: "目标项目 B 已注册,但其代码区/forge 文件区路径探测失败(路径健康 degraded,如目录已不可读)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "target"
            value: "B 路径健康 degraded(目录不可达/不可读)"
- Input: "编排者点击该路径异常项目 B 行"
- Output: "切换完成且项目行路径健康角标提示异常;工作台不白屏、不静默失败"
- State: "active_project_id 切到 B;降级以角标呈现,不回滚切换"
- Side-effect: "none"

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
