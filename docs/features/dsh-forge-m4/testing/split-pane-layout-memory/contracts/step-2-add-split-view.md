---
journey: "split-pane-layout-memory"
step: 2
step-action: "添加分屏并选视图"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/split-pane-layout-memory/journey.md
anchors:
  web:
    page: "项目工作台·右栏 dockkit·分屏控制(C9)"
    route: "project(工作台头部「分屏」→ 选视图;SplitControls)"
    requires_auth: false
    layout: "两 pane 同屏(如会话 + 看板);可选视图 = 当前项目可用的代码区/forge 文件区视图集"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: split-pane-layout-memory / Step 2: 添加分屏并选视图

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (pane 结构经 openTab(preferNewPane) 落位并采集入 blob;FT-113/FT-119) -->

## Outcome "success"
- Preconditions: "项目处于单视图默认态;项目含会话数据与任务看板/面板数据,工作台头部「分屏」控制可用"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者经工作台头部「分屏」添加 pane,选择视图(会话 + 任务面板/看板组合)"
- Output: "两视图同屏可见且均可操作;可选视图 = 当前项目可用的代码区/forge 文件区视图集"
- State: "右栏进入两 pane 分屏态;pane 结构开始随项目采集记忆"
- Side-effect: "布局写经 800ms 尾随去抖合流为单次写(FT-116)"
- Invariants: "分屏不改变视图本身的功能面(复用同一视图组件)"

## Outcome "view-enum-boundary"
<!-- source: journey Step 2b -->
<!-- reasoning: 知识区为扩展位未启用即不渲染;journey 断言「未启用即不渲染」;blob v1 白名单五种 forge kinds(FT-113/FT-121) -->
- Preconditions: "项目存在未启用的扩展位视图类型(知识区为扩展位、未启用)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "知识区扩展位视图类型未启用"
        prerequisite_entity: "Project"
- Input: "编排者打开视图选择"
- Output: "仅呈现当前项目可用视图(会话/feature 任务面板/看板类);知识区扩展位视图不出现(未启用即不渲染)"
- State: "视图枚举与白名单一致;零扩展位渲染"
- Side-effect: "none"

## Outcome "third-pane-variant"
<!-- source: journey Step 2c -->
<!-- reasoning: 多 pane 变体;比例重分配受钳制约束(FT-114);关闭重排/重加重新记忆(blob panes 开序重放;FT-119/FT-122) -->
- Preconditions: "已处于两 pane 分屏态"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "feature"
            value: "存在 feature 任务面板视图可用"
- Input: "编排者再次经「分屏」追加一个 pane(如 feature 任务面板),随后关闭一个 pane 并重加"
- Output: "三 pane 同屏可操作,比例重分配仍受钳制约束;关闭后其余 pane 自动重排、重加后 pane 集合与比例重新记忆;各 pane 功能面不变(分屏不改变视图本身)"
- State: "pane 集合与比例随实际重排更新并重新入记忆"
- Side-effect: "none"

## Journey Invariants

- 分屏不改变视图本身的功能面(复用同一视图组件)
- 布局状态随项目记忆(pane 结构/比例/subagent 收起状态);项目删除时随之清除
- subagent 后代恒归拢于 parent 血缘树下默认收起,顶层列表永不出现 origin=subagent 条目
- 每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆
- M1 壳行为(托盘/单实例)不受分屏影响
