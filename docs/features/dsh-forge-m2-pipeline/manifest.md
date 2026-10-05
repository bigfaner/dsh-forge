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
| UI Functions | prd/prd-ui-functions.md | 4 UF：概览 dock tab·三子 tab+三视图（DAG/泳道/排序/搜索）/ 文档 dock tab（mermaid 占位）/ 会话头挂接 pill / 注册表单派生行——左栏不加行、中区不加面板、三签不动 |
| UI Design | ui/ui-design.md | v15 = completed 实际耗时四处呈现(列表/DAG/泳道/抽屉 chip,记录推导);v14 备注移至覆盖率之下;v13 预估耗时 + 参考文档 chip 点击 dock 开 tab（refDocs 映射）+ 目标/结果上下展示 + 全加粗;v12 chip kv + 块标题底色条 + 路径完整展示;v11 顺滑折叠;v10 改动范围双列（commit 优先）+ 合并时间线;128 断言全绿 |

## Traceability

| PRD Section | Design Section | UI Component | Tasks |
|-------------|----------------|--------------|-------|
| Goals · SC7 / SC-M2 | tech-design 待建：动词 API / dispatchPrompt / 派发链 | — | — |
| Goals · SC4 | tech-design 待建：发现面扫描契约 | UF-2 文档 dock tab | — |
| Goals · SC6③ | tech-design 待建：挂接机制 + session.header 缝 | UF-1 任务抽屉 / UF-3 挂接 pill | — |
| Goals · SC2 / SC-branch / SC-NFR / SC8 | tech-design 待建：库布局 / 直读 / 零迁移 | UF-1 概览 tab / UF-4 派生行 | — |
