---
journey: "dual-form-consistency"
step: 1
step-action: "终端变更回流看板"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(回流呈现)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: dual-form-consistency / Step 1: 终端变更回流看板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "同一 forge 项目同时被应用(已注册激活、看板可进入)与终端(冻结插件/forge CLI)操作;项目内存在可供变更的未完成任务;被变更任务当前无进行中(active)挂接会话(来源判定主路径据此标记[终端]);感知链健康;变更发生时任务看板未处于已打开状态(用户在变更后进入/回到看板查看;已打开看板的到达变更腿见 board-open-change)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "未完成(可 claim/transition)"
    state_requirements:
      - description: "终端侧可对 fixture forge 文件执行真实任务状态变更(测试进程代终端操作)"
        prerequisite_entity: "Task"
      - description: "跨面断言口径:变更事实 = 测试进程直读 fixture forge 文件(浏览器侧不自行观测 CLI/文件系统)"
        prerequisite_entity: "Task"
- Input: "人在终端执行一次任务状态变更,随后回到应用看板查看(不重启应用)"
- Output: "该变更 5 秒内免手动刷新可见,且标记来源[终端]"
- State: "task_snapshot 行更新(状态/时间),source = terminal(判定序:无 active 挂接且无 actor 标记 → terminal);task_updated 事件(属性级)经 dsh-forge:workbench-events 批推送"
- Side-effect: "forge 文件被终端侧变更(工作台只读感知,零写回)"
- Invariants: "变更来源标记与实际操作通道一致"

## Outcome "board-open-change"
- Preconditions: "应用运行中且任务看板处于打开状态(非首次加载;与 success 的进入时序互斥——本边强调看板已打开期间的到达变更);被变更任务无 active 挂接"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "未完成"
- Input: "终端执行任务状态变更,观察已打开的看板"
- Output: "变更 5 秒内可见,无需关闭重开看板、无需手动刷新或重启应用"
- State: "已打开看板的快照经变更事件增量更新(订阅通道批推送);不重建整板"
- Side-effect: "none(工作台只读感知终端变更)"

## Journey Invariants

- forge 数据为唯一事实源:全程不产生第二事实源,双形态交替读写不损坏数据
- 看板免手动刷新:任何一侧的变更 ≤5 秒内在看板可见且标记正确来源([会话]/[终端])
- 工作台自有状态(挂接索引等)与 forge 数据独立存放,互不混写

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
