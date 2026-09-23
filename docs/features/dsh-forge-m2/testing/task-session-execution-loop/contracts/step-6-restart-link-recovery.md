---
journey: "task-session-execution-loop"
step: 6
step-action: "重启应用后回溯挂接"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDetailPanel(挂接历史区)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 6: 重启应用后回溯挂接

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "该任务存在已写入的挂接关系(active)且无历史已结束(ended)挂接行(多历史腿见 multi-history-recovery);应用重启(测试进程等待进程退出 + 单实例锁释放后重新启动)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
    state_requirements:
      - description: "重启前无活跃 dsh-forge 实例(单实例锁已释放,环境性失败排除)"
        prerequisite_entity: "Project"
- Input: "重启应用,重新打开该任务详情,查看挂接状态与历史"
- Output: "任务↔会话挂接关系仍然存在;任务卡显示挂接状态(会话运行中徽标);历史挂接列表可回溯(每条含会话标识/时间)"
- State: "session_links 持久于工作台自有 SQLite(userData 内库文件),重启不丢失;应用退出不收敛 active 行(挂接关系跨启动保留)"
- Side-effect: "none(只读回溯)"
- Invariants: "挂接为工作台自有状态,与 forge 数据不混放"

## Outcome "multi-history-recovery"
- Preconditions: "一个任务历史上先后挂接过多个会话(至少 1 条 active + 1 条 ended 行并存);应用重启后查看"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active 与 ended 各至少一条"
- Input: "用户打开该任务详情查看挂接历史列表"
- Output: "历史挂接列表完整、按时间可回溯(新→旧),每条含会话标识/时间与状态(会话中/已结束);与挂接索引(工作台自有状态读数)一致"
- State: "挂接历史含 ended 行(不删行);排序按开始时间倒序"
- Side-effect: "none(只读)"

## Journey Invariants

- 看板对人只读:全程任何视图不出现任务状态变更的写操作入口(add/claim/transition/submit/reopen)
- forge 数据为唯一事实源:挂接关系只写入工作台自有状态,不写入 forge 数据,不产生第二事实源
- 每笔任务状态变更在看板标记来源([会话]),且与实际操作通道一致
- 状态回流时效:感知链健康时,每笔会话侧变更 ≤5 秒内免手动刷新可见(G3/SC3 口径);破线为降级情形(见 Step 5b)——无专用超时状态,forge 文件恒为事实源,看板快照经重扫/重启重建收敛
- 挂接索引原子性:挂接行仅在会话创建成功后写入,任何失败或中途中断不残留半初始化记录(source: inferred,推自 Interface 5 成功链序)

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
    - entity_type: "SessionLink"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
