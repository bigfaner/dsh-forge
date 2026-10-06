# Interface Decisions

| Date | Feature | Decision | Rationale | Source |
|---------|---------|----------|-----------|--------|
| 2026-10-06 | knowledge-scope | 知识范围切换 = 官方 Menu 纯项目行（无添加行——添加径归 hero 弹层/左栏「＋」） | 官方件复用 Hard Rule（零自绘 dropdown）；知识面只做浏览范围切换，入口职责不越界（用户裁决） | apps/web/src/views/knowledge/KnowledgeToolbar.tsx |
| 2026-10-06 | dsh-forge-m2-pipeline | 任务域服务面**按领域划分**（forgeTasks / forgeFeatures / forgeProposals / forgeDocs，读写一体）；**废除视图聚合服务**（forgeOverview 方案否决） | MVC：Model 按域内聚，后端 API 独立于前端保持稳定；跨域聚合（ov-head 等）归前端组合多域读；P1 forgeProjects 读写同域先例（用户裁决 2026-10-06） | docs/features/dsh-forge-m2-pipeline/design/tech-design.md §Interfaces |
