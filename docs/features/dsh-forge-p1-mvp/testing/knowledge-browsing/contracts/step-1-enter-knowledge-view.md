---
journey: "knowledge-browsing"
step: 1
step-action: "进入知识库浏览视图"
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

# Contract: knowledge-browsing / Step 1: 进入知识库浏览视图

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（热度徽章与使用事件计数一致性为同源数据断言；事件表逐条核对归审计通道） -->
<!-- 风险密度注记: 本 Journey 为 Low（只读），密度目标 4-7；但旅程定义的边界场景（1b/1c/1d/2b/2c/3b）为 eval-journey 通过的规格内容，按「旅程定义场景视同必察项」处理不强删——密度检查点记 ABOVE_TARGET_WITH_JOURNEY_MANDATE -->

## Outcome "success"
- Preconditions: "已注册项目，其知识目录存在分域组织的前端域 / 后端域知识文件（frontmatter 合规：摘要 / 关键词 / 状态 / 时间等）；前端域含 3 层目录链（前端 → 前端/规范 → 前端/规范/React，第 3 层放知识文件）；K1 已预置 3 条使用事件；应用侧知识索引已建立"
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
            value: "前端域 K1（标题与关键词含「部署」）/ 前端域 K2（全字段不含「部署」）/ 后端域若干 / 前端→规范→React 三层链第 3 层至少 1 条"
          - field: "frontmatter"
            value: "合规（含 summary 与 keywords 必填键）"
      - entity_type: "UsageEvent"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "KnowledgeEntry"
        field_constraints:
          - field: "entry"
            value: "K1（该知识累计 3 条使用事件）"
- Input: "左栏点「知识库」入口"
- Output: "中区整体切换为知识库视图（右栏隐藏、状态保留）；浏览页签（P1 唯一页签）呈现当前项目知识的 auto-fill 卡片网格（索引直读），卡片带热度徽章——K1 徽章数字 = 3，与 Setup 使用事件计数一致（Story 3 AC3 断言）；左轨域目录树呈现 fixture 3 层结构（目录即域，不超过 3 层；第 3 层节点可见——深度边界可达；超过 3 层目录的呈现口径 PRD 未定义，UNKNOWN 不入断言）"
- State: "视图态切换为知识视图，右栏隐藏且状态保留；索引内容与知识目录一致"
- Side-effect: "none（只读纪律——对知识目录零写入）"

## Outcome "empty-library-guide"
<!-- 溯源: journey Step 1b（空库引导；独立知识目录状态启动） -->
- Preconditions: "当前项目知识目录为空（无任何知识文件；依场景隔离独立启动）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "项目知识目录存在但为空（无任何知识文件，索引零条目）"
        prerequisite_entity: "KnowledgeEntry"
- Input: "进入知识库浏览视图"
- Output: "呈现「尚无知识」引导，说明知识目录位置；无卡片网格渲染"
- State: "索引零条目，空态引导在位"
- Side-effect: "none"

## Outcome "stale-cache-two-phase"
<!-- 溯源: journey Step 1c（索引失效后静默重建·暖缓存——两阶段观察契约） -->
<!-- fact-note: fact KNOWLEDGE_INDEX_REBUILD——shipped 代码仅在项目索引零行时内联重建（digest 存而不比，无过期检测后台重建路径）；阶段②的自动触发为旅程期望（缺陷信号/设计裁决点），测试实现需显式触发重建或经注入缝 -->
- Preconditions: "此前已进入过知识面板（索引缓存已建立）；其后知识目录在应用外被修改（新增 / 删除知识文件），索引相对目录已过期；目录仍含至少 1 个知识文件（依场景隔离）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cache_state"
            value: "暖缓存（索引已有行，相对目录过期：含被删条目、缺新增条目）"
- Input: "重新进入知识库浏览视图"
- Output: "两阶段观察契约——第一阶段：首显不被重建阻塞，面板立即呈现旧缓存内容（探针：本次新增条目暂不在网格、被删条目仍在）；第二阶段：重建完成后网格更新为最新目录内容（新增条目出现、被删条目消失）；全程无对账横幅（P1）。「重建不阻塞首显（缓存先行）」的可观察代理即上述先旧后新两阶段"
- State: "索引由旧缓存收敛到最新目录内容（可重建的派生缓存）"
- Side-effect: "none（对知识目录零写入；索引重建写应用侧派生缓存，不触源目录）"

## Outcome "cold-cache-skeleton"
<!-- 溯源: journey Step 1d（首次进入·冷缓存网格骨架；依场景隔离独立启动） -->
- Preconditions: "索引缓存不存在（首次进入知识面板；依场景隔离独立启动）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "索引零行（冷缓存——项目从未建立知识索引），知识目录含合规知识文件"
        prerequisite_entity: "KnowledgeEntry"
- Input: "进入知识库浏览视图"
- Output: "呈现网格骨架（UF-6「加载中」态）；索引建立完成后卡片网格就位"
- State: "索引由零行建立（首次解析落缓存）"
- Side-effect: "none（对知识目录零写入）"

## Journey Invariants

- 域过滤 = 目录路径前缀匹配：选「前端」域不得出现后端域条目；选中层节点含其整棵子树（Step 2c——子树包含为前缀语义派生，source: inferred）
- 详情抽屉正文区不得混入 frontmatter 字段
- 卡片热度数字恒等于该知识的使用事件计数（同源数据）——Step 1 以 K1 徽章 = 3 实例化（Setup 事件 fixture）；召回后热度 +1 的动态侧由兄弟 Journey knowledge-recall-flywheel 承载
- 浏览全程对知识目录零写入（只读纪律）

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project（已注册）＋ KnowledgeEntry（分域 fixture：K1/K2/后端域/三层链；或空目录/暖缓存过期/冷缓存零行三态独立启动）＋ UsageEvent（K1 3 条，belongs_to KnowledgeEntry）。场景隔离：1b/1c/1d 以独立知识目录状态启动，不与基线叠加。
