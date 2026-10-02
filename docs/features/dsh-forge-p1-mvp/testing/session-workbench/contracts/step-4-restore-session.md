---
journey: "session-workbench"
step: 4
step-action: "恢复既有会话（完整转录）"
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

# Contract: session-workbench / Step 4: 恢复既有会话（完整转录）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "项目甲含至少一个历史会话（Setup 预置，完整转录）；工作台处于会话视图"
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
            value: "完整历史转录（含多轮消息与工具调用，预置于 dsh 账本）"
- Input: "左栏展开项目甲节点，点击历史会话行"
- Output: "恢复期间呈加载骨架；完成后历史会话的全部消息与工具调用按时间序完整呈现（「恢复链路」= Story 2 AC2 断言标签，非可观察行为）"
- State: "当前打开会话切换为该历史会话；中区其它视图状态不被重置"
- Side-effect: "none（恢复读取）"

## Outcome "zero-session-placeholder"
<!-- 溯源: journey Step 4b（项目下「暂无会话」占位）；source: inferred（UF-1 仅定义占位态，质量项为派生） -->
- Preconditions: "打开的是项目乙（Setup 定义：刚注册、零会话）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "乙（刚注册）"
    state_requirements:
      - description: "项目乙零会话（dsh 账本中该工作区无会话记录）"
        prerequisite_entity: "Session"
- Input: "左栏展开项目乙节点"
- Output: "项目下呈现「暂无会话」占位（UF-1 States 原文）；不报错、无空列表闪动"
- State: "乙项目会话数 0 的呈现稳定（占位态）"
- Side-effect: "none"

## Outcome "list-loading-skeleton"
<!-- 溯源: journey Step 4c（会话列表加载中骨架） -->
- Preconditions: "会话列表尚未就位（账本查询进行中的瞬态）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "session_list_phase"
            value: "pending（账本查询进行中）"
- Input: "展开项目节点查看会话列表"
- Output: "呈现行级骨架；查询完成后会话行就位"
- State: "由加载瞬态收敛到列表呈现态"
- Side-effect: "none"

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project（甲含历史会话 / 乙零会话）＋ Session（甲的历史会话完整转录，belongs_to Project；乙场景为零行，经 state_requirements 表达）。
