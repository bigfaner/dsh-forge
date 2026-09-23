---
journey: "dual-form-consistency"
step: 1
step-action: "终端变更回流看板"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/dual-form-consistency/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(回流呈现)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: dual-form-consistency / Step 1: 终端变更回流看板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "同一 forge 项目同时被应用(已注册激活、看板可进入)与终端(冻结插件/forge CLI)操作;项目内存在可供变更的未完成任务;被变更任务当前无进行中(active)挂接会话(来源判定据此标记[终端],FT-045 判定序);感知链健康(感知链故障腿见 perception-chain-error);变更发生时任务看板未处于已打开状态(用户在变更后进入/回到看板查看;已打开看板的到达变更腿见 board-open-change)"
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
            value: "未完成(可 claim/transition)"
      - entity_type: "SessionLink"
        min_count: 0
        relationship_type: "belongs_to"
        parent_entity: "Task"
    state_requirements:
      - description: "被变更任务零 active 挂接:挂接索引为工作台自有 SoT、不可从 forge 文件推导,fixture 须显式钉零(隔离 userData、零挂接写入足迹)——来源判定(FT-045 路径 2)的判定输入才确定指向 [终端]"
        prerequisite_entity: "Task"
      - description: "终端侧可对 fixture forge 文件执行真实任务状态变更(测试进程代终端操作)"
        prerequisite_entity: "Task"
      - description: "跨面断言口径:变更事实 = 测试进程直读 fixture forge 文件(浏览器侧不自行观测 CLI/文件系统)"
        prerequisite_entity: "Task"
- Input: "人在终端执行一次任务状态变更,随后回到应用看板查看(不重启应用)"
- Output: "该变更 5 秒内免手动刷新可见,且标记来源[终端]"
- State: "看板快照逐笔更新(状态/时间);source = terminal(判定序路径 2:无 actor 标记且无 active 挂接 → terminal,FT-045;仅变更行判定,未变更行保留历史来源);task_updated 事件(属性级 changeKind)批推送至看板订阅方(FT-046)"
- Side-effect: "forge 文件被终端侧变更(工作台只读感知,零写回)"
- Invariants: "变更来源标记与实际操作通道一致"

## Outcome "board-open-change"
- Preconditions: "应用运行中且任务看板处于打开状态(非首次加载;与 success 的进入时序互斥——本边强调看板已打开期间的到达变更;感知链健康,与 perception-chain-error 以感知链状态互斥);被变更任务无 active 挂接(来源判定口径同 success,FT-045)"
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
            value: "未完成"
      - entity_type: "SessionLink"
        min_count: 0
        relationship_type: "belongs_to"
        parent_entity: "Task"
    state_requirements:
      - description: "被变更任务零 active 挂接:挂接索引为工作台自有 SoT、不可从 forge 文件推导,fixture 须显式钉零(隔离 userData、零挂接写入足迹),来源判定(FT-045 路径 2)据此标记 [终端]"
        prerequisite_entity: "Task"
- Input: "终端执行任务状态变更,观察已打开的看板"
- Output: "变更 5 秒内可见,无需关闭重开看板、无需手动刷新或重启应用;变更前看板既有内容完整保留(其余任务不丢失、无整板重载/闪烁)"
- State: "已打开看板的快照经变更事件增量推送更新(FT-046 批推送);不重建整板,既有内容保留"
- Side-effect: "none(工作台只读感知终端变更)"

## Outcome "perception-chain-error"
<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = 看板感知链(watcher→indexer→事件推送)失败,映射为 FT-056 sync-error 工具栏指示 + 静默重试 + last-good 看板保留 = 本边 -->
<!-- source: inferred:感知链失败行为推自 FT-056(看板呈现 sync-error 工具栏指示、后台静默重试、保留 last-good;快照为可重建派生缓存,forge 文件仍为唯一事实源);journey Step 1 未列此边——回流主角通道的失败腿补全 -->
- Preconditions: "应用运行中且任务看板处于打开状态、已完成初始加载(存在 last-good 内容);感知链故障(变更扫描持续失败,变更暂不可回流;与 success/board-open-change 以感知链健康状态互斥)"
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
            value: "未完成(可供变更)"
    state_requirements:
      - description: "感知链故障注入:fixture 副本上使变更扫描持续失败(如 forge 数据读取异常),错误腿供给随 fixture 清理"
        prerequisite_entity: "Project"
      - description: "跨面断言口径:恢复后回流断言 = 测试进程直读 fixture forge 文件对拍(浏览器侧不自行观测 CLI/文件系统)"
        prerequisite_entity: "Task"
- Input: "终端执行一次任务状态变更,观察已打开看板(不重启应用),随后感知链恢复"
- Output: "看板呈现同步错误指示(工具栏 sync-error,FT-056),既有看板内容保留(last-good,不空白、不残缺);感知链恢复后变更免手动刷新回流可见"
- State: "同步状态 = error(错误原因可读,FT-056);后台静默重试,期间看板保留 last-good 快照(快照为可重建派生缓存,forge 文件仍为唯一事实源);恢复后快照收敛至 forge 数据当前态"
- Side-effect: "none(失败面收敛于感知链;不写 forge 数据)"
- Invariants: "感知链故障不产生第二事实源;last-good 保留不虚构数据"

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
      min_count: 0
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
