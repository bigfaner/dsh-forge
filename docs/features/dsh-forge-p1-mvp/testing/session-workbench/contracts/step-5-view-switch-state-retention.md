---
journey: "session-workbench"
step: 5
step-action: "视图互换且右栏状态保留"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/session-workbench/journey.md
anchors:
  web:
    page: "工作台·会话视图（默认态）"
    route: "workbench/session"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: session-workbench / Step 5: 视图互换且右栏状态保留

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->
<!-- anchors 注记: 本步往返于 workbench/session 与 workbench/knowledge 两视图态间；锚点取回归态（会话视图），知识视图态为途中态 -->

## Outcome "success"
- Preconditions: "右栏 dock 可展开（初始默认收起）；Step 4 历史会话打开中（衔接 Step 4 终态）；甲项目级页签与全局页签在 fixture 可见集"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "甲"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "transcript"
            value: "完整呈现中（Step 4 恢复的历史会话）"
      - entity_type: "DockTab"
        min_count: 2
        field_constraints:
          - field: "scope"
            value: "甲项目级页签 + 全局页签各一（可见集可区分，fixture 预置通道）"
- Input: "展开右栏 dock（可见「甲·页签 + 全局页签」）→ 输入框预输入草稿「待发问题」不发送 → 左栏点「知识库」进入知识视图 → 点 Step 4 会话行切回（覆盖口径：会话行为三切回入口代表——「新会话」/ 品牌行属新建类、Step 2 已行使——断言及于全部入口）"
- Output: "知识模式下右栏隐藏（已展开也隐藏）；切回后右栏按记忆恢复原展开态（页签条仍可见）。保留探针：草稿「待发问题」仍在输入框；Step 4 会话转录仍完整呈现。浏览侧上下文保持由兄弟 Journey knowledge-browsing 承载（本步不种入浏览内容）"
- State: "视图态会话→知识→会话往返；右栏偏好保留（隐藏不覆写偏好，切回恢复展开态）；会话与草稿状态保持（中区两视图常驻不卸载）"
- Side-effect: "none"

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态

## Fixture Specification

本 Contract 前置数据状态：Project（甲）＋ Session（打开中的历史会话，belongs_to Project）＋ DockTab（甲项目级页签 + 全局页签）。项目级页签预置通道为 Setup 声明的 fixture 契约（fact DOCK_TAB_MODEL：shipped 代码仅注册全局页签，项目级页签需测试预置缝）。
