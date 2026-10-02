---
journey: "session-workbench"
step: 2
step-action: "发起新会话并完成一次真实往返"
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

# Contract: session-workbench / Step 2: 发起新会话并完成一次真实往返

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（真实模型往返非确定——观察窗与重发策略见 State 维） -->

## Outcome "success"
- Preconditions: "项目甲在场，dsh 会话运行时可用（模型 API 凭证归 dsh profile 域，产品不经手），工作台处于会话视图"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "甲"
    state_requirements:
      - description: "dsh 会话运行时可用；fixture 消息保证触发至少 1 次工具调用（供 Step 3 断言）"
        prerequisite_entity: "Session"
- Input: "点「新会话」按钮（品牌行同属「新建会话」等价类，本步以按钮为代表，断言及于等价类），在对话 tab 输入 fixture 消息「列出当前工作区根目录下的文件」并发送"
- Output: "中区切换到会话视图并新建会话；完成一次真实 agent 往返，回答呈现于对话 tab；本轮含至少 1 次工具调用（fixture 消息保证）"
- State: "新建 dsh 会话（左栏会话列表实时新增行，零缓存零副本）；观察窗 = 提问后 120s 内回答完成且轨迹出现工具调用；窗内未完成 → 同一 fixture 问题重发至多 2 次；仍无 → 降级能力面 contract 通道验证同等断言并记 flake"
- Side-effect: "dsh 会话日志追加（账本写入，非应用库）"

## Outcome "empty-session-guide"
<!-- 溯源: journey Step 2b（新会话的空态引导） -->
- Preconditions: "新建会话尚未发送任何消息"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "message_count"
            value: "0（新建零消息会话）"
- Input: "查看对话 tab"
- Output: "呈现引导输入的空会话态"
- State: "会话零消息，引导态在位"
- Side-effect: "none"

## Outcome "blank-send-blocked"
<!-- 溯源: journey Step 2c（空消息发送被拦截）；Web surface 必察项 validation-error 的实步承载 -->
- Preconditions: "对话 tab 输入框为空或仅空白字符"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "message_count"
            value: "0（空会话态）"
- Input: "直接点发送"
- Output: "不发送——无消息上屏、无 agent 往返（空输入下发送入口不可用且提交护栏拦截）；空会话引导态保持，焦点仍在输入框"
- State: "会话零消息零往返，无新增 dsh 会话日志消息"
- Side-effect: "none"

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project（甲）＋ Session（新建/零消息会话，belongs_to Project）。往返稳定性策略（120s 观察窗 + 重发 ≤2 次 + 降级 contract 通道）为旅程 Setup 契约。
