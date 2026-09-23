---
journey: "task-session-execution-loop"
step: 2
step-action: "打开任务详情"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDetailPanel(侧板)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 2: 打开任务详情

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "看板上存在处于可执行状态的任务卡片/节点,该任务的执行痕迹均在默认工作区(无非默认 worktree 执行痕迹)"
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
            value: "处于可执行状态"
          - field: "worktree"
            value: false
- Input: "用户点击该任务卡片/节点"
- Output: "详情面板展开;描述(任务文件原文的只读渲染)、依赖链(上游 blocker 传递链,拓扑序)、执行记录(at/kind/来源/摘要)均可读;不呈现 worktree 标识"
- State: "选中任务态建立(限定地址键);TaskDetail 载入(summary + 描述原文 + 依赖链 + 执行记录 + 挂接历史);侧板打开"
- Side-effect: "none(只读)"
- Invariants: "详情面板不出现任务写操作入口;描述按 forge 原文渲染,不虚构 forge 未写字段"

## Outcome "worktree-trace-visible"
- Preconditions: "看板上存在处于可执行状态的任务,且该任务在非默认 worktree 有执行痕迹(带执行分支名;真实 git worktree + 执行痕迹写入,生成器方言恒不虚构 branch/worktree 字段)"
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
            value: "处于可执行状态"
          - field: "worktree"
            value: true
          - field: "branch"
            value: "非空执行分支名"
- Input: "用户点击该任务卡片/节点,查看卡片角标与详情内标识"
- Output: "详情面板展开且描述/依赖链/执行记录均可读(同 success 口径);worktree 标识可见(卡片角标 + 详情内标识)"
- State: "选中任务态建立;TaskDetail 载入,worktree 与 branch 字段如实投影(不虚构)"
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
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
