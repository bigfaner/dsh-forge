---
journey: "task-session-execution-loop"
step: 5
step-action: "agent 执行任务操作并回流看板"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(回流呈现:任务卡属性级高亮/结构性增量,aria-live)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 5: agent 执行任务操作并回流看板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

> e2e 驱动面注记:agent 动作不由 web 面驱动;以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟 agent 的 claim(tech-design SC2/SC3 e2e 腿口径),回流与来源断言不受模拟方式影响。

## Outcome "success"
- Preconditions: "挂接会话运行中;agent 在会话中仅完成一笔任务状态变更(单笔 claim 腿,经 forge CLI;e2e 以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟;连续多笔腿见 multi-change-flowback);感知链健康(watch 建立、扫描正常)"
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
      - description: "感知链健康(watch 建立于注册+授权根;400ms 防抖 + 500ms 批推预算内)"
        prerequisite_entity: "Project"
- Input: "用户在会话界面对该 claim 操作进行审批(审批走主窗口现有会话 UI),随后回到(或保持打开的)任务看板察看"
- Output: "审批通过后 agent 完成 claim;看板 5 秒内免手动刷新更新任务状态;该笔变更标记来源[会话](变更事件到达时呈现属性级回流高亮)"
- State: "task_snapshot 行状态更新为对应执行态,source = session;变更以 task_updated(changeKind = attribute)事件批推送(dsh-forge:workbench-events 通道);来源判定 = 挂接推断主路径或 FORGE_ACTOR actor 标记"
- Side-effect: "forge 文件被(模拟的)agent 会话操作变更——工作台只读感知,不写 forge 数据"
- Invariants: "看板免手动刷新;来源标记与实际操作通道一致"

## Outcome "sync-degraded"
<!-- source: inferred:超时指示无来源定义——updating 仅在变更事件到达时点亮(UF2 States/ui-design 回流态/实现记录 5.15);感知链故障的失败面 = sync-error 工具栏指示 + 静默重试、保留最后良好看板(实现记录 5.5) -->
- Preconditions: "agent 已在挂接会话中完成 claim 且 forge 文件(唯一事实源)已变更,但看板超过 5 秒仍未显示该更新;破线源于感知链故障(watcher/扫描错误)"
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
      - description: "感知链故障注入(watch/扫描错误;fixture 控制面注入)"
        prerequisite_entity: "Project"
- Input: "用户察看看板任务卡片与变更提示;必要时重启应用并重开看板"
- Output: "超时本身不触发任何专用看板状态——updating 指示仅在变更事件到达时点亮,而非超时点亮;感知链故障呈现 sync-error 工具栏指示 + 静默重试;保留最后一次良好看板(不展示残缺数据);变更事件最终到达或重启全量重扫后,看板与 forge 文件一致(校验通道见 Setup:测试进程直读 fixture forge 文件)"
- State: "sync_state 转入 error 态(原因记录);看板快照保留最后良好数据;恢复后派生快照经重扫/重启重建收敛(forge 文件恒为事实源)"
- Side-effect: "none(降级期间零 forge 数据写入;重试静默)"
- Invariants: "无专用超时状态;看板为可重建派生快照"

## Outcome "multi-change-flowback"
- Preconditions: "挂接会话中 agent 连续执行多笔任务状态变更(claim → transition → submit;e2e 以连续 fixture 文件变更 + FORGE_ACTOR 标记模拟);感知链健康"
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
- Input: "用户保持看板打开,观察任务卡片状态"
- Output: "每笔变更 5 秒内回流,来源逐笔标记[会话];无丢失、无错误合并;最终状态与 forge 数据一致(校验通道见 Setup)"
- State: "每笔变更对应一次 task_updated 事件与快照 upsert(来源槽逐笔更新);最终快照与 forge 文件投影一致"
- Side-effect: "none(工作台只读感知)"

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
