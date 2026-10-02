---
journey: "knowledge-browsing"
step: 2
step-action: "域目录树前缀过滤"
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

# Contract: knowledge-browsing / Step 2: 域目录树前缀过滤

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "域树呈现 fixture 3 层结构（衔接 Step 1），网格处于未过滤态；前端域与后端域知识并存"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 4
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "domain_layout"
            value: "前端域（含三层链）与后端域并存，未过滤态全量可见"
- Input: "点域树「前端」域节点"
- Output: "网格按目录路径前缀过滤——仅前端域知识卡片出现，后端域条目不出现在网格中"
- State: "域过滤条件 = 前端域前缀（段边界前缀匹配）"
- Side-effect: "none"

## Outcome "no-result-clear-filter"
<!-- 溯源: journey Step 2b（组合过滤无结果；恢复目标态 = 全量网格，source: inferred——UF-6 仅定义提示与清除入口，恢复语义派生自「清除过滤」字面义 + Setup 非空库） -->
- Preconditions: "域过滤与关键词组合后无任何命中（fixture：前端域过滤 + 关键词「qz9」——全部知识全字段不含）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 4
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "keyword_fixture"
            value: "token「qz9」全字段不含（命中确定不成立）"
    state_requirements:
      - description: "当前处于前端域过滤态且关键词「qz9」已输入（组合零命中）"
        prerequisite_entity: "KnowledgeEntry"
- Input: "查看网格区域，点清除过滤入口"
- Output: "呈现空结果提示与清除过滤入口（UF-6 States 原文）；点清除入口后过滤条件清空、网格回到全量卡片"
- State: "过滤条件清空（域与关键词双清），恢复全量网格态"
- Side-effect: "none"

## Outcome "mid-level-subtree-included"
<!-- 溯源: journey Step 2c（中层域节点选择——前缀含子树，source: inferred——UF-6 仅定义「目录路径前缀匹配」，子树包含为前缀语义派生） -->
- Preconditions: "域树呈现 3 层 fixture 结构（Step 1），处于未过滤态"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "domain_path"
            value: "第 3 层「前端/规范/React」下至少 1 条（子树包含断言对象）"
- Input: "点第 2 层域节点「规范」"
- Output: "网格呈现「前端/规范」子树全部卡片，含第 3 层「前端/规范/React」下条目——前缀匹配含整棵子树"
- State: "域过滤条件 = 中层节点前缀（子树包含语义）"
- Side-effect: "none"

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目；选中层节点含其整棵子树（Step 2c——子树包含为前缀语义派生，source: inferred）
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）；召回后热度 +1 的动态侧由兄弟 Journey knowledge-recall-flywheel 承载
- 浏览全程对知识目录零写入（只读纪律）

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project ＋ KnowledgeEntry（分域 fixture，三层链第 3 层至少 1 条；组合零命中场景叠加关键词「qz9」全字段不含的 token 契约）。
