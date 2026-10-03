---
journey: "knowledge-recall-flywheel"
step: 4
step-action: "agent 自主完成多步检索链（agentic search）"
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

# Contract: knowledge-recall-flywheel / Step 4: agent 自主完成多步检索链（agentic search）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（检索链时序的直接 UI 证据由 Step 6 行使；4b/4c 经能力面 contract 直测通道驱动） -->
<!-- fact-note: fact RECALL_LOG_RECORDED——shipped 代码按「每次工具调用 × 每命中条目」逐行记使用事件（零命中 search 记哨兵行）；旅程口径为「一次命中的检索链记 1 条」。本 Step success 的 State 按旅程链口径声明（缺陷信号设计，见 Journey Invariants） -->

## Outcome "success"
- Preconditions: "Q1 已发送处理中（衔接 Step 3）；K1 在库可命中（基线 Setup 满足）；真实模型往返非确定——观察窗内无链可重发（见 State）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "pending_question"
            value: "Q1 处理中"
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title_keywords"
            value: "K1 含「部署」（前端域，可命中）"
- Input: "将问题交由 agent 处理（agent 自主编排检索）"
- Output: "agent 自主完成 search（选前端域前缀 + 关键词细分）→ 命中 K1 → read-abstract 读摘要的多步检索链；链时序的直接 UI 证据由 Step 6 行使"
- State: "检索链发生（一次命中的检索链记 1 次召回——链口径）；使用事件落应用状态层；观察窗 = 提问后 120s 内轨迹出现检索链，窗内无链 → 同一 fixture 问题重发 ≤2 次；仍无 → 降级能力面 contract 通道验证同等断言并记 flake"
- Side-effect: "使用事件落应用状态层（知识召回日志表）"

## Outcome "domain-prefix-filter-correct"
<!-- 溯源: journey Step 4b（search 域前缀过滤正确性）；产品 UI 无直调检索原语入口——经能力面 contract 直测通道驱动（source: inferred，测试基建契约） -->
- Preconditions: "知识库同时存在前端域与后端域知识条目（基线 Setup 即满足）；能力面 contract 通道可用"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "domain_layout"
            value: "前端域与后端域条目并存（对照断言基础）"
- Input: "以「前端」域前缀发起 search 查询——经能力面 contract 直测通道驱动（产品 UI 无直调检索原语的入口）"
- Output: "前端域查询不返回后端域条目——域前缀过滤正确，命中集只含前端域知识（SC10 原文）"
- State: "域前缀过滤语义生效（目录路径段边界前缀）"
- Side-effect: "none（contract 通道直测，不进会话统计断言口径）"

## Outcome "prefix-omitted-all-domain"
<!-- 溯源: journey Step 4c（域前缀省略 = 全域检索；省略域前缀本身即 agent 自主决策的一种取值，非用户指定域） -->
- Preconditions: "能力面 contract 通道可用（同 4b 通道）；前后端域条目并存"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "KnowledgeEntry"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "domain_layout"
            value: "前端域与后端域条目并存"
- Input: "经同一 contract 通道发起不带域前缀的 search 查询"
- Output: "检索跨全域进行，命中不受域限制（前端域与后端域条目均可命中）；域选择是 agent 自主决策而非用户指定"
- State: "省略前缀 = 全域检索语义"
- Side-effect: "none"

## Outcome "no-hit-fallback-regular-retrieval"
<!-- 溯源: journey Step 4d（search 无命中时转常规检索；依场景隔离无关库工作区独立启动） -->
<!-- fact-note: fact RECALL_LOG_RECORDED——零命中 search 在 shipped 代码记哨兵行 -->
<!-- adjudication: fix-11 裁决（哨兵行口径，2026-10-03）——零命中 search = 已发生的召回事件：
     哨兵行为 RecallGroup 契约一等分组（hitCount=0 / hits=[]），计入召回次数、不计覆盖与热度
     （heatByEntry 排除哨兵行）。召回 tab 呈「召回次数 ≥1 · 覆盖知识 0」；「本会话暂无召回」
     占位语义 = 零召回事件（Step 7b 面），非「零命中」。原「召回 tab 保持占位」期望随之撤销。 -->
- Preconditions: "知识库中不存在与问题相关的知识（依 Setup 场景隔离：无关库工作区，全字段不含「部署」「构建」——Q1 无命中确定）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "knowledge_dir"
            value: "无关库（全字段不含「部署」「构建」）——专属工作区独立启动"
- Input: "在对话 tab 发送 Q1（search 未获命中为该库态下的确定前置，非用户动作）"
- Output: "agent 转常规检索原语（grep / glob 等）继续处理，回答正常完成不阻塞、不出错；无知识使用事件落库（热度面排除哨兵行）；召回 tab 若 agent 实走知识检索则记零命中召回（次数 ≥1、覆盖 0——哨兵行口径），未实走则保持占位（模型自主，soft 承载）"
- State: "无命中召回链；无知识使用事件（热度基线保持 0）"
- Side-effect: "至多零命中哨兵行落 knowledge_recall_logs（计数不含覆盖/热度）"

## Outcome "abstract-first-long-body"
<!-- 溯源: journey Step 4e（read-abstract 摘要先行——正文不整段注入）；基线 K2 正文数量级超长，必超 token 预算极简值（阈值设计期定，UNKNOWN） -->
- Preconditions: "命中知识的正文较长（基线 K2 正文数量级超长）；以 Q2「本项目的前端构建规范是什么？」提问命中 K2"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "KnowledgeEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "body_length"
            value: "K2 正文数量级超长（必超 token 预算极简值——阈值设计期定，UNKNOWN）"
          - field: "title_keywords"
            value: "含「构建」（Q2 命中确定）"
- Input: "在对话 tab 发送 Q2，agent 对命中知识执行 read-abstract"
- Output: "默认返回摘要而非整段正文——token 预算受控，agent 按需决定是否继续读取（SC10 断言）"
- State: "摘要先行（abstract 面返回不含正文）；正文不整段注入"
- Side-effect: "使用事件落应用状态层（该链按链口径记 1 次，供 8b）"

## Journey Invariants

- 每次召回于执行点记一次使用事件（事件表可查）；「一次召回」计数口径 = 一次命中的检索链记 1 条（source: inferred——PRD 未定义计数单位，召回飞轮流 Mermaid 中 search 与 read-abstract 两支均汇入事件节点；动词明细的链内映射 UNKNOWN 不入断言；实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）；会话知识召回 tab、卡片热度与事件计数同源一致——同源核对归审计通道，浏览器侧以实例化数字断言
- 检索原语与 grep / glob 同位：agent 自主编排多步检索（agentic search），无应用侧检索管线
- read-abstract 默认摘要先行——正文不整段注入
- 应用对代码仓、文档位置与知识目录零写入（只读纪律）；使用事件只落应用状态层
- 会话三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project ＋ Session（问题处理中）＋ KnowledgeEntry（K1 部署命中 / K2 构建超长正文 / 前后端域并存 / 无关库工作区独立态）。4b/4c 经能力面 contract 直测通道（产品 UI 无直调入口——测试基建契约）。
