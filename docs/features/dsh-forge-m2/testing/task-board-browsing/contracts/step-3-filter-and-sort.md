---
journey: "task-board-browsing"
step: 3
step-action: "筛选与排序"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → BoardToolbar(筛选/排序/计数)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-board-browsing / Step 3: 筛选与排序

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "任务看板已加载且任务集含多 feature、多状态、含 worktree 痕迹与不含的任务(fixture 覆盖筛选维度)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 10
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "featureSlug"
            value: "至少 2 个 feature"
          - field: "status"
            value: "至少 2 个状态并存(7 态词表,FT-033)——状态筛选腿的前提"
          - field: "worktree"
            value: "true 与 false 并存"
    state_requirements:
      - description: "跨面断言通道:筛选结果一致性校验 = 测试进程直读 fixture forge 文件(浏览器侧不自行观测 CLI 输出)"
        prerequisite_entity: "Task"
- Input: "用户使用筛选器(feature/状态/worktree)与排序控件"
- Output: "视图即时更新;筛选结果与 forge 任务数据一致(集合等价断言:匹配任务集成员与 forge 数据逐一对应——排序键/方向在设计词表定约前不作全序断言,仅断言排序操作不改变任务集合);任务计数随筛选更新"
- State: "筛选/排序为会话期内存态(不持久化);快照数据不变"
- Side-effect: "none(视图态本地记忆属 DF005 视图状态)"
- Invariants: "筛选不改变任务数据,仅改变呈现子集"

## Outcome "no-match-empty"
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面;唯一输入面 = 筛选器组合,按 UF2 校验规则映射为明确空态(非错误)= 本边 -->
<!-- source: inferred:「清除筛选后视图恢复」无 PRD 明文;依据 = 筛选为视图态而非数据态,清除即全量重查,UF2 flow 3「即时更新」对称适用 -->
- Preconditions: "当前筛选条件组合下无匹配任务(各筛选维度交叉后结果为空)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 10
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "筛选组合选取使匹配集为空(保证可选配方:筛选器选项由数据填充,选取 fixture 内真实存在的 feature,交叉该 feature 任务集中不存在的状态——如仅含 pending 任务的 feature × 状态筛选选 completed;两选项均可选而交集为空)"
        prerequisite_entity: "Task"
- Input: "用户应用该筛选组合"
- Output: "显示明确空态,不显示错误;清除筛选后视图恢复(全量任务重现)"
- State: "数据快照不变;空态为呈现层判定"
- Side-effect: "none"

## Journey Invariants

- 人侧只读:看板任何视图与任务详情不出现任务状态变更的写操作入口
- 看板信息覆盖 forge task list 全部维度(状态/依赖树/worktree/记录),展示状态与 forge 7 态一致
- 只读浏览不产生任何 forge 数据变更,不写入注册表/挂接索引等工作台自有事实数据;当前视图/筛选/排序的本地记忆属 DF005 视图状态按需读写,不在此限(写入面细节留数据内核设计)
- 可达性:看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作,动态内容(任务卡片/状态列/详情)带可读名称(aria-label/文本,中英双语)——surface-web 可达性原则

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 10
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
