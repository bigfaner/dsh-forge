---
journey: "project-workbench-home"
step: 5
step-action: "巡检 forge 视图归属与收纳零缩水"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-workbench-home/journey.md
anchors:
  web:
    page: "项目工作台(全量 forge 视图:提案板/feature 任务浏览/阶段资产面板/任务看板)"
    route: "project(看板 = 右栏 board pane 双宿主;概览 = 逃生门单页过渡)"
    requires_auth: false
    layout: "右栏 dockkit 收纳 M3 提案板/阶段资产面板;M2 任务看板保持独立视图(不从属 feature)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-workbench-home / Step 5: 巡检 forge 视图归属与收纳零缩水

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (孤儿视图 0 以应用内全量路由归属枚举核验——枚举口径下沉本 Contract;TabKind 白名单 FT-113) -->

## Outcome "success"
- Preconditions: "应用处于某活跃项目工作台;项目含提案/feature/任务/阶段资产与看板数据(发起链可用)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "StageAsset"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者依次打开提案板、feature/任务浏览、阶段资产面板、任务看板"
- Output: "每个视图均处于项目上下文(孤儿视图为 0,以全量路由归属枚举核验);M2 看板保持独立视图(不从属 feature);M3 提案板/阶段资产面板收纳进 forge 文件区后功能面完整可用(零缩水);发起链原位保留(挂接写入不变)"
- State: "纯读巡检 + 视图切换;各视图功能面与 M3 基线等价"
- Side-effect: "none"
- Invariants: "孤儿视图恒 0(枚举口径:应用内全量路由归属)"

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
