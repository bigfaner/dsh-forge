---
journey: "knowledge-recall-flywheel"
step: 8
step-action: "验证知识卡片热度闭环"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/journey.md
anchors:
  web:
    page: "工作台·知识库视图（浏览页签）"
    route: "workbench/knowledge"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中知识面板全宽）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: knowledge-recall-flywheel / Step 8: 验证知识卡片热度闭环

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（热度与事件计数同源一致性归审计通道；浏览器侧以实例化数字断言） -->
<!-- fact-note: fact HEAT_AGGREGATION/RECALL_LOG_RECORDED——shipped 代码热度 = 逐事件行 COUNT（一条链贡献 search + read-abstract 两行 → +2）；旅程口径「召回前由 Setup 事件基线声明、本链 +1」按链口径断言徽章 = 1（缺陷信号设计，见 Journey Invariants） -->

## Outcome "success"
- Preconditions: "本轮召回链已完成（K1 使用事件 +1，基线 = 0——「召回前」由 Setup 事件基线声明）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title_keywords"
            value: "K1（本链命中知识）"
      - entity_type: "UsageEvent"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "KnowledgeEntry"
        field_constraints:
          - field: "chain_count"
            value: "基线 0 + 本链 1（链口径）"
- Input: "左栏进入「知识库」浏览视图，查看 K1 卡片"
- Output: "K1 热度徽章 = 1（基线 0 + 本链 +1——「召回前」由 Setup 事件基线声明）；与召回 tab 热度徽章同数字（同源数据两处呈现一致）"
- State: "K1 热度计数 = 1（链口径；状态层事件聚合同源）；知识视图切换后右栏隐藏、状态保留"
- Side-effect: "none（浏览读取）"

## Outcome "incremental-accumulation"
<!-- 溯源: journey Step 8b（事件即时累积——次数与覆盖分离） -->
- Preconditions: "同一会话中已发生过一次召回（衔接 Step 7 终态：tab 有 K1 条目，统计 1/1）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "recall_history"
            value: "K1 已召回一次（统计 1/1，衔接 Step 7 终态）"
      - entity_type: "KnowledgeEntry"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title_keywords"
            value: "K2 含「构建」（Q2 命中目标，供新一次召回）"
- Input: "发送 Q2 触发对 K2 的新一次召回，再查看召回 tab 与 K2 卡片热度"
- Output: "召回 tab 即时累积——统计头召回次数 = 2、覆盖条数 = 2（与 Step 7 的 1/1 分离，聚合语义可区分于回显）；K2 分组行出现且热度徽章 = 1（基线 0 + 1）、K1 徽章保持 1；「与使用事件表一致」同源属性归审计通道（口径同 Step 7）"
- State: "K1 / K2 热度各自独立累积（链口径各 +1）；会话召回统计 2/2（次数与覆盖分离）"
- Side-effect: "K2 召回链使用事件落状态层"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project ＋ Session（一次召回终态）＋ KnowledgeEntry（K1/K2）＋ UsageEvent（链口径计数，belongs_to KnowledgeEntry）。热度徽章断言按旅程链口径（基线 0 → +1/链）。
