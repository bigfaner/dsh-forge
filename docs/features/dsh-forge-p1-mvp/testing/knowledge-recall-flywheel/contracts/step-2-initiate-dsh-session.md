---
journey: "knowledge-recall-flywheel"
step: 2
step-action: "发起真实 dsh 会话"
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

# Contract: knowledge-recall-flywheel / Step 2: 发起真实 dsh 会话

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（系统提示词内容非浏览器可观察——经能力面 / 插件契约通道承载） -->

## Outcome "success"
- Preconditions: "项目已注册且知识库目录有效（含可召回知识，衔接 Step 1）；dsh 会话运行时可用"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "knowledge_dir"
            value: "已配置且含合规知识（K1/K2 在场）"
      - entity_type: "KnowledgeEntry"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "点「新会话」按钮建立会话"
- Output: "会话建立，其系统提示词含最简知识段——知识库存在声明、召回流程指引（遇项目问题先 search 相应域、摘要先行、按需 read-abstract）与工具说明（Story 4 AC1）；系统提示词内容非浏览器可观察，本断言经能力面 / 插件契约通道承载"
- State: "新会话在场；系统提示词知识段注入（能力面通道断言）"
- Side-effect: "系统提示词知识段注入（会话系统提示词组成）"

## Outcome "no-knowledge-dir-session"
<!-- 溯源: journey Step 2b（项目未配置知识目录的会话；依场景隔离专属工作区独立启动） -->
<!-- source: inferred（不注入为 Story 4 AC1 的反向派生，无 PRD 原文） -->
<!-- adjudication: fix-11 裁决（B 侧，2026-10-03）——知识段注入口径 = 能力性指引随插件加载无条件注入。
     依据：PRD Story 4 AC1 仅定义正向态；tech-design Interface 3 为静态注册（name/order/text 无门控）；
     段文本自声明 "may be registered"（为无条件注入措辞）；两 tool 同为无条件注册（工具 schema
     本就在场，仅藏指引段不自洽）；精确门控在设计边界内不可实现（Interface 2 无路径反查、Hard Rule
     禁第二 core 服务、绑定表不含知识目录、core 索引空态为异步不可同步探测）。本 Outcome 的
     「不含知识段」期望随之撤销，断言改为段在场 + 会话正常。 -->
- Preconditions: "项目知识目录未配置（依 Setup 场景隔离，专属工作区独立启动）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "knowledge_dir"
            value: "未配置（无知识目录绑定）"
    state_requirements:
      - description: "专属工作区独立启动，不与基线（Q1/Q2 可命中）叠加"
        prerequisite_entity: "KnowledgeEntry"
- Input: "建立新会话并发起对话"
- Output: "会话正常可用（不报错）；系统提示词仍含知识段（fix-11 裁决 B 侧：知识段 = 能力性指引，随插件全局注入——段内回落指引承载「无知识库转常规检索」）；agent 走常规检索原语完成回答"
- State: "知识段注入（全局能力面）；无命中召回链（零命中/未绑定回落常规检索）"
- Side-effect: "none（未配置态零命中检索至多记哨兵行——见 step-4 裁决）"

## Outcome "empty-knowledge-dir-session"
<!-- 溯源: journey Step 2c（知识目录已配置但为空的会话；与 2b 未配置态可区分） -->
<!-- source: inferred（知识段注入口径原 UNKNOWN——fix-11 设计期裁决收口为 B 侧：能力性指引无条件注入，见 2b adjudication 注） -->
- Preconditions: "知识目录已配置且为空（无任何知识文件；依 Setup 场景隔离独立启动，与 2b 未配置态可区分）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "knowledge_dir"
            value: "已配置且为空（目录在、零知识文件）"
    state_requirements:
      - description: "专属工作区独立启动；空目录与未配置两态可区分"
        prerequisite_entity: "KnowledgeEntry"
- Input: "建立新会话并发起对话"
- Output: "会话正常可用（不报错）；系统提示词仍含知识段（fix-11 裁决 B 侧——空目录与未配置两态的区分承载于检索行为与召回事件，非段有无）"
- State: "知识段注入（全局能力面）；无命中召回链"
- Side-effect: "none"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project（知识目录三种态：含知识 / 未配置 / 已配置为空——后两态专属工作区独立启动）＋ KnowledgeEntry（基线含知识态）。系统提示词断言通道 = 能力面 / 插件契约（浏览器不可观察）。
