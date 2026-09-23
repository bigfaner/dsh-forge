---
journey: "dual-form-consistency"
step: 5
step-action: "交替后挂接状态完整性"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDetailPanel(挂接历史)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: dual-form-consistency / Step 5: 交替后挂接状态完整性

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "交替操作完成(终端侧以常规 forge CLI 形态操作;冻结插件形态腿见 frozen-plugin-compat);参与交替操作的至少一个任务存在挂接会话(active;已结束挂接腿见 ended-link-history-retained)"
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
            value: "pending(交替起始态,seed 可构造;交替事实由 Preconditions 表达,不由 fixture 字段值承载)"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
    state_requirements:
      - description: "断言口径:注册/挂接事实 = 工作台状态读数对拍(挂接索引为工作台自有 SoT,不经 forge 文件推导)"
        prerequisite_entity: "Task"
- Input: "用户查看参与交替操作任务的详情与挂接状态"
- Output: "挂接索引与历史挂接回溯完整(任务详情挂接区呈现当前挂接与历史);工作台自有状态独立存放,不与 forge 数据混放"
- State: "挂接记录完整保留(交替操作不触碰挂接数据);挂接与 forge 数据独立存放、互不混写(自有状态不写入 forge 文件)"
- Side-effect: "none(只读)"
- Invariants: "双形态交替不写挂接索引之外的中间态;挂接数据不因终端操作丢失"

## Outcome "frozen-plugin-compat"
- Preconditions: "终端侧使用冻结插件(3.x)形态操作同一项目(与常规 forge CLI 形态互斥的终端形态腿;ended-link-history-retained 的交替以常规 CLI 形态完成——两腿以终端形态互斥)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "3.x 形态驱动配方:优先以真实冻结插件(3.x) CLI 对 fixture 项目执行变更;不可得时以经 3.x 插件产物校准的方言任务文件副本代写,驱动方式记录于本腿——写方式须与常规 CLI 形态腿可区分,「互不破坏」断言才有区分对象(index.json 为双形态共写往返文件、旧写者重写丢弃未知字段,见 spike-1-findings;格式共享 = prd-spec 过渡期约束)"
        prerequisite_entity: "Task"
- Input: "冻结插件侧执行任务变更后,在应用看板查看"
- Output: "双形态共享 forge 数据格式,互不破坏;看板正常渲染该变更"
- State: "应用按同一 forge 方言解析冻结插件产出的数据;快照回流正常"
- Side-effect: "none(只读感知)"

## Outcome "ended-link-history-retained"
<!-- source: inferred:ended 行保留与回溯语义推自 session_links 仓储契约(endSessionLink 置 ended 不删行;历史查询含 ended、新→旧排序,见 apps/desktop/src/main/workbench/repos/session-links.ts:48-95)+ journey Step 5「历史挂接回溯完整」 -->
- Preconditions: "参与交替操作的挂接会话已结束(status = ended;交替完成后经发起侧收敛或显式结束);交替期间终端侧以常规 forge CLI 形态操作(冻结插件形态腿见 frozen-plugin-compat——两腿以终端形态互斥)"
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
            value: "ended"
- Input: "用户打开该任务详情查看挂接历史列表"
- Output: "已结束挂接仍在历史列表中完整保留(会话标识/开始时间/结束态可回溯);forge 数据无混写(挂接仅存在于工作台自有状态)"
- State: "已结束挂接记录保留不删除(结束时间已写入);挂接历史列表按开始时间新→旧排序、含已结束条目(FT-035)"
- Side-effect: "none(只读)"

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
