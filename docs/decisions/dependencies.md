# Dependencies Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-20 | dsh-forge-m1 | desktop-host 以 vendor 源码投影获取,按上游 commit SHA 精确锁定 | 上游无 tag 且 private;升级走显式 diff 对照,构建离线可控 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | vendor 闭包获取定稿:源码投影+闭包解析,弃整树产物拷贝 | 产物不可 diff、体积不可裁剪;投影路线升级可读性好 | dsh-forge-m1/design/tech-design.md §Open Questions |
