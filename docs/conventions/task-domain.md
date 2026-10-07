---
title: "任务域数据与契约约定"
domains: [task, identity, transition-targets, dispatch-prompt, column-naming]
---

# 任务域数据与契约约定

> 任务域（每工作区 forge.db + plugin-forge 面）的技术契约：身份双轨、状态转移纯函数、dispatchPrompt 构成、SQL 列名与存储纪律。

## 身份与键

### TECH-task-001: 任务身份双轨

**Requirement**: tasks.id（uuid 代理主键）= FK / 前端 / RPC 引用锚，恒稳定（slug 改名零级联）；slug + local_id（UNIQUE 复合自然键）= agent 识别面（'slug/localId' 呈现；UNIQUE(slug, local_id) 查捞）；agent 面 tool 输入 = slug + local_id 两显式参（免拼接歧义），服务内解析后走 id 路径；UI/RPC 面 = taskId；TaskSnapshot / TaskCard 恒含 {taskId, slug, localId}（前端以 taskId 为 key、slug/localId 为显示）；slug 列 ≡ feature slug（服务不变量 + validateFeatureTasks）。
**Source**: feature/dsh-forge-m2-pipeline TECH-005（tech-design §Interface 1·§关键技术决策·§Cross-Layer Data Map / packages/core/src/forge/tasks）

## 状态转移面

### TECH-task-002: transitionTargets 纯函数所见即所得

**Requirement**: transitionTargets(current, face) 单一纯函数双面——human = 七态 − 当前态（from≠to 任意，菜单全列机械排除自身）；agent = 转移矩阵推导；taskDetail.allowedTransitions（human 面）驱动转移对话框选项集，transitionTask 服务端先验 toStatus ∈ transitionTargets(current, 'human')——UI 菜单与服务端同一纯函数，零漂移。
**Source**: feature/dsh-forge-m2-pipeline TECH-006（tech-design §Interface 10·§关键技术决策 / packages/core/src/forge/tasks/state-machine.ts）

## 派发简报

### TECH-task-003: dispatchPrompt 构成契约

**Requirement**: 组成序 = 人格段（task-executor，无标签）→ `<constraints>` → `<task-context>` → `<type-policy>`；XML 标签集封闭于四枚（`<forge-pipeline>` 系统提示段 + 三块级标签），新增 = 契约面变更（G1 pin 锚定）；`<task-context>` = 键值行不加键级标签；digest = sha-256(全文，含人格段与标签) 前 12 hex；dispatchPrompt = executor 唯一差异化通道（无 per-spawn 系统提示注入）；dispatchPrompt 不入库，record 只存 digest（全文本体 = dsh 子会话日志）。
**Source**: feature/dsh-forge-m2-pipeline TECH-007（tech-design §Interface 9·§关键技术决策 / packages/core/src/forge/tasks/prompt）

## 存储纪律

### TECH-task-004: SQL 列名与存储纪律

**Requirement**: 列名保留字清剿（task_key / task_type / task_status / task_desc / feature_status / proposal_status 等跨方言保留字列名禁用）；rel_path 统一正斜杠、悬空容忍（dangling 态）；实际改动文件记录 = files_json 结构化 JSON 列（非自由文本）；全表 updated_at（基建表豁免）；每工作区库 schema 独立版本线（FORGE_DB_SCHEMA_VERSION）+ schema.sql ↔ MIGRATIONS 逐条 pin。
**Source**: feature/dsh-forge-m2-pipeline TECH-008（tech-design §Data Models·§关键技术决策·§Cross-Layer Data Map / packages/core/src/forge/workspace/migrations.ts）
