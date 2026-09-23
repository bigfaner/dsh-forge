---
journey: "task-session-execution-loop"
step: 7
step-action: "从挂接条目重入会话"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "session"
    route: ""
    requires_auth: false
    layout: "workbench/tasks 详情挂接条目「进入会话」→ 上游 session 视图(壳级切换)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 7: 从挂接条目重入会话

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "该任务存在进行中(active)的挂接会话;任务详情已打开,挂接条目可见且带「进入会话」动作"
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
- Input: "用户在任务详情的挂接条目点击「进入会话」;随后从会话界面返回"
- Output: "跳转主窗口会话界面并定位到该挂接会话(UF5 active 态「进入会话」);从会话界面返回时回到任务看板(返回来源记忆,工作台状态会话期保持)"
- State: "当前视图键切至 session(壳级视图切换);返回后视图键回到 workbench/tasks 且看板/选中任务态保持"
- Side-effect: "none(视图切换不写 forge 数据;挂接状态不变)"
- Invariants: "重入不产生新的挂接行(既有 active 挂接原样使用)"

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
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
