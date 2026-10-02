---
journey: "knowledge-recall-flywheel"
step: 3
step-action: "提出前端域项目问题"
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

# Contract: knowledge-recall-flywheel / Step 3: 提出前端域项目问题

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "会话已建立（系统提示词含知识段，衔接 Step 2）；fixture 问题 Q1 就绪——「本项目的前端部署规范是什么？」（措辞以域词 + 知识标题关键词最大化 agent 自主选域与命中的确定性，命中 K1）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "system_prompt"
            value: "含知识段（衔接 Step 2 终态）"
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title_keywords"
            value: "K1 含「部署」（Q1 命中确定）"
- Input: "在对话 tab 以自然语言发送 fixture 问题 Q1「本项目的前端部署规范是什么？」"
- Output: "消息上屏、agent 开始处理；agent 依知识段指引决定检索路径——用户无需指定域或工具，agent 依问题自主选域（Q1 域词落在前端域，fixture 保证）"
- State: "问题进入处理中（检索链由 Step 4 承载）"
- Side-effect: "none（问题消息入会话日志）"

## Outcome "blank-question-blocked"
<!-- 溯源: journey Step 3b（空问题发送被拦截）；Web surface 必察项 validation-error 的实步承载 -->
- Preconditions: "对话 tab 输入框为空或仅空白字符（衔接 Step 3 输入面）"
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
- Output: "不发送——无消息上屏、无 agent 往返、无检索链与使用事件；空会话引导态保持，焦点仍在输入框"
- State: "零消息、零往返、零使用事件"
- Side-effect: "none"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project ＋ Session（含知识段会话 / 空会话态）＋ KnowledgeEntry（K1 命中锚）。
