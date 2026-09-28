# Interface Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-20 | dsh-forge-m1 | session-focus 经 carrier 注入通道实现,spike 验证,fallback=前置+toast | 不修改上游 GUI(TECH-ui-reuse-001);通道不可用时有零侵入降级 | dsh-forge-m1/design/tech-design.md §Interfaces |
| 2026-09-23 | dsh-forge-m3 | 工具写集仅对 data_authority='sqlite' 项目开放;files 项目返回明确提示走 CLI(业务提示非错误) | 双形态过渡纪律(G8/SC7);写面始终单写者 | dsh-forge-m3/design/tech-design.md §Interface 2 权限界 |
| 2026-09-28 | dsh-forge-m4 | 投影写通道 = client relay 直调上游 workspaceController remote 动词,内核持期望状态幂等全量重推 | verbs 已在宿主 typert 面(sessionController.follow 先例);零上游修改零新 host 代码;弃主进程直写 dsh 存储 | dsh-forge-m4/design/tech-design.md §Interface 2 裁决 T3 |
