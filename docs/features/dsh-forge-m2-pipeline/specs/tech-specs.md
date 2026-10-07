---
feature: "dsh-forge-m2-pipeline"
generated: "2026-10-07"
status: draft
---

# Technical Specifications: dsh-forge M2 —— forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）

> 提取源：design/tech-design.md（含 §关键技术决策与 §Interface 1-10）、prd-spec §Performance Requirements。
> 目标文件映射为 non-interactive 自动集成裁决（[auto-specs]）。

## 服务面与 MVC

### TECH-001: 按域服务划分（MVC 落位）

**Requirement**: Model = core 按域服务（域内聚、读写一体、API 独立于前端保持稳定——现值六服务：forgeProjects / forgeKnowledge / forgeTasks / forgeFeatures / forgeProposals / forgeDocs）；Controller = 两个薄面（RPC 通道族 = 人类面，tool 面 = agent 面，只做参数映射与路由）；View = apps/web；跨域聚合（如 ov-head）由前端组合多域读完成，不设按视图命名的聚合服务（forgeOverview 方案否决——用户裁决 2026-10-06）。
**Scope**: [CROSS]
**Source**: tech-design §Overview MVC 落位·§Interfaces·§关键技术决策

→ docs/conventions/rpc-and-contracts.md

## 多库与事件

### TECH-002: 每工作区库惰性首开 + 失败隔离

**Requirement**: 每库每进程首次触达 ensureOpen（open + migrate + 开库结构健全性检查 = 版本门 + PRAGMA foreign_key_check + 表在场——恒轻量，不开库全库派生复检）；openDatabase 参数化传入工作区迁移序列（独立版本线 FORGE_DB_SCHEMA_VERSION，中央 MIGRATIONS 硬编码 import 勿照抄）；失败 → 该工作区标不可用（ERR_WORKSPACE_DB_UNAVAILABLE + 工作区 app_key_logs scope=tasks + 概览错误态），应用与其余库照常；存量库缺席 = 补建 + 发现面扫描（与注册径同构）；三层校验职责 = 写事务内增量断言（承重）· validateFeatureTasks 单 feature 子图 · 开库结构健全性。
**Scope**: [CROSS]
**Source**: tech-design §Overview 关键机制 2·§Interface 1·§交互二

→ docs/conventions/rpc-and-contracts.md

### TECH-003: 写推送事件链

**Requirement**: 四域一切写动词（tasks 全动词 + registerFeature/transitionFeature/upsertFeatureDoc + createProposal/transitionProposal）闭包尾部 emitTasksChanged(projectId)（同通道同载荷 {projectId}——概览三子 tab 统一刷新）；core 侧 process.send（child 形态 IPC；缺席静默降级——交互重取兜底）→ run.ts 消息分流 event 分支 → webContents.send('forge:events/tasks-changed') → renderer 订阅重取（web/rpc 共享订阅层 50ms 合并）；「即时」判据 = 写入返回后单次重取即见新值 + 事件延迟 ≤500ms；桥事件信封（BridgeEventMessage）为产品自有协议扩展，零上游改动。
**Scope**: [CROSS]
**Source**: tech-design §Overview 关键机制 1·§Interface 6·§交互二

→ docs/conventions/rpc-and-contracts.md

### TECH-004: tool 面 cwd 路由与 actor 通道推断

**Requirement**: tool 执行点 exec.agent.session.header.cwd → normalizeFsPath 匹配中央 projects.ws_path → projectId（无匹配 = ERR_WORKSPACE_NOT_REGISTERED）；UI RPC 侧显式带 projectId；actor 由通道推断（tool = 'plugin-tool' + exec ctx sessionId；RPC = 'ui'），输入面不收；cwd→projectId 数据缝 = 复用 knowledge bindingsFile 机制（host 维护 {wsPath, projectId} JSON，boot overlay 注入插件行 config，注册后增量刷新）——插件对 core 零实现级 import。
**Scope**: [CROSS]
**Source**: tech-design §Overview 关键机制 3·§Interface 8·§交互四

→ docs/conventions/rpc-and-contracts.md

## 任务数据模型

### TECH-005: 任务身份双轨

**Requirement**: tasks.id（uuid 代理主键）= FK / 前端 / RPC 引用锚，恒稳定（slug 改名零级联）；slug + local_id（UNIQUE 复合自然键）= agent 识别面（'slug/localId' 呈现；UNIQUE(slug, local_id) 查捞）；agent 面 tool 输入 = slug + local_id 两显式参（免拼接歧义），服务内解析后走 id 路径；UI/RPC 面 = taskId；TaskSnapshot / TaskCard 恒含 {taskId, slug, localId}（前端以 taskId 为 key、slug/localId 为显示）；slug 列 ≡ feature slug（服务不变量 + validateFeatureTasks）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 1·§关键技术决策·§Cross-Layer Data Map

→ docs/conventions/task-domain.md

### TECH-006: transitionTargets 纯函数所见即所得

**Requirement**: transitionTargets(current, face) 单一纯函数双面——human = 七态 − 当前态（from≠to 任意，菜单全列机械排除自身）；agent = 转移矩阵推导；taskDetail.allowedTransitions（human 面）驱动转移对话框选项集，transitionTask 服务端先验 toStatus ∈ transitionTargets(current, 'human')——UI 菜单与服务端同一纯函数，零漂移。
**Scope**: [CROSS]
**Source**: tech-design §Interface 10·§关键技术决策

→ docs/conventions/task-domain.md

### TECH-007: dispatchPrompt 构成契约

