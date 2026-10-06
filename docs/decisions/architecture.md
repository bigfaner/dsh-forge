# Architecture Decisions

| Date | Feature | Decision | Rationale | Source |
|---------|---------|----------|-----------|--------|
| 2026-10-06 | knowledge-anchor | 知识面板锚=主视图会话优先（retainedBy.mainView），唯一项目兜底；多项目无会话不猜首个 | root 作用域可读官方会话口径，选首个属猜测；项目拾取器归 M2+ | apps/web/src/workbench/KnowledgePanel.tsx |
| 2026-10-06 | dsh-forge-m2-pipeline | 每工作区 forge.db **惰性首开 + 失败隔离**（每库每进程首次触达 open+migrate+开库断言；失败 = 工作区隔离态，应用照常）；视图刷新 = **写推送事件**（core 写动词闭包 → process.send[child IPC] → main event 分支 → webContents.send → renderer 重取） | 启动零成本 + 单库腐化不瘫痪全局；桥协议（ChildToMainMessage）为产品自有代码，扩消息变体零上游改动；「即时」判据 = 写入返回后单次重取即见新值 + 事件 ≤500ms（用户裁决 2026-10-06；db-schema §7-11/12 开口闭合） | docs/features/dsh-forge-m2-pipeline/design/tech-design.md §Overview / §交互二 |
| 2026-10-06 | dsh-forge-m2-pipeline | **validateFeatureTasks（原 validateStore 更名）：一次只校验一个 feature 的任务子图**（五类检查限定该子图；新入库 feature 由发现面/诊断入口逐个送校）；开库检查收窄为结构健全性（版本门 + foreign_key_check）；三层校验职责 = 写时增量断言（承重）· validateFeatureTasks 逐 feature · 开库结构检查 | 大仓（旧线 178 feature）全库复检成本高；写时增量断言已覆盖漂移防护；动词面单 feature 语义最简（用户裁决 2026-10-06） | docs/features/dsh-forge-m2-pipeline/design/tech-design.md §Interface 1 / §交互二 |
