---
journey: "dual-form-consistency"
step: 2
step-action: "应用会话变更在终端一致"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(与终端 forge task status 输出对拍)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: dual-form-consistency / Step 2: 应用会话变更在终端一致

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "应用侧至少有一个已挂接的会话刚完成对某任务的状态操作;看板已回流该变更;终端可执行 forge task status"
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
      - description: "会话侧操作模拟口径:fixture 任务文件变更 + FORGE_ACTOR 标记透传(FT-045 判定序路径 1;e2e 由测试进程代写);forge task status 由测试进程代查"
        prerequisite_entity: "Task"
      - description: "跨面断言口径:终端输出 = 测试进程直读 fixture forge 文件/stub CLI stdout(浏览器侧不自行观测 CLI 输出)"
        prerequisite_entity: "Task"
- Input: "人在终端执行 forge task status(应用侧挂接会话完成任务操作后)"
- Output: "终端输出与看板展示一致(对拍维度收敛为 forge task status 实际输出项:任务状态/依赖);看板侧来源标记 = [会话](FT-045 判定序:actor 标记或 active 挂接 → session);终端输出是否携带来源维度 UNKNOWN(FT-032 来源为工作台侧字段),不列入双侧对拍维度"
- State: "两侧视图投影自同一 forge 数据(事实源唯一);无分歧窗口残留"
- Side-effect: "none(只读查询)"
- Invariants: "双侧一致 = 同一事实源的直接推论"

## Outcome "high-frequency-terminal-changes"
- Preconditions: "终端侧短时间内连续执行多笔任务状态变更(高频腿;看板保持打开)"
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
            value: "未完成,可供连续多笔变更"
    state_requirements:
      - description: "高频节奏约束:相邻两笔变更间隔大于感知链合流窗(FT-047:变更批 400ms trailing 防抖 + 事件 500ms 合批),每笔变更落入独立重扫窗——「逐笔回流」断言在此节奏下成立"
        prerequisite_entity: "Task"
- Input: "保持看板打开,观察任务状态回流"
- Output: "变更逐笔回流,无丢失、无错误合并;最终状态与 forge 数据一致"
- State: "每笔变更产生独立 task_updated 事件与看板快照更新(FT-046;钉距节奏下防抖/批推合并不吞并不同笔变更,FT-047);最终快照与 forge 文件投影一致"
- Side-effect: "none(工作台只读感知)"

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
    - entity_type: "SessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