**Requirement**: 组成序 = 人格段（task-executor，无标签）→ `<constraints>` → `<task-context>` → `<type-policy>`；XML 标签集封闭于四枚（`<forge-pipeline>` 系统提示段 + 三块级标签），新增 = 契约面变更（G1 pin 锚定）；`<task-context>` = 键值行不加键级标签；digest = sha-256(全文，含人格段与标签) 前 12 hex；dispatchPrompt = executor 唯一差异化通道（无 per-spawn 系统提示注入）；dispatchPrompt 不入库，record 只存 digest（全文本体 = dsh 子会话日志）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 9·§关键技术决策

→ docs/conventions/task-domain.md

### TECH-008: SQL 列名与存储纪律

**Requirement**: 列名保留字清剿（task_key / task_type / task_status / task_desc / feature_status / proposal_status 等跨方言保留字列名禁用）；rel_path 统一正斜杠、悬空容忍（dangling 态）；实际改动文件记录 = files_json 结构化 JSON 列（非自由文本）；全表 updated_at（基建表豁免）；每工作区库 schema 独立版本线（FORGE_DB_SCHEMA_VERSION）+ schema.sql ↔ MIGRATIONS 逐条 pin。
**Scope**: [CROSS]
**Source**: tech-design §Data Models·§关键技术决策·§Cross-Layer Data Map

→ docs/conventions/task-domain.md

## 外部命令与降级

### TECH-009: git 可选依赖与只读查询纪律

**Requirement**: git = 可选环境依赖（ENOENT 与失败同路静默回退记录语；submit 质量门不含 git；executor 遇 git 缺席走 submitTask result=blocked，fix 链承接）；git 只读查询 = execFile('git', [白名单子命令]) 恒数组参、禁 shell 字符串拼接、timeout 2s（白名单子命令 = show / diff-tree）；失败 / ENOENT 回退记录语。
**Scope**: [CROSS]
**Source**: tech-design §Dependencies·§Interface 1·§Security Mitigations ③

→ docs/conventions/error-handling.md

## 文档渲染面

### TECH-010: mermaid 渲染纪律

**Requirement**: 产品依赖 mermaid 包（精确 pin + lockfile）；懒加载——仅文档 tab 含 mermaid 块时动态 import（零块零加载）；securityLevel='strict'（库默认 sanitize，禁 click 回调交互）；erDiagram = 验收锚，全图型同库渲染；渲染失败 / 非法源回退纯文本占位卡（异常不外溢）。
**Scope**: [CROSS]
**Source**: tech-design §Dependencies·§Security Mitigations ⑦（2026-10-06 用户裁决）

→ docs/conventions/doc-surface.md

### TECH-011: 文档读路径守卫与悬空容错

**Requirement**: readDoc resolve 后必须 startsWith(canonical(forge_dir))，越界 = ERR_DOC_PATH_INVALID；「在编辑器中打开」= openExternal 仅 main 侧执行、先经桥校验路径在册（projectHead 路径集 = 该工作区 feature_documents ∪ proposals 的 rel_path canonical 解析全集，越界即拒）；文档引用悬空（模拟分支切换）→ 只读占位面：路径栏保留、不崩溃、不写入、不删行。
**Scope**: [CROSS]
**Source**: tech-design §Interface 4·§Security Mitigations ①②·SC-branch

→ docs/conventions/doc-surface.md

## 测试与性能

### TECH-012: 查询计划断言纪律（EQP）

**Requirement**: 热查询（就绪集 / 前置守卫 / 恢复钩子反查）必须索引命中——查询计划由断言锁死（EXPLAIN QUERY PLAN，防全表扫描回归）；性能预算形态 = 概览任务列表首屏 ≤2s @500 任务（机械判据，压力上界；数据全部直读无文件扫描型加载）；tool 写入与 UI 读取无锁竞争（派发循环与页签浏览互不阻塞）。
**Scope**: [CROSS]
**Source**: prd-spec §Performance Requirements / tech-design §Testing Strategy

→ docs/conventions/quality-gates.md

### TECH-013: 录制-回放测试主径

**Requirement**: UI 功能测试以录制-回放为主径（dogfood 真实模型的动词调用序列录成 JSONL 夹具，e2e 按序列经 main 侧测试钩子 / forge.db 直插重放）。
**Scope**: [CROSS]
**Source**: tech-design §Testing Strategy（2026-10-06 用户裁决）

→ **[skip]** 已由 docs/conventions/quality-gates.md TECH-quality-004 承载（重叠保留双方，本次不重复集成）

## 特性内实现细节（LOCAL）

### TECH-014: G1 契约面 pin 扩池枚举（第 9-16 项）

**Requirement**: 桥事件信封 / 四新服务白名单 AssertNever / tool 注册面六在场两缺席 / 每工作区 DB 布局 / RPC 通道族 allowlist 五族 / XML 标签集四枚封闭 / TaskType 20 值词汇 + 中英状态标签 / sidebarRightTabs 两段注册 + header.actions 槽面。
**Scope**: [LOCAL]
**Source**: tech-design §契约面 pin 扩池（纪律已由 TECH-quality-002 承载，枚举留 feature）

→ stays in feature

### TECH-015: 概览/文档 tab 集成细节（existing-page 五处）

**Requirement**: RegisterForm 派生行 RPC 化 / SessionTaskPills（conversation.session.header.actions 槽）/ FORGE_CLIENT_INJECT += sidebarRightTabs / dswf-overview（guide entry 最前）+ dswf-doc（multiple，address 去重）/ ShellHost 锚定复用 knowledge-anchor 裁决。
**Scope**: [LOCAL]
**Source**: tech-design §Integration Specs

→ stays in feature
