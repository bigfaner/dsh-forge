---
journey: "dual-form-consistency"
step: 3
step-action: "双形态交替操作"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(交替回流呈现)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: dual-form-consistency / Step 3: 双形态交替操作

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "同一项目双形态就绪(应用看板打开 + 终端可操作 + 应用侧挂接会话可用);交替操作均为既有任务的属性级状态变更(无同时同任务操作、无任务集结构性增删、挂接会话不结束)"
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
            value: "未完成,可供多笔交替变更"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
    state_requirements:
      - description: "终端侧操作由测试进程代执行;会话侧操作以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟"
        prerequisite_entity: "Task"
- Input: "双形态交替各执行至少 1 次读写向变更操作(终端与挂接会话轮流对任务执行操作)"
- Output: "每笔变更在看板与终端双侧均正确反映,变更来源逐笔标记正确([会话]/[终端])"
- State: "每笔变更一次 task_updated 事件 + 快照 upsert;来源槽逐笔更新(会话侧 = actor 标记或 active 挂接推断;终端侧 = 无 active 挂接的终端变更)"
- Side-effect: "forge 文件被双侧操作变更(工作台零写回)"
- Invariants: "来源标记逐笔正确;不产生第二事实源"

## Outcome "simultaneous-late-op-rejected"
- Preconditions: "终端与挂接会话几乎同时对同一任务发起操作,且后到操作不满足 forge 状态机前置(如对已完成转移的任务再次 claim)"
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
            value: "处于仅一笔操作可满足前置的状态"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
- Input: "双侧各执行一次任务操作(几乎同时;后到者前置不满足)"
- Output: "forge 状态机保证一致性;后到操作按 forge 状态语义处理——被 CLI 拒绝(拒绝反馈到达发起侧);无数据损坏"
- State: "任务状态 = 先到操作的合法结果;双侧视图一致反映先到操作;无半写状态"
- Side-effect: "none(拒绝操作不落部分变更)"
- Invariants: "无数据损坏(唯一事实源不被并发写坏)"

## Outcome "simultaneous-late-op-accepted"
<!-- source: inferred:后到操作合法分支与被拒分支同源——journey Step 3b「后到操作按 forge 状态语义处理(如未满足前置则被 CLI 拒绝)」隐含合法分支顺序生效;forge 状态机为唯一裁决者,顺序语义由写入时序决定 -->
- Preconditions: "终端与挂接会话几乎同时对同一任务发起操作,且后到操作按 forge 状态语义仍合法(状态机允许顺序执行)"
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
- Input: "双侧各执行一次任务操作(几乎同时;两笔按到达序均合法)"
- Output: "两笔操作按到达顺序生效;双侧视图最终一致反映两笔结果;无数据损坏"
- State: "任务状态 = 两笔操作的顺序合成结果;快照经事件回流收敛至该结果"
- Side-effect: "none"
- Invariants: "无数据损坏;双侧最终一致"

## Outcome "structural-change-flowback"
<!-- source: inferred:结构性回流分支推自 indexer diff 分类(新增/消失任务 = changeKind structural,见 apps/desktop/src/main/workbench/indexer/diff.ts:82-98 与 WorkbenchEvent changeKind 字段);journey Step 3 读写向变更操作含任务集增删情形 -->
- Preconditions: "交替操作期间,终端侧新增(或移除)任务文件——任务集发生结构性变化(既有任务属性不变)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "终端新增(或移除)任务文件,保持看板打开观察"
- Output: "结构性变更 5 秒内回流呈现(结构性增量/移除;新任务出现或消失任务移出,删除不留孤儿);任务集与 forge 数据一致(测试进程直读对拍)"
- State: "task_snapshot 集合与 forge 文件任务集一致(新增行 upsert / 消失行删除);事件 changeKind = structural"
- Side-effect: "none(工作台只读感知)"
- Invariants: "看板任务集与事实源一致"

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
