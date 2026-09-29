---
journey: "multi-window-tearout"
step: 5
step-action: "再拆出第二视图(集合复数)"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "拆出窗口(C10)·复数窗并行"
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
- State: "窗口集 = 2;布局记忆逐窗记录视图类型/目标与几何"
- Side-effect: "各开窗一次(每窗开窗事件恰好一次)"

## Outcome "retearout-remembered-rect"
<!-- source: inferred -->
<!-- reasoning: journey Step 4→5 链(推自 FT-103 关闭记忆几何 × FT-102 几何优先级「重放 rect > 进程内记忆 > 缺省 960×640」);收回后再拆出应复用记忆几何而非缺省 -->
- Preconditions: "某视图(如看板)曾拆出后被收回,收回时其窗口几何(位置/尺寸)已被记忆"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "该视图前次拆出的窗口几何已记忆(非缺省值),主窗该 pane 可再选中"
        prerequisite_entity: "Project"
- Input: "编排者将该视图再次拆出为独立窗口"
- Output: "新拆出窗按记忆几何(位置/尺寸)打开,而非缺省首窗几何(960×640 居中)"
- State: "窗口集 +1;新窗几何 = 记忆值"
- Side-effect: "none"

## Outcome "source-project-lifecycle"
<!-- source: journey Step 5b -->
<!-- reasoning: ui-design C10 来源项目生命周期;setProjectArchived 标题即时追加「已归档」、恢复即时清除后缀、窗保持可用;删除 → recallAllForProject + toast + 记忆随删清除(FT-105/FT-101;lifecycle FT-133) -->
- Preconditions: "项目 A 处于 multi-window 态且来源项目将归档(支路一)/已归档待恢复(支路二)/经确认删除(支路三)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "将归档(支路一)/ 已归档待恢复(支路二)/ 经确认删除(支路三)"
      - entity_type: "DetachedWindow"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "LayoutMemory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者归档、恢复或删除来源项目 A"
- Output: "归档 → 其拆出窗口保持可用,窗口标题追加「已归档」;恢复 → 后缀「已归档」即时清除、窗保持可用;删除 → 该项目全部拆出窗口关闭 + toast 通知,布局记忆随删除清除"
- State: "归档支路:窗口在位、标题追加后缀;恢复支路:窗口在位、后缀清除;删除支路:窗口集清空、布局记忆随项目删除级联清除"
- Side-effect: "归档/恢复 = 在窗标题即时刷新;删除 = 先关闭该项目全部拆出窗、布局记忆随删除清除"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
