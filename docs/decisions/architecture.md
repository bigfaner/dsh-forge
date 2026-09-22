# Architecture Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-20 | dsh-forge-m1 | 本仓采用 pnpm workspace(apps/ + packages/)布局 | 为 M2+ 一切皆插件预留包边界,对齐上游工程形态 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | Electron 壳路线整体继承上游 apps/desktop,不自选替代框架 | 上游生产实现背书协议缝;替代路线等于重造 dsh | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-21 | ui-plugin-foundation | 两级插件模型:forge 核心 = 必备插件(内置 bundle 分发、不可禁用、仅作者维护),原「可启停/禁用回归纯壳」语义收缩至第三方插件 | forge 核心为差异化价值必备,不可被用户摘除;扩展性经自有槽位向第三方开放 | proposals/ui-plugin-foundation/proposal.md §Proposed Solution;conventions/product-architecture.md TECH-001 |
| 2026-09-21 | ui-plugin-foundation | 产品数据内核(SQLite:任务索引/项目↔会话挂接/任务 CRUD 数据 API)进 Electron 壳,方向声明,M2/M3 落地 | M2 看板首屏与状态回流的文件扫描成本、挂接关系结构化存储;产品壳自主选择(偏离官方极小 API 面模式) | 同上 §Assumptions Challenged;dsh-forge-m2 prd DF005 |
| 2026-09-21 | ui-plugin-foundation | forge CLI 退役:过渡 = 插件宿主半身 spawn CLI(标准 rpc);终点 = 应用 API(Electron 数据内核)+ dsh tool,CLI 不保留 | 形态终态对齐应用化;任务调度插件化、可替换、不动数据内核 | 同上 §Proposed Solution 架构约束 4 |
| 2026-09-21 | ui-plugin-foundation | ui-plugin-foundation 工程基座(配置化 + spike + 模板 + 断言)独立立项,硬前置 dsh-forge-m2 UI 插件任务;插件清单迁出壳代码为产品级配置(唯一事实源) | 工程决策前置收敛 M2 关键路径;版本对齐纪律先于第一个自有插件;消灭「清单焊死壳代码」 | 同上 §Urgency/§In Scope;features/dsh-forge-m2 manifest Dependencies |
