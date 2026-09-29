---
journey: "multi-window-tearout"
step: 1
step-action: "选中待拆出视图"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "项目工作台·pane 头菜单([拆出为窗口]入口)"
    route: "project(pane 操作菜单;拆出来源 = 工作台 pane)"
    requires_auth: false
    layout: "pane 头 [拆出为窗口];C10 拆出动作 → windowOpenDetached"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: multi-window-tearout / Step 1: 选中待拆出视图

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (菜单动作可用性 + 单实例锁可直接核验) -->

## Outcome "success"
- Preconditions: "项目工作台处于分屏态(≥1 个 pane,如看板视图)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "rightbar.panes"
            value: "分屏态(≥1 个 pane 在屏)"
    state_requirements:
      - description: "选中 pane 呈看板视图,Task 为该看板数据面"
        prerequisite_entity: "Task"
- Input: "编排者在分屏工作台内选中某 pane(如看板视图),打开 pane 操作菜单"
- Output: "「拆出为窗口」动作可用(拆出来源 = 工作台 pane)"
- State: "纯菜单呈现;窗口集未变"
- Side-effect: "none"

## Outcome "single-instance-boundary"
<!-- source: journey Step 1b -->
<!-- reasoning: M1 单实例锁语义继承(coexistence 单实例锁);测试前确认本机无活跃实例,第二进程启动才确定性命中实例锁 -->
- Preconditions: "应用以单实例运行且已存在拆出的独立窗口"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "本机无其他活跃 dsh-forge 实例(第二进程启动可确定性命中实例锁)"
        prerequisite_entity: "Project"
- Input: "编排者从操作系统再次启动应用(第二进程)"
- Output: "单实例语义保持(M1 继承):不产生第二实例,第二进程聚焦既有实例后退出;全部窗口同属单实例"
- State: "进程数不变;窗口集保持;既有实例获得聚焦"
- Side-effect: "第二进程退出码呈单实例命中形态"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
