---
journey: "session-workbench"
step: 3
step-action: "切「轨迹」tab 查看最简台账"
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

# Contract: session-workbench / Step 3: 切「轨迹」tab 查看最简台账

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "Step 2 往返已完成的会话打开中（本轮含至少 1 次工具调用，fixture 保证）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "last_round"
            value: "含用户消息、agent 回答与至少 1 次工具调用的完整往返"
- Input: "点会话面板顶部「轨迹」页签"
- Output: "呈现最简台账——本轮消息与至少 1 条工具调用的时序列表（Step 2 fixture 保证）；切回对话 tab 不重置——探针：Step 2 往返转录仍在原位、会话未重建（标题未变）。知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 承载（流程二第 2 条）"
- State: "会话状态跨页签保持（三页签常驻切换零重置）；当前会话与转录不变"
- Side-effect: "none"

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态

## Fixture Specification

本 Contract 前置数据状态：Project（甲）＋ Session（含完整往返与至少 1 次工具调用的会话，belongs_to Project）。
