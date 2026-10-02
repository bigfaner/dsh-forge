---
journey: "knowledge-browsing"
step: 3
step-action: "工具栏关键词细分"
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

# Contract: knowledge-browsing / Step 3: 工具栏关键词细分

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "当前处于域过滤态（衔接 Step 2）；关键词 fixture：K1 标题与 frontmatter 关键词均含「部署」，K2 全字段（标题 / 关键词 / 摘要 / 正文）不含「部署」——命中 / 未命中在任何字段口径下均确定"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "keyword_fixture"
            value: "K1 双命中（标题与关键词均含「部署」）/ K2 全字段不含「部署」"
    state_requirements:
      - description: "当前处于前端域过滤态（衔接 Step 2 终态）"
        prerequisite_entity: "KnowledgeEntry"
- Input: "在工具栏搜索框输入 fixture 关键词「部署」"
- Output: "在域过滤基础上进一步细分——网格呈现 K1 卡片（标题与关键词双命中）、不呈现 K2 卡片（全字段未命中）；命中字段口径 UNKNOWN（规避策略见 Setup）"
- State: "过滤条件 = 域前缀 + 关键词叠加"
- Side-effect: "none"

## Outcome "blank-keyword-no-tighten"
<!-- 溯源: journey Step 3b（空关键词不收紧过滤）；Web surface 必察项 validation-error 的实步承载——按「空条件不生效」最小语义派生（source: inferred） -->
- Preconditions: "当前处于域过滤态、搜索框为空（衔接 Step 2）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "当前处于前端域过滤态，网格呈现域过滤结果"
        prerequisite_entity: "KnowledgeEntry"
- Input: "在搜索框输入纯空白字符"
- Output: "过滤不收紧——等价于无关键词条件，网格保持域过滤结果；无报错、不进入空结果态"
- State: "过滤条件不变（空白不生效）"
- Side-effect: "none"

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目；选中层节点含其整棵子树（Step 2c——子树包含为前缀语义派生，source: inferred）
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）；召回后热度 +1 的动态侧由兄弟 Journey knowledge-recall-flywheel 承载
- 浏览全程对知识目录零写入（只读纪律）

## Fixture Specification

本 Contract 前置数据状态：Project ＋ KnowledgeEntry（K1/K2 关键词 fixture——双命中 / 全未命中对）＋ 域过滤态前置（衔接 Step 2）。
