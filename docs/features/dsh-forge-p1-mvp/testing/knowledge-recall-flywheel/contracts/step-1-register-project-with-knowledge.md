---
journey: "knowledge-recall-flywheel"
step: 1
step-action: "注册项目（含知识库目录）"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/journey.md
anchors:
  web:
    page: "添加项目（两段模态流程）"
    route: "modal/add-project"
    requires_auth: false
    layout: "覆盖中区的模态"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: knowledge-recall-flywheel / Step 1: 注册项目（含知识库目录）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（索引解析非浏览器可观察，可观察代理 = Step 8 知识库网格） -->

## Outcome "success"
- Preconditions: "目标项目工作区目录就位；知识库目录（工作区下 .knowledge 子目录）含分域知识文件（frontmatter 合规）：前端域 K1（标题 / 关键词含「部署」，正文常规长度）、前端域 K2（标题 / 关键词含「构建」，正文数量级超长——必超 token 预算极简值，阈值设计期定 UNKNOWN）、后端域条目若干；K1 / K2 关键词零交集；使用事件基线 = 0（目标项目全新注册，应用处于零项目状态）；dsh 会话运行时可用"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册（目标项目全新注册，从零项目走全链）"
          - field: "knowledge_dir"
            value: "工作区下 .knowledge 子目录（默认，含 K1/K2/后端域 fixture）"
      - entity_type: "KnowledgeEntry"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "WorkspaceDirectory"
        field_constraints:
          - field: "keyword_fixture"
            value: "K1 含「部署」/ K2 含「构建」（关键词零交集）+ 后端域若干（供 4b 对照）"
    state_requirements:
      - description: "使用事件基线 = 0（无预置事件，热度断言基线）；dsh 会话运行时可用"
        prerequisite_entity: "UsageEvent"
- Input: "hero 空态 → 添加项目两段式流程，选定工作区目录（知识库目录取默认），注册表单点「确认」"
- Output: "注册成功，左栏出现项目与 dsh 会话列表；「知识目录解析入应用侧索引（可重建缓存）」非浏览器可观察，其可观察代理 = Step 8 知识库网格呈现 K1 / K2 卡片"
- State: "应用库 projects 行写入（workspace 外键一致）；dsh registry 注册在场；知识索引待首次解析（代理断言后置 Step 8）"
- Side-effect: "dsh registry 注册 + 应用库写入 + 知识索引解析（可重建缓存）"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 前置数据状态：WorkspaceDirectory（未注册目标工作区，含 .knowledge fixture）＋ KnowledgeEntry（K1 部署 / K2 构建超长正文 / 后端域，belongs_to WorkspaceDirectory）＋ 使用事件基线 0。
