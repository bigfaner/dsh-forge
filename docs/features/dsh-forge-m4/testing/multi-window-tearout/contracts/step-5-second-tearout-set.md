---
journey: "multi-window-tearout"
step: 5
step-action: "再拆出第二视图(集合复数)"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "拆出窗口集合(C10,复数窗并行)"
    route: "windowOpenDetached × 2;几何 = 重放 rect > 进程内记忆 > 缺省 960×640"
    requires_auth: false
    layout: "主窗 + 两个独立窗并行;各窗视图类型/尺寸/位置随项目记入布局记忆"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: multi-window-tearout / Step 5: 再拆出第二视图(集合复数)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (窗口集合以窗口计数/身份核验;几何决策纯函数 FT-102;归档/删除窗口钩子 FT-105) -->

## Outcome "success"
- Preconditions: "项目工作台可拆出(看板与会话两类视图均在 pane 内可选中)"
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
- Input: "编排者重复拆出两次,先后将看板与会话两个视图再拆出为独立窗口"
- Output: "主窗口与两个独立窗口并行;拆出窗口集合 = 2(窗口集合以复数行使),各窗口视图类型/尺寸/位置随项目记入布局记忆(首次拆出默认尺寸居中、此后记忆用户调整)"
- State: "窗口集 = 2;blob detached 块记录各窗 view/target/rect"
- Side-effect: "各开窗一次 detached-opened 事件"

## Outcome "source-project-lifecycle"
<!-- source: journey Step 5b -->
<!-- reasoning: ui-design C10 来源项目生命周期;setProjectArchived 标题即时追加「已归档」、窗保持可用;删除 → recallAllForProject + toast + 记忆随删清除(FT-105/FT-101;lifecycle FT-133) -->
- Preconditions: "项目 A 处于 multi-window 态且来源项目被归档;另一侧 = 经确认删除该项目"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "将归档(支路一)/ 经确认删除(支路二)"
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者归档(或删除)来源项目 A"
- Output: "归档 → 其拆出窗口保持可用,窗口标题追加「已归档」;删除 → 该项目全部拆出窗口关闭 + toast 通知,布局记忆随删除清除"
- State: "归档支路:窗口在位、标题追加后缀;删除支路:窗口集清空、project_ui_state 级联清除"
- Side-effect: "归档 = 标题记账 + 在窗即时刷新;删除 = recallAllForProject + 布局记忆 forget 前置"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
