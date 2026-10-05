# Architecture Decisions

| Date | Feature | Decision | Rationale | Source |
|---------|---------|----------|-----------|--------|
| 2026-10-06 | knowledge-anchor | 知识面板锚=主视图会话优先（retainedBy.mainView），唯一项目兜底；多项目无会话不猜首个 | root 作用域可读官方会话口径，选首个属猜测；项目拾取器归 M2+ | apps/web/src/workbench/KnowledgePanel.tsx |
