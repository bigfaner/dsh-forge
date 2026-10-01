---
journey: "project-workbench-home"
step: 4
step-action: "同页核查三区容器"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-workbench-home/journey.md
anchors:
  web:
    page: "项目工作台·右栏 dockkit(C2)+ 代码区(会话/worktree 状态)"
    route: "project(原生 rightbar 多 pane;forge tab kinds = guide/overview/board/doc/depgraph)"
    requires_auth: false
    layout: "右栏概览子 tab:提案/feature/任务/阶段资产;管线入口以导航占位呈现;知识区为扩展位"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-workbench-home / Step 4: 同页核查三区容器

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (右栏 tab 白名单五种可直接枚举;FT-113;空 tab/空视图计数为 0) -->

## Outcome "success"
- Preconditions: "应用处于某活跃项目工作台;该项目含提案/feature/任务/阶段资产数据"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者展开右栏项目概览,依次点开提案/feature/任务/阶段资产子 tab"
- Output: "代码区(会话列表/worktree・工作区状态)与 forge 文件区同页可见;概览子 tab(提案/feature/任务/阶段资产)内容与项目数据一致;管线入口以导航占位呈现;知识区不渲染任何空 tab/空视图/预置数据"
- State: "纯读浏览;tab 开闭纳入右栏布局态"
- Side-effect: "none"
- Invariants: "知识区零空占位 = 空 tab/空视图/预置数据元素计数为 0"

## Outcome "workbench-load-error"
<!-- source: inferred -->
<!-- reasoning: journey Step 4b(UF2 States error;BIZ-resilience-001) -->
<!-- surface-web required_outcomes 映射:network-error → 工作台数据加载失败,呈现为 error 态明确错误 + 重试入口,无数据丢失(UF2 States error) -->
<!-- surface-web required_outcomes 映射:session-expired → 桌面壳无独立登录会话,最近似面 = 宿主/数据通道失联,映射为本步 error 态呈现——明确错误 + 重试入口,恢复后重试可恢复,无数据丢失 -->
- Preconditions: "项目工作台打开时数据加载出错(通道异常/数据缺失,如宿主会话通道不可用)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "工作台数据通道注错/不可用(加载必失败)"
        prerequisite_entity: "Project"
- Input: "编排者察看工作台呈现,并点击重试按钮"
- Output: "明确错误呈现 + 重试按钮(error 态);loading 骨架屏不永久滞留;重试可恢复"
- State: "error 态可经重试恢复;无数据丢失、无半写状态"
- Side-effect: "none"

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
