---
journey: "knowledge-recall-flywheel"
step: 6
step-action: "切「轨迹」tab 验证检索链时序"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/journey.md
anchors:
  web:
    page: "工作台·会话视图（默认态）"
    route: "workbench/session"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: knowledge-recall-flywheel / Step 6: 切「轨迹」tab 验证检索链时序

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "本轮往返已完成且含检索链（衔接 Step 5 终态）"
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
            value: "含 search 与 read-abstract 检索链的完整往返（衔接 Step 5）"
- Input: "点会话面板顶部「轨迹」页签"
- Output: "台账按时间序呈现本轮工具调用，含 search 与 read-abstract 两条且 search 先于 read-abstract（检索链发生及其顺序的唯一直接 UI 证据）；切回对话 tab 不重置——回答仍在原位"
- State: "会话状态跨页签保持（转录与回答不变）"
- Side-effect: "none"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 前置数据状态：Project ＋ Session（含检索链完整往返，belongs_to Project）。
