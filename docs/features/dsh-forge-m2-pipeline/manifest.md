---
feature: "dsh-forge-m2-pipeline"
created: "2026-10-05"
status: design
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

## Traceability

| PRD Section | Design Section | UI Component | Tasks |
|-------------|----------------|--------------|-------|
| Goals · SC7 / SC-M2 | tech-design §Interfaces 1/6/8/9（tool 面 + 事件推送链 + dispatchPrompt 合成）+ §交互一 | UF-1 任务抽屉 / 概览三视图 | — |
| Goals · SC4 | tech-design §Interface 4（forgeDocs）+ §交互三（发现面扫描契约） | UF-2 文档 dock tab | — |
| Goals · SC6③ | tech-design §Interface 1（sessionLinks 双源）+ §Integration 2（header.actions 槽 + cwd 单库） | UF-1 任务抽屉 / UF-3 挂接 pill | — |
| Goals · SC2 / SC-branch / SC-NFR / SC8 | tech-design §Interface 5（deriveTaskStoreDir 单源）+ §Testing（EQP/无 watch 审计/录制-回放）+ §Security | UF-1 概览 tab / UF-4 派生行 | — |
