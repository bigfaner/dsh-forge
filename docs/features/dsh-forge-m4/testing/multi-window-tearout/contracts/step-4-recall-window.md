---
journey: "multi-window-tearout"
step: 4
step-action: "收回独立窗口(关闭 ≡ 收回)"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "拆出窗口(C10)·[收回] / OS 标题栏关闭"
    route: "windowRecall(dsh-forge:window-recall);OS close 汇入同一编排"
    requires_auth: false
    layout: "收回 = close();'closed' 终态 = 注册表移除 + detached-closed 事件恰好一次;pane 回主窗原位"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: multi-window-tearout / Step 4: 收回独立窗口(关闭 ≡ 收回)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (OS close ≡ recall 汇入同一 'closed' 路径,事件恰好一次;FT-103;windowId 失效 → ERR_WINDOW_NOT_FOUND FT-104) -->

## Outcome "success"
- Preconditions: "存在一个拆出窗口(其视图原自主窗某 pane)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "origin"
            value: "其视图原自主窗 pane(可原位恢复)"
- Input: "编排者点击独立窗口 [收回](或直接经 OS 标题栏关闭——两者同语义)"
- Output: "该视图 pane 即时回主窗口原位,不待重启;布局记忆更新为收回后结构(OS 标题栏关闭 ≡ 收回:tech-design Interface 5/ui-design C10)"
- State: "窗口集 -1(detached-closed 恰好一次);主窗 pane 集恢复;记忆同步"
- Side-effect: "close 时记忆窗口几何(供后续拆出/重放)"
- Invariants: "关闭 ≡ 收回:记忆与实际窗口集恒一致"

## Outcome "close-main-quit"
<!-- source: journey Step 4b -->
<!-- reasoning: tech-design Interface 5 主窗关闭 = 退出应用;recallAll 收全部拆出窗(FT-105);重进按记忆恢复拆出态(UF10 restored) -->
- Preconditions: "应用处于 multi-window 态(主窗口 + ≥1 拆出窗口)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "detached"
            value: "拆出窗口集合已记入记忆"
- Input: "编排者关闭主窗口(OS 标题栏)"
- Output: "应用退出(M1 单实例语义),全部拆出窗口随之关闭、不残留;重进按布局记忆恢复拆出态(UF10 restored)"
- State: "进程退出;窗口集清空(不残留);记忆保持(重进恢复)"
- Side-effect: "recallAll 编排;全部 detached-closed 事件各恰好一次"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
