# Product Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-19 | dsh-forge-m1 | 应用显示名与 profile 目录名定为 dsh-forge,弃用 desktop-ce 旧建议 | 与产品线同名并与上游 desktop 区分;SC8 共存要求目录名 ≠ desktop | dsh-forge-m1/prd/prd-spec.md §Scope |
| 2026-09-28 | dsh-forge-m4 | M4 存储边界 = 仅 D11 三层身份 + 证据三档 + 确认卡;影子 git 与 runtime_root ①②顺延存储实现里程碑 | O7 本就留待存储实现 PR期定形;IA 里程碑不并存储两线;C7 卡面文案随微调 | dsh-forge-m4/design/tech-design.md §Overview 裁决 T6 |
