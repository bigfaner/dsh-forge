---
journey: "knowledge-browsing"
step: 4
step-action: "点卡片打开详情抽屉"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/journey.md
anchors:
  web:
    page: "工作台·知识库视图（浏览页签）"
    route: "workbench/knowledge"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中知识面板全宽）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: knowledge-browsing / Step 4: 点卡片打开详情抽屉

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "网格呈现知识卡片（衔接过滤态或全量态）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "frontmatter"
            value: "合规（含 frontmatter 块——供正文区不含 frontmatter 断言）"
- Input: "点一张知识卡片"
- Output: "右侧滑入详情抽屉——摘要块 + 两列元数据 + Markdown 正文（统一包装渲染）；正文区不含 frontmatter 字段；浏览上下文（网格与过滤条件）保持"
- State: "抽屉打开态；过滤条件与网格滚动上下文不变"
- Side-effect: "none（详情读取，零写入）"

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目；选中层节点含其整棵子树（Step 2c——子树包含为前缀语义派生，source: inferred）
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）；召回后热度 +1 的动态侧由兄弟 Journey knowledge-recall-flywheel 承载
- 浏览全程对知识目录零写入（只读纪律）

## Fixture Specification

本 Contract 前置数据状态：Project ＋ KnowledgeEntry（含 frontmatter 块的合规条目，belongs_to Project）。
