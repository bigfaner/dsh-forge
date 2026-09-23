---
journey: "task-session-execution-loop"
step: 1
step-action: "打开任务看板浏览依赖树"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDagView(默认视图)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 1: 打开任务看板浏览依赖树

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "应用已启动;一个一次性 fixture 项目(临时目录 + 隔离 userData)已注册并激活,含至少 10 个任务且依赖关系覆盖链/菱形/悬空依赖各至少一处;forge 数据可正常读取(感知链健康)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "in_repo"
      - entity_type: "Task"
        min_count: 10
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "blockers"
            value: "依赖关系覆盖链/菱形/悬空依赖各至少一处"
    state_requirements:
      - description: "隔离 userData(一次性 fixture,测试后清理;本旅程含任务状态变更,不以生产仓为承载)"
        prerequisite_entity: "Project"
      - description: "测试进程可直读 fixture forge 文件(跨面断言通道,浏览器侧不自行观测 CLI 输出)"
        prerequisite_entity: "Task"
- Input: "用户进入工作台·任务看板(tab 切换至任务视图),浏览激活项目的任务依赖树视图"
- Output: "依赖树图形化展示 blocker 关系;任务数、任务状态(7 态词表)、依赖关系与 forge task list 输出一致(校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout 对拍);首屏 2 秒内可交互(计时口径 = Setup 实际任务规模,不含 500 任务性能腿——该腿属 SC1/task-board-browsing 旅程)"
- State: "任务看板快照(TaskBoardData)载入:每任务携带限定地址键、7 态状态、直接上游 blockers、来源槽;sync 状态为 idle;当前视图停留在默认依赖树视图(视图键 workbench/tasks)"
- Side-effect: "none(只读浏览,不写 forge 数据与工作台自有状态)"
- Invariants: "看板不出现任务状态变更的写操作入口"

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
      min_count: 10
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
