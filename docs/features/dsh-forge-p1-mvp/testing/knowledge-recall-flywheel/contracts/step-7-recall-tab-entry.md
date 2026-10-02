---
journey: "knowledge-recall-flywheel"
step: 7
step-action: "查看会话知识召回 tab"
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

# Contract: knowledge-recall-flywheel / Step 7: 查看会话知识召回 tab

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（浏览器侧以实例化数字断言；事件表逐条核对归审计通道——状态层直读） -->
<!-- fact-note: fact RECALL_TAB_STATS/RECALL_LOG_RECORDED——shipped 代码统计口径为「调用组数 / 去重命中条目」且逐工具调用逐行记事件（一条链 = search + read-abstract 两组）；旅程口径为「一次命中的检索链记 1 条」→ 本步断言 1/1 与徽章 1 为链口径的缺陷信号设计（Journey Invariant 原文：实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号） -->

## Outcome "success"
- Preconditions: "本会话已发生一次命中召回链（衔接 Step 6 终态；使用事件基线 = 0，Setup 声明）"
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
            value: "一次命中召回链已完成（Q1 → K1，事件基线 0 + 本链 1 次）"
      - entity_type: "UsageEvent"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
        field_constraints:
          - field: "chain_count"
            value: "1（一次命中的检索链记 1 条——链口径）"
- Input: "切到会话「知识召回」页签"
- Output: "统计头实例化——召回次数 = 1、覆盖条数 = 1（事件基线 0 + 本链 1 次，链口径）；K1 分组行（动词明细 / 最近时间 / 热度徽章 = 1；动词取值 UNKNOWN，见 Invariants）呈现。「条目与状态层使用事件数据一致」为同源数据属性（UF-4 断言）：浏览器侧以本步实例化数字断言，事件表逐条核对归审计通道"
- State: "会话召回统计 = 1/1（链口径）；K1 分组行在场"
- Side-effect: "none（tab 读取）"

## Outcome "no-recall-placeholder"
<!-- 溯源: journey Step 7b（本会话暂无召回占位） -->
- Preconditions: "会话尚未发生任何知识召回"
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
            value: "零召回（未发生命中链；与 4d 互证）"
- Input: "切到「知识召回」页签"
- Output: "呈现「本会话暂无召回」占位（不报错、无空列表）"
- State: "零召回占位态"
- Side-effect: "none"

## Outcome "recall-entry-jump-detail"
<!-- 溯源: journey Step 7c（召回条目跳转知识详情） -->
- Preconditions: "召回 tab 存在分组行条目（衔接 Step 7 终态）"
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
            value: "召回 tab 含至少一条分组行"
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "index_state"
            value: "在索引（正常跳转断言）；失效标注场景经外部删除预置（索引未命中）"
- Input: "点一条知识分组行"
- Output: "跳转打开对应知识详情抽屉（UF-6）；若索引未命中该知识（已被外部删除），行级失效标注，不阻塞列表其它条目"
- State: "抽屉打开；召回列表保持（其它条目不受失效条目影响）"
- Side-effect: "none"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project ＋ Session（一次召回链 / 零召回 / 含分组行三态）＋ UsageEvent（链口径 1 次）＋ KnowledgeEntry（在索引 / 外部删除失效两态）。统计口径断言按旅程链口径（1/1/徽章 1）。
