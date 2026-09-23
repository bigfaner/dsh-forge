---
journey: "dual-form-consistency"
step: 4
step-action: "校验 forge 数据一致性"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(校验输入面;SC7 验收脚本由测试进程执行)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: dual-form-consistency / Step 4: 校验 forge 数据一致性

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "Step 3 交替操作已完成(双侧多笔读写向变更已发生);SC7 验收脚本可运行(测试进程执行往返断言)"
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
            value: "已经历双形态交替变更"
    state_requirements:
      - description: "跨面断言口径:一致性校验 = 测试进程对 fixture forge 数据运行 SC7 验收脚本往返断言(浏览器侧不自行观测文件系统)"
        prerequisite_entity: "Project"
- Input: "对交替操作后的 forge 数据运行一致性校验(SC7 验收脚本往返断言)"
- Output: "无第二事实源、无数据损坏(校验通过:任务状态/记录/索引结构与 forge 方言自洽,往返投影无损)"
- State: "forge 数据结构完整;工作台自有状态与 forge 数据分离存放(校验含混写检测)"
- Side-effect: "none(校验只读)"
- Invariants: "唯一事实源不被双形态交替破坏"

## Outcome "offline-terminal-changes"
- Preconditions: "应用未启动时,终端侧已执行任务状态变更(应用离线窗口内的变更)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "应用未运行期间终端侧完成变更(测试进程先变更后启动应用)"
        prerequisite_entity: "Task"
- Input: "启动应用并打开任务看板"
- Output: "既有变更在初始加载时正确反映(首次注册/启动扫描既有 forge 数据建立视图)"
- State: "启动全量扫描建立派生快照(快照 = forge 数据投影,与离线前快照无关);无遗漏变更"
- Side-effect: "none(启动扫描只读)"
- Invariants: "离线变更不丢失、不误标"

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
