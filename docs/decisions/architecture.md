# Architecture Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-20 | dsh-forge-m1 | 本仓采用 pnpm workspace(apps/ + packages/)布局 | 为 M2+ 一切皆插件预留包边界,对齐上游工程形态 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | Electron 壳路线整体继承上游 apps/desktop,不自选替代框架 | 上游生产实现背书协议缝;替代路线等于重造 dsh | dsh-forge-m1/design/tech-design.md §Overview |
