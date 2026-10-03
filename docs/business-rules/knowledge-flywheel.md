---
title: "知识飞轮规则"
domains: [knowledge, recall, frontmatter, heat, index, agentic-search]
---

# 知识飞轮规则

> 知识资产飞轮（召回 → 事件 → 热度 → 再沉淀）的域不变量：召回事件单表同源、frontmatter 共享契约、agentic search 定位。

## 召回事件与热度

### BIZ-knowledge-001: 召回事件单表同源与热度口径

**Rule**: 每次召回于执行点写 `knowledge_recall_logs`：一行 = 调用 × 命中条目、`call_id`（uuid）分组、零命中写 `entry_id=NULL` 哨兵行；召回 tab 与卡片热度消费同一单表（单表双消费面）；热度口径 = 按条目 COUNT（search 命中与 read-abstract 各计一次；哨兵行不计）——热度展示必须与计数一致（断言）。
**Context**: 「哪些知识在哪些会话被用了」是飞轮第一圈的核心资产；单表同源杜绝 tab 与热度两套口径漂移（快照字段 title_snap/domain_snap/frontmatter_id 抗索引重建）。
**Source**: feature/dsh-forge-p1-mvp BIZ-013（prd-spec §Flow Description 流程三第 4 步 / tech-design §Interface 2 / §Data Models）

## 知识文件契约

### BIZ-knowledge-002: frontmatter 最小契约与解析容错

**Rule**: 知识条目必填 `summary`（string）与 `keywords`（string[]）；`title` 缺省 = 文件名去扩展名；`status` 缺省 `draft`；`updated` 缺省取文件 mtime；域 = 目录路径派生（无 frontmatter 字段，单一事实源），层级 ≤3；缺必填或超层的条目不入索引（rebuild 报告计数 + UI 空态提示），硬拒收归后续写入面里程碑。契约常量唯一源在 `packages/contracts/frontmatter.ts`（应用与技能共享契约的子集）。
**Context**: 应用与 forge 技能共享同一知识文件面，契约须稳定且宽容（知识目录可能被外部工具写入）。
**Source**: feature/dsh-forge-p1-mvp BIZ-014（tech-design §frontmatter 最小契约 / packages/contracts/src/frontmatter.ts）

## 召回定位

### BIZ-knowledge-003: 召回定位 = agentic search 工具集 + 摘要先行

**Rule**: 召回能力面定位为与 grep/glob 同位的检索原语，供 agent 自主编排多步检索（`search` → `read-abstract` → …）——产品不做应用侧编排的检索管线；`search` 域前缀为可选参数（agent 依问题自主选域，省略 = 全域）+ 关键词细分；`read-abstract` 摘要先行（返回体不含正文）；系统提示词携带最简知识段（知识库存在声明 + 召回流程指引 + 两 tool 用法），随知识插件交付、产品出契约内容源。
**Context**: brainstorm 显式裁决（2026-10-02）——应用侧检索管线会与 agent 既有 agentic search 流程形成平行模式；摘要先行防正文整段注入。
**Source**: feature/dsh-forge-p1-mvp BIZ-015（proposal §Innovation Highlights / prd-spec §Flow Description 流程三第 3 步 / tech-design §Interface 3）
