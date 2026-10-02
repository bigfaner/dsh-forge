---
journey: "knowledge-browsing"
step: 5
step-action: "关闭抽屉回到浏览上下文"
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

# Contract: knowledge-browsing / Step 5: 关闭抽屉回到浏览上下文

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "详情抽屉打开中（衔接 Step 4 终态，网格处于过滤态）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "抽屉打开且网格过滤条件在场（衔接 Step 4 终态）"
        prerequisite_entity: "KnowledgeEntry"
- Input: "按 Esc 或点关闭按钮关闭抽屉"
- Output: "抽屉关闭，回到网格浏览上下文（过滤条件不丢失，无需重新过滤）"
- State: "抽屉关闭态；浏览上下文（过滤条件与网格状态）原样保持"
- Side-effect: "none"

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目；选中层节点含其整棵子树（Step 2c——子树包含为前缀语义派生，source: inferred）
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）；召回后热度 +1 的动态侧由兄弟 Journey knowledge-recall-flywheel 承载
- 浏览全程对知识目录零写入（只读纪律）

## Fixture Specification

本 Contract 前置数据状态：Project ＋ KnowledgeEntry ＋ 抽屉打开态前置（衔接 Step 4 终态）。
