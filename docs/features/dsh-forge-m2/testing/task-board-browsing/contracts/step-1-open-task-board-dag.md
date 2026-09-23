---
journey: "task-board-browsing"
step: 1
step-action: "打开任务看板(依赖树视图)"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDagView(默认视图)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-board-browsing / Step 1: 打开任务看板(依赖树视图)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "应用已启动且已注册并激活一个 forge 项目 fixture(一次性 fixture:临时目录 + 隔离 userData、测试后清理),含至少 10 个任务、依赖关系覆盖链/菱形/悬空依赖各至少一处、含带执行记录的任务(来源 = 会话/终端各至少 1)与无记录任务;forge 数据可正常读取"
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
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "source"
            value: "会话与终端各至少一笔"
    state_requirements:
      - description: "首屏计时腿供给:同一生成器 500 任务/50 feature 固定种子 preset(同种子产出同文件字节);预热一次不计、连续 3 次取中位数(已落地 sc1 e2e 口径)"
        prerequisite_entity: "Project"
      - description: "跨面断言通道:与 forge task list 输出一致的校验 = 测试进程直读 fixture forge 文件或 stub CLI stdout(浏览器侧不自行观测 CLI 输出)"
        prerequisite_entity: "Task"
- Input: "用户进入工作台·任务看板"
- Output: "默认展示图形化依赖树,blocker 关系可视化;任务数/状态/依赖与 forge task list 输出一致(含已完成历史任务;校验通道见 Preconditions);首屏 2 秒内可交互(计时口径 = 500 任务 fixture 腿:进入任务页到依赖树 500 节点首屏可交互)"
- State: "任务看板快照(TaskBoardData)载入;sync 状态 idle;默认视图 = 依赖树"
- Side-effect: "none(只读浏览)"

## Outcome "read-error"
<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = forge 数据读取失败,映射为 UF2 error(读取失败)态 = 本边 -->
<!-- source: inferred:「不崩溃、不展示残缺或错误的数据」推自 UF2 error 态语义(读取失败为整体失败,不部分渲染)+ 唯一事实源纪律(forge 文件为 SoT、看板为派生快照) -->
- Preconditions: "forge 任务数据读取失败——fixture 副本上注入文件损坏/权限异常(错误腿供给随 fixture 清理)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "fixture 副本注入文件损坏/权限异常(读取失败注入)"
        prerequisite_entity: "Project"
- Input: "用户进入任务看板"
- Output: "显示错误(error)态与重试入口;应用不崩溃、不展示残缺或错误的数据;排除读取障碍后点击重试,看板恢复渲染且与 forge 数据一致(校验通道见 Preconditions)"
- State: "读取失败不落残缺快照(整体失败语义);重试成功后快照重建"
- Side-effect: "none(重试为只读重扫)"

## Outcome "empty-state"
- Preconditions: "注册激活的项目没有任何任务数据(Setup 另备零任务 fixture 项目)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "taskCount"
            value: 0
- Input: "用户进入任务看板"
- Output: "显示空(empty)态「无任务」引导(指向 forge 初始化),不显示错误"
- State: "看板无任务快照数据;视图停留空态呈现"
- Side-effect: "none"

## Outcome "loading-state"
- Preconditions: "任务看板数据尚未就绪(首次加载大任务集;切换项目同口径)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 10
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "用户进入任务看板(数据未就绪窗口期内观察)"
- Output: "先行显示 loading 态(骨架/进度),数据就绪后转入正常树/列表视图;未就绪期间不显示错误态或空态(UF2 States:loading 行)"
- State: "加载中不误判为空/错误;就绪后正常快照载入"
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
    - entity_type: "TaskRecord"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
