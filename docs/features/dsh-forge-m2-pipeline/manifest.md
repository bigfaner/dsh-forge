---
feature: "dsh-forge-m2-pipeline"
created: "2026-10-05"
status: completed
---

# Feature: dsh-forge-m2-pipeline

<!-- Status flow: prd → design → tasks → in-progress → completed -->

## Documents

| Document | Path | Summary |
|----------|------|---------|
| PRD Spec | prd/prd-spec.md | M2 四交付面（每工作区任务库 + 动词 API / plugin-forge 执行链 / 概览 dock tab + SC6③ / 8 项 SC 验收）；spike S8/S9①/S10 结论内化；对账卡按用户裁决移出 |
| User Stories | prd/prd-user-stories.md | 7 stories：任务浏览与人工决策 / 派发链 dogfood / fix 链自动恢复 / 中断幂等重入 / 文档浏览（含仓外与悬空）/ 挂接双侧 / 注册派生行与移动保护 |
| UI Functions | prd/prd-ui-functions.md | 4 UF：概览 dock tab·三子 tab+三视图（DAG/泳道/排序/搜索）/ 文档 dock tab（mermaid 图渲染——erDiagram 验收锚，失败回退占位卡）/ 会话头挂接 pill / 注册表单派生行——左栏不加行、中区不加面板、三签不动 |
| UI Design | ui/ui-design.md | v17 = 流程图渲染(graph/flowchart,分层+回边路由);v16 = 文档 tab mermaid 图渲染(erDiagram 验收锚,占位卡降级为回退态);v15 = completed 实际耗时四处呈现(列表/DAG/泳道/抽屉 chip,记录推导);v14 备注移至覆盖率之下;v13 预估耗时 + 参考文档 chip 点击 dock 开 tab（refDocs 映射）+ 目标/结果上下展示 + 全加粗;v12 chip kv + 块标题底色条 + 路径完整展示;v11 顺滑折叠;v10 改动范围双列（commit 优先）+ 合并时间线;135 断言全绿 |
| Tech Design | design/tech-design.md | 六工件（+plugin-forge）· 按域四服务（tasks/features/proposals/docs,MVC）;写推送事件桥 / 惰性首开多句柄 / cwd 路由;dispatchPrompt（人格段+XML 三标签）+ §7-6 映射定稿;transitionTargets 所见即所得;录制-回放测试主径;git 可选依赖;mermaid 图渲染（产品依赖,懒加载+strict,erDiagram 验收锚）;关键交互流程图 ×4（派发链/惰性首开+事件/注册+发现/面分治——doc tab 自举渲染）;schema 评审门三版定稿 |
| ER Diagram | design/er-diagram.md | 每工作区 forge.db 七域表 + schema_meta;与八表定稿 8 项差异清单（M3 后移 ×3 + 本设计修订 ×5:保留字清剿/全表 updated_at/feature_id id 关联/rel_path 统一/files_json） |
| SQL Schema | design/schema.sql | M2 落地形态完整 DDL:七域表 + 索引 ×6 + append-only 双触发器 + CHECK 全集;FORGE_DB_SCHEMA_VERSION=1 独立版本线;中央 state.db 零改动 |
| Page Map | design/page-map.md | 右栏两 tab（sidebarRightTabs 注册制）+ 任务抽屉 + 转移对话框 + 会话头 pill 槽 + 派生行——六面落点文件与数据源;无新路由 |
| Specs | specs/biz-specs.md · specs/tech-specs.md | 规格 consolidation 预览与集成台账（2026-10-07 [auto-specs]：CROSS 27 项入项目级——business-rules 15[task-pipeline 新 11 + product-discipline 3 + workspace-consistency 1] + conventions 12[rpc-and-contracts 4 + task-domain 新 4 + doc-surface 新 2 + error-handling 1 + quality-gates 1]；P1 期规格漂移 9 项同步修订） |

## Traceability

> 29 业务任务（5 阶段：契约与数据基座 → core 四域服务 → 面层与前端组件 → 视图集成 → 测试主径与门）；阶段结构 = 依物分层（PRD 无阶段标记，phase-detection 守卫条款触发——无 phase-inventory.json）。全任务单面：surface-type `web`。

| PRD Section | Design Section | UI Component | Placement | Tasks |
|-------------|----------------|--------------|-----------|-------|
| Goals · SC7 真闭环 / SC-M2 门 | tech-design §Interfaces 1/6/8/9（tool 面 + 事件推送链 + dispatchPrompt）+ §交互一 | UF-1 概览三视图 + 任务抽屉（ui-design §UF-1/§任务详情抽屉） | existing-page:右栏 dock tab | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 5.1, 5.2, 5.4 |
| Goals · SC4 文档浏览 | tech-design §Interface 4（forgeDocs）+ §交互三（发现面扫描契约） | UF-2 文档 dock tab（ui-design §UF-2） | existing-page:右栏 dock tab | 1.3, 2.7, 3.9, 4.1, 5.2 |
| Goals · SC6③ 挂接双侧 | tech-design §Interface 1（sessionLinks 双源）+ §Integration 2（header.actions 槽 + cwd 单库） | UF-3 会话头挂接 pill（ui-design §UF-3） | existing-page:conversation.session.header.actions | 2.6, 3.10, 4.2, 5.2 |
| Goals · SC2 扩展任务域 | tech-design §Interface 5（deriveTaskStoreDir 单源）+ §Testing（EQP/无 watch/录制-回放） | UF-4 派生行 + 概览 tab（ui-design §UF-4） | existing-page:RegisterForm.tsx | 1.2, 1.4, 2.6, 3.11, 4.3, 5.3 |
| Goals · SC-branch 悬空容错 | tech-design §Interface 4（悬空态）+ schema rel_path | UF-2 文档 tab 占位面 | existing-page:右栏 dock tab | 2.7, 3.9, 5.2 |
| Goals · SC-NFR 回归 | tech-design §Security（路径守卫/单写路径/mitigations）+ §Testing G0/G1 | — | — | 1.1, 2.7, 3.1, 5.3 |
| Goals · SC8 零迁移 | tech-design §交互三（frontmatter 单向阀门；无迁移代码路径）+ §Integration 1 | — | — | 1.3, 4.3, 5.3 |
| Stories 1–7（浏览决策/派发/fix 链/重入/文档/挂接/派生行） | tech-design §PRD Coverage Map 全 15 行 | 见上各行 | 见上各行 | 已由上行覆盖（映射见各任务 User Stories 节） |
