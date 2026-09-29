---
journey: "multi-window-tearout"
step: 6
step-action: "离开重进恢复拆出态"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "拆出窗口(C10)·重进恢复(UF10 States restored)"
    route: "project(重放 open-detached ops;rect 随行)"
    requires_auth: false
    layout: "重进 → 拆出窗口集合按各自视图类型/尺寸/位置重建;主窗 pane 结构同步恢复"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: multi-window-tearout / Step 6: 离开重进恢复拆出态

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (重放 = open-detached ops 序列,rect 优先于缺省几何;FT-102/FT-122;恢复态与离开时一致 e2e 断言) -->

## Outcome "success"
- Preconditions: "项目处于双拆出态(看板 + 会话两独立窗),各窗目标数据健全(会话与任务可解析),窗口集合与主窗 pane 结构已记入布局记忆"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "detached"
            value: "两个拆出窗条目(看板/会话,view/target/rect 各自记录)"
          - field: "rightbar.panes"
            value: "主窗 pane 结构(离开前)"
- Input: "编排者离开后重进该项目"
- Output: "拆出窗口集合随项目记忆恢复:两个独立窗口按各自视图类型/尺寸/位置重建,主窗口 pane 结构同步恢复;恢复态与离开时一致(UF10 States restored)"
- State: "窗口集重建 = 2;主窗 pane 结构恢复;恢复为异步过程,窗口集最终收敛为离开时集合"
- Side-effect: "按记忆逐窗重建,各窗开窗事件恰好一次;失败开窗静默降级(保持主窗 pane 不丢视图)"

## Outcome "restore-target-missing"
<!-- source: inferred -->
<!-- reasoning: journey Step 6b(推自 BIZ-resilience-001 非致命失败降级 × 布局记忆随项目);重放逐 op 守护,openDetached 拒绝计入 degraded 不中止(FT-122) -->
- Preconditions: "拆出窗口记忆中的视图目标数据已删除"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "detached"
            value: "其一窗口条目指向已删除的目标,其余条目健全"
- Input: "编排者重进项目触发恢复"
- Output: "缺失目标的窗口降级呈现(空态/可替换)、不崩溃,其余窗口与主窗布局正常恢复"
- State: "坏 op 降级计数(仅日志);其余恢复腿完整落地;记忆不因单窗失败回滚"
- Side-effect: "none"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
