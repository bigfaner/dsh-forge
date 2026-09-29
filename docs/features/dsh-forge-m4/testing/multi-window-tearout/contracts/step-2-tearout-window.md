---
journey: "multi-window-tearout"
step: 2
step-action: "拆出为独立窗口"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/multi-window-tearout/journey.md
anchors:
  web:
    page: "拆出窗口(C10)"
    route: "WindowRole={kind:'detached'}(主进程供给,不走 URL)"
    requires_auth: false
    layout: "第二 BrowserWindow 同源 SPA 重载;标题「<项目名> · <视图名>」;首窗 960×640 居中主窗"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: multi-window-tearout / Step 2: 拆出为独立窗口

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (WindowRole 握手/标题/几何/事件均可核验;FT-100/FT-101/FT-102;窗口集镜像入布局记忆) -->

## Outcome "success"
- Preconditions: "分屏工作台内选中某 pane(如看板视图)且主窗尚有其余内容 pane, pane 菜单「拆出为窗口」可用"
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
            value: "分屏态(该 pane 在主窗在屏,主窗尚有其余内容 pane)"
- Input: "编排者点击「拆出为窗口」"
- Output: "该视图迁入新独立窗口(标准壳窗,标题「<项目名> · <视图名>」);主窗口移除该 pane、其余 pane 按布局规则重排;拆出窗口集合记入布局记忆"
- State: "窗口集 +1;主窗 pane 集相应减少;布局记忆新增该拆出窗条目"
- Side-effect: "拆出为单向开窗;拆出窗沿用主窗同源安全边界(外部导航一律拒绝,仅限应用内部跳转)"
- Invariants: "detached = 派生快照显示面,非第二激活(BIZ-002)"

## Outcome "main-pane-rearrange"
<!-- source: inferred -->
<!-- reasoning: journey Step 2b(推自 UF10「移除主窗 pane」× 布局重排规则);关闭 pane 后其余 pane 自动重排,不出现空白死区 -->
- Preconditions: "被拆出视图原占主窗口唯一内容 pane"
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
            value: "待拆出 pane = 主窗唯一内容 pane"
- Input: "编排者拆出该视图"
- Output: "主窗口移除该 pane 后按布局规则重排呈现,不出现空白主窗口死区;布局记忆与实际一致"
- State: "主窗 pane 集合更新;记忆同步"
- Side-effect: "none"

## Outcome "tearout-target-invalid"
<!-- source: inferred -->
<!-- reasoning: journey Step 2c(推自 surface-web 强制项 × 恢复目标缺失同族的拆出侧);打开通道拒绝携带 ERR_SESSION_OPEN_FAILED 不静默(FT-109) -->
<!-- surface-web required_outcomes 映射:validation-error → 拆出目标会话已失效/不可拆,pane 菜单「拆出为窗口」动作侧明确提示、不静默建空窗 -->
- Preconditions: "待拆出的会话类视图目标已失效(会话已被清理/不可用)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "已清理/不可用(目标失效)"
- Input: "编排者经 pane 菜单点击「拆出为窗口」"
- Output: "拆出动作对失效目标明确提示目标已失效/不可拆或不可用,不静默建出空窗口"
- State: "窗口集不变;主窗 pane 保持"
- Side-effect: "none"

## Outcome "tearout-open-failed"
<!-- source: inferred -->
<!-- reasoning: journey Step 2(推自 FT-104 ERR_WINDOW_OPEN_FAILED × tech-design 窗口面传播「开窗失败 toast」);目标有效但窗口构造/文档加载失败 → 失败窗收回、主窗 pane 不丢视图 -->
- Preconditions: "拆出目标有效,但独立窗口构造失败(窗口构造异常或文档加载失败)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "编排者经 pane 菜单点击「拆出为窗口」"
- Output: "以 toast 明确提示开窗失败,不静默;失败的窗口被收回不留残窗;该视图保留在主窗 pane 不丢失"
- State: "窗口集不变(失败窗不计入);主窗 pane 保持;布局记忆不变"
- Side-effect: "none"

## Journey Invariants

- 全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用,拆出窗口随之关闭(M1 语义继承,tech-design Interface 5)
- 布局记忆 = 主窗口 pane 结构 + 拆出窗口集合,随项目存储;项目删除时随之清除
- OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启);拆出/收回均更新布局记忆,记忆与实际窗口集恒一致
- 并行操作互不干扰;数据内核恒为事实源,窗口内容为派生视图
- 拆出窗口绑定来源项目、不随主窗激活指针(BIZ-workbench-002 单激活仅约束主窗);来源项目归档 → 拆出窗保持可用 + 标题追加「已归档」,删除 → 该项目全部拆出窗关闭 + toast(ui-design C10)
- 多窗口不改变 M1 壳行为(托盘/单实例)
