---
journey: "session-workbench"
step: 6
step-action: "切换项目时 dock 页签跟随且不打断面板"
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

# Contract: session-workbench / Step 6: 切换项目时 dock 页签跟随且不打断面板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->
<!-- fact-note: fact DOCK_TAB_MODEL——可见集规则「全局 + 当前项目」为 shipped 代码语义；但 shipped 代码尚无项目级页签注册（M0 仅全局「开始」页签），甲/乙项目级页签经 Setup 声明的 fixture 预置通道提供（journey 明示预置通道 PRD 未定义，source: inferred） -->

## Outcome "success"
- Preconditions: "已注册项目甲与乙（衔接 Step 5 终态：右栏展开、甲会话打开）；甲/乙各预置一个项目级页签 + 全局页签常驻，可见集可区分"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "names"
            value: "甲（含打开中会话）与乙（切换目标）"
      - entity_type: "DockTab"
        min_count: 3
        field_constraints:
          - field: "scope"
            value: "甲项目级 + 乙项目级 + 全局各一（fixture 预置，可见集可区分）"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "state"
            value: "甲的历史会话打开中、面板呈现连续"
- Input: "左栏从项目甲切换到项目乙（衔接 Step 5 终态：右栏展开、甲会话打开）"
- Output: "dock 可见页签集切换为「乙·页签 + 全局页签」、不含「甲·页签」（与甲态可区分）；中区面板不打断——探针：会话面板不闪断、不回空态；切回甲时恢复「甲·页签 + 全局页签」且展开态保持"
- State: "dock 可见集随当前项目焦点派生切换（无快照、可往返恢复）；中区视图状态与右栏展开态不重置"
- Side-effect: "none"

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态

## Fixture Specification

本 Contract 前置数据状态：Project（甲、乙）＋ Session（甲会话，belongs_to Project）＋ DockTab（甲/乙项目级 + 全局，共 3 个，fixture 预置通道）。项目级页签预置为 Setup 声明的测试基建契约。
